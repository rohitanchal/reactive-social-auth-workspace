/**
 * frontend/src/app/services/auth.service.ts
 * Central identity engine: private BehaviorSubject, public read-only Observable stream,
 * localStorage persistence, and hard client eviction on logout.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, inject } from '@angular/core';
import { ParamMap } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  distinctUntilChanged,
  map,
  of,
  tap,
} from 'rxjs';

import {
  AuthHandshakeMessage,
  AuthMeResponse,
  AuthProviderKey,
  AuthSessionResponse,
  AuthState,
  DecodedJwtEnvelope,
  INITIAL_AUTH_STATE,
  JwtClaims,
  JwtToken,
  JwtTokenEnvelope,
  PublicUserProfile,
} from '../models/auth.models';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'social_auth_access_token';
const LEGACY_SESSION_STORAGE_KEY = 'social_auth_access_token';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthHandshakeMessage(value: unknown): value is AuthHandshakeMessage {
  if (!isRecord(value)) {
    return false;
  }
  const type = value['type'];
  const status = value['status'];
  if (typeof type !== 'string' || typeof status !== 'string') {
    return false;
  }
  return status === 'success' || status === 'error' || status === 'noop';
}

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly http = inject(HttpClient);

  private readonly stateSubject = new BehaviorSubject<AuthState>(INITIAL_AUTH_STATE);

  /**
   * Immutable-style snapshots for consumers (emit new object references).
   */
  readonly state$: Observable<AuthState> = this.stateSubject.pipe(
    map((s) => ({ ...s })),
    distinctUntilChanged(
      (a, b) =>
        a.isLoading === b.isLoading &&
        a.isAuthenticated === b.isAuthenticated &&
        a.accessToken === b.accessToken &&
        a.errorMessage === b.errorMessage &&
        (a.user?.id ?? '') === (b.user?.id ?? '')
    )
  );

  readonly authenticated$: Observable<boolean> = this.state$.pipe(
    map((s) => s.isAuthenticated),
    distinctUntilChanged()
  );

  private messageListener: ((ev: MessageEvent) => void) | null = null;

  ngOnDestroy(): void {
    this.teardownHandshakeListener();
  }

  get snapshot(): AuthState {
    return { ...this.stateSubject.value };
  }

  get accessToken(): string | null {
    return this.stateSubject.value.accessToken;
  }

  get oauthBaseUrl(): string {
    const p = environment.authRoutePrefix.startsWith('/')
      ? environment.authRoutePrefix
      : `/${environment.authRoutePrefix}`;
    return `${environment.apiBaseUrl}${p}`.replace(/\/+$/, '');
  }

  getProviderLoginHref(provider: AuthProviderKey): string {
    return `${this.oauthBaseUrl}/${provider}`;
  }

  private get sessionUrl(): string {
    return `${this.oauthBaseUrl}/session`;
  }

  private get meUrl(): string {
    return `${this.oauthBaseUrl}/me`;
  }

  private get logoutUrl(): string {
    return `${this.oauthBaseUrl}/logout`;
  }

  /**
   * Used by functional AuthGuard — evaluates a state snapshot (not `any`).
   */
  isSessionViable(state: AuthState): boolean {
    return (
      state.isAuthenticated &&
      state.accessToken !== null &&
      state.accessToken.trim() !== '' &&
      this.isTokenFresh(state.accessToken)
    );
  }

  registerHandshakeListener(): void {
    if (this.messageListener || typeof window === 'undefined') {
      return;
    }
    this.messageListener = (event: MessageEvent) => {
      if (event.origin !== environment.clientOrigin) {
        return;
      }
      if (!isAuthHandshakeMessage(event.data)) {
        return;
      }
      const data: AuthHandshakeMessage = event.data;
      if (data.type !== environment.authHandshakeMessageType) {
        return;
      }
      if (data.status === 'success' && data.user) {
        this.patchState({
          isAuthenticated: true,
          isLoading: false,
          user: data.user,
          errorMessage: null,
        });
        this.bootstrapSession().subscribe();
      }
    };
    window.addEventListener('message', this.messageListener);
  }

  teardownHandshakeListener(): void {
    if (this.messageListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }

  initialize(): Observable<AuthState> {
    this.patchState({ isLoading: true, errorMessage: null });
    this.registerHandshakeListener();
    return this.bootstrapSession();
  }

  bootstrapSession(): Observable<AuthState> {
    return this.http
      .get<AuthSessionResponse>(this.sessionUrl, { withCredentials: true })
      .pipe(
        tap((response) => {
          this.persistToken(response.accessToken);
          this.patchState({
            isAuthenticated: true,
            isLoading: false,
            user: response.user,
            accessToken: response.accessToken,
            errorMessage: null,
          });
        }),
        map(() => this.snapshot),
        catchError(() => {
          this.purgeAllClientAuthArtifacts(false);
          this.patchState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            accessToken: null,
            errorMessage: null,
          });
          return of(this.snapshot);
        })
      );
  }

  fetchMe(): Observable<PublicUserProfile> {
    return this.http.get<AuthMeResponse>(this.meUrl, { withCredentials: true }).pipe(
      tap((response) => this.patchState({ user: response.user, isAuthenticated: true })),
      map((response) => response.user)
    );
  }

  /**
   * Server clears HttpOnly cookie; client purges bearer material and forces a full document
   * navigation so the browser cannot resurrect protected views from the bfcache/back stack.
   */
  logout(): Observable<void> {
    return this.http
      .post<{ success: boolean }>(this.logoutUrl, {}, { withCredentials: true })
      .pipe(
        map(() => undefined),
        catchError(() => of(undefined)),
        tap(() => {
          this.purgeAllClientAuthArtifacts(true);
        })
      );
  }

  /**
   * Clears observable state, storage, and optionally performs a hard navigation to `/login`.
   */
  purgeAllClientAuthArtifacts(performHardNavigation: boolean): void {
    this.teardownHandshakeListener();
    this.clearBrowserStorage();
    this.patchState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      errorMessage: null,
    });
    if (performHardNavigation && typeof window !== 'undefined') {
      const target = `${environment.clientOrigin.replace(/\/+$/, '')}/login`;
      window.location.replace(target);
    }
  }

  clearSession(): void {
    this.purgeAllClientAuthArtifacts(false);
  }

  handleCallbackError(param: string | null): void {
    if (!param) {
      return;
    }
    this.patchState({
      isLoading: false,
      isAuthenticated: false,
      errorMessage: decodeURIComponent(param),
    });
  }

  ingestTokenFromQueryParams(map: ParamMap): void {
    const raw =
      map.get('access_token') ?? map.get('token') ?? map.get('jwt');
    if (!raw || raw.trim() === '') {
      return;
    }
    const trimmed = raw.trim();
    const envelope = this.parseJwtToken(trimmed);
    if (!envelope.token || envelope.isExpired) {
      return;
    }
    this.persistToken(trimmed);
    this.patchState({
      accessToken: trimmed,
      errorMessage: null,
    });
  }

  decodeJwt(token: string | null): DecodedJwtEnvelope {
    if (!token) {
      return { claims: null, isExpired: true };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { claims: null, isExpired: true };
    }
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
      const parsed: unknown = JSON.parse(atob(pad));
      if (!isRecord(parsed)) {
        return { claims: null, isExpired: true };
      }
      const sub = parsed['sub'];
      const exp = parsed['exp'];
      if (typeof sub !== 'string' || typeof exp !== 'number') {
        return { claims: null, isExpired: true };
      }
      const claims: JwtClaims = {
        sub,
        email: typeof parsed['email'] === 'string' ? parsed['email'] : null,
        emailVerified: Boolean(parsed['emailVerified']),
        iat: typeof parsed['iat'] === 'number' ? parsed['iat'] : 0,
        exp,
      };
      const expired = claims.exp * 1000 <= Date.now();
      return { claims, isExpired: expired };
    } catch {
      return { claims: null, isExpired: true };
    }
  }

  parseJwtToken(raw: string): JwtTokenEnvelope {
    const { claims, isExpired } = this.decodeJwt(raw);
    if (!claims) {
      return { token: null, isExpired: true };
    }
    const token: JwtToken = {
      raw,
      claims,
      expiresAtEpochMs: claims.exp * 1000,
    };
    return { token, isExpired };
  }

  isTokenFresh(token: string | null = this.accessToken): boolean {
    const d = this.decodeJwt(token);
    return Boolean(d.claims && !d.isExpired);
  }

  getSecondsUntilExpiry(token: string | null = this.accessToken): number {
    const d = this.decodeJwt(token);
    if (!d.claims || d.isExpired) {
      return 0;
    }
    return Math.max(0, Math.floor(d.claims.exp - Date.now() / 1000));
  }

  hydrateTokenFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    let token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      const legacy = sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (legacy) {
        token = legacy;
        this.persistToken(legacy);
        sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      }
    }
    if (token && this.isTokenFresh(token)) {
      this.patchState({ accessToken: token });
    }
  }

  private persistToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, token);
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  }

  private clearBrowserStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  }

  private patchState(partial: Partial<AuthState>): void {
    this.stateSubject.next({ ...this.stateSubject.value, ...partial });
  }
}
