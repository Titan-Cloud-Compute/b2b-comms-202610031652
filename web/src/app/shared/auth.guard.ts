import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PREVIEW_MODE } from './preview/preview-mode';

/**
 * Requires a signed-in session. Unauthenticated visitors are sent to /login
 * with a `returnUrl` query param so they land back where they were after login.
 * Skips the check entirely in PREVIEW_MODE so static design-review mockups
 * render without needing a session.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  if (PREVIEW_MODE) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Requires the signed-in user to hold one of the roles listed in
 * `route.data['roles']`. Unauthenticated visitors are redirected to /login
 * (same behaviour as authGuard). Authenticated users who lack the required
 * role are sent to /dashboard. SUPER_ADMIN is treated as ADMIN for the
 * purpose of role comparison.
 *
 * Pass an empty `roles` array (or omit the key entirely) to allow any
 * authenticated user through.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  if (PREVIEW_MODE) return true;
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const roles = route.data['roles'] as string[] | undefined;
  if (!roles || roles.length === 0) return true;

  const userRole = auth.user()?.role;
  // SUPER_ADMIN is considered equivalent to ADMIN for route-level access.
  const effectiveRole = userRole === 'SUPER_ADMIN' ? 'ADMIN' : userRole;

  if (effectiveRole && roles.includes(effectiveRole)) return true;

  return router.createUrlTree(['/dashboard']);
};
