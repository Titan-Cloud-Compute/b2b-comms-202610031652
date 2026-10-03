import { Routes } from '@angular/router';
import { authGuard, roleGuard } from '../shared/auth.guard';
import { VENDOR_ONBOARDING_ROUTES } from './vendor-onboarding/vendor-onboarding.routes';
import { SHARED_CHANNEL_ROUTES } from './shared-channel/shared-channel.routes';

/**
 * Feature route registry.
 *
 * Each story appends its Angular routes to this array.
 * app.routes.ts spreads FEATURE_ROUTES before the wildcard catch-all so new
 * feature routes are picked up automatically.
 *
 * Example (in features/my-feature/my-feature.routes.ts):
 *
 *   import { FEATURE_ROUTES } from '../index';
 *   FEATURE_ROUTES.push({ path: 'my-feature', loadComponent: () => ... });
 *
 * Or add routes here directly.
 */
export const FEATURE_ROUTES: Routes = [
  // Story: audit-log — admin-only audit trail, rendered inside the app shell.
  {
    path: 'admin/audit-log',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true, roles: ['ADMIN'] },
    canActivate: [authGuard, roleGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./audit-log/audit-log.component').then(m => m.AuditLogComponent),
      },
    ],
  },
  // Story: vendor-onboarding
  ...VENDOR_ONBOARDING_ROUTES,
  // Story: shared-channel — /channels and /channels/:id inside the layout shell.
  ...SHARED_CHANNEL_ROUTES,
];
