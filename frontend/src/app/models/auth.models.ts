/**
 * frontend/src/app/models/auth.models.ts
 * Strongly typed identity contracts — no `any`.
 */

export type AuthProviderKey = 'google' | 'facebook' | 'github';

/** Public user profile returned by the API */
export interface PublicUserProfile {
  id: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  linkedProviders: AuthProviderKey[];
  lastLoginAt: string | null;
  lastLoginProvider: AuthProviderKey | null;
  createdAt: string;
  updatedAt: string;
}

/** Standard JWT access-token claims (API-signed payload) */
export interface JwtClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  iat: number;
  exp: number;
}

/** Parsed bearer token with decoded claims (client-side view) */
export interface JwtToken {
  readonly raw: string;
  readonly claims: JwtClaims;
  readonly expiresAtEpochMs: number;
}

/** GET /auth/session */
export interface AuthSessionResponse {
  success: boolean;
  authenticated: boolean;
  user: PublicUserProfile;
  accessToken: string;
}

/** GET /auth/me */
export interface AuthMeResponse {
  success: boolean;
  user: PublicUserProfile;
}

/** postMessage payload from OAuth popup handshake HTML */
export interface AuthHandshakeMessage {
  type: string;
  status: 'success' | 'error' | 'noop';
  user?: PublicUserProfile;
  issuedAt?: string;
  message?: string;
}

/** Unified client authentication state (BehaviorSubject value shape) */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: PublicUserProfile | null;
  accessToken: string | null;
  errorMessage: string | null;
}

export const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  accessToken: null,
  errorMessage: null,
};

export interface DecodedJwtEnvelope {
  claims: JwtClaims | null;
  isExpired: boolean;
}

export interface JwtTokenEnvelope {
  token: JwtToken | null;
  isExpired: boolean;
}

/** Known optional query keys when SPA is redirected back from OAuth error paths */
export interface OAuthErrorQuery {
  readonly error: string | null;
}
