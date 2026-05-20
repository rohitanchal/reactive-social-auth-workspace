/**
 * frontend/src/app/dashboard/dashboard.component.ts
 * Workspace shell — consumes central auth stream and coordinates server logout.
 */

import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthProviderKey, PublicUserProfile } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);

  readonly state$ = this.auth.state$;

  logout(): void {
    this.auth.logout().subscribe();
  }

  /** Provider used for the session badge (last login, else first linked). */
  activeAuthProvider(user: PublicUserProfile): AuthProviderKey | null {
    return user.lastLoginProvider ?? user.linkedProviders[0] ?? null;
  }

  badgeLabel(user: PublicUserProfile): string {
    const p = this.activeAuthProvider(user);
    return p ?? 'account';
  }

  /** Maps provider to Bootstrap badge palette for quick visual scanning. */
  badgeClassList(user: PublicUserProfile): string[] {
    const p = this.activeAuthProvider(user);
    const tone =
      p === 'google'
        ? 'bg-success'
        : p === 'github'
          ? 'bg-secondary'
          : p === 'facebook'
            ? 'bg-primary'
            : 'bg-secondary';
    return ['badge', 'text-capitalize', 'px-3', 'py-2', tone];
  }

  avatarSrc(user: PublicUserProfile): string {
    return user.avatarUrl ?? '/favicon.ico';
  }
}
