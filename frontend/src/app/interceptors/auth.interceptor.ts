/**
 * frontend/src/app/interceptors/auth.interceptor.ts
 * Functional HTTP interceptor — attaches Bearer credentials for API-origin requests.
 */

import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const base = environment.apiBaseUrl.replace(/\/+$/, '');
  const normalizedUrl = req.url.replace(/\/+$/, '');
  const targetsBackend =
    normalizedUrl === base || normalizedUrl.startsWith(`${base}/`);

  if (!targetsBackend) {
    return next(req);
  }

  const token = auth.accessToken;
  if (!token || !auth.isTokenFresh(token)) {
    return next(req.clone({ withCredentials: true }));
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    })
  );
};
