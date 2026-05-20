/**
 * frontend/src/app/login-callback/login-callback.component.ts
 */

import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login-callback',
  standalone: true,
  templateUrl: './login-callback.component.html',
  styleUrl: './login-callback.component.css',
})
export class LoginCallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  message = 'Completing sign-in handshake…';

  ngOnInit(): void {
    const map = this.route.snapshot.queryParamMap;

    const err = map.get('error');
    if (err !== null && err.trim() !== '') {
      this.auth.handleCallbackError(err);
      this.message = 'Authentication was rejected.';
      void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.auth.registerHandshakeListener();
    this.auth.hydrateTokenFromStorage();
    this.auth.ingestTokenFromQueryParams(map);

    this.auth.bootstrapSession().subscribe({
      next: (state) => {
        if (state.isAuthenticated) {
          this.message = 'Session synchronized. Redirecting…';
          void this.router.navigate(['/dashboard'], { replaceUrl: true });
        } else {
          this.message = 'No active session. Returning to sign-in…';
          void this.router.navigate(['/login'], { replaceUrl: true });
        }
      },
      error: () => {
        void this.router.navigate(['/login'], { replaceUrl: true });
      },
    });
  }
}
