/**
 * frontend/src/app/guards/auth.guard.ts
 * Functional route guard — requires a fresh bearer session before entering protected routes.
 */

import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { Observable, filter, map, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.state$.pipe(
    filter((state) => !state.isLoading),
    take(1),
    map((state) => {
      if (auth.isSessionViable(state)) {
        return true;
      }
      return router.createUrlTree(['/login'], {
        queryParams: { reason: 'auth_required' },
      });
    })
  );
};
