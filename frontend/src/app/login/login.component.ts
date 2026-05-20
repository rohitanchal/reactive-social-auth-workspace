/**
 * frontend/src/app/login/login.component.ts
 * Standalone sign-in surface — hydrates auth state and exposes OAuth entry points.
 */

import { AsyncPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthProviderKey } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

interface ProviderLink {
  readonly key: AuthProviderKey;
  readonly label: string;
  readonly sublabel: string;
  readonly href: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  readonly auth = inject(AuthService);

  readonly state$ = this.auth.state$;

  get primaryProviderLinks(): readonly ProviderLink[] {
    return [
      {
        key: 'google',
        label: 'Google',
        sublabel: 'Workspace or personal Google account.',
        href: this.auth.getProviderLoginHref('google'),
      },
      {
        key: 'github',
        label: 'GitHub',
        sublabel: 'Developer identity via GitHub OAuth.',
        href: this.auth.getProviderLoginHref('github'),
      },
    ];
  }

  get facebookLink(): ProviderLink {
    return {
      key: 'facebook',
      label: 'Facebook',
      sublabel: 'Optional login with Meta.',
      href: this.auth.getProviderLoginHref('facebook'),
    };
  }

  ngOnInit(): void {
    this.auth.hydrateTokenFromStorage();
    this.auth.registerHandshakeListener();
  }
}
