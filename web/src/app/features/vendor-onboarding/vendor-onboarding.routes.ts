import { Routes } from '@angular/router';
import { authGuard } from '../../shared/auth.guard';
import { vendorProfileCompleteGuard } from './vendor-profile.guard';

/** Story: vendor-onboarding routes, rendered inside the signed-in layout shell. */
export const VENDOR_ONBOARDING_ROUTES: Routes = [
  {
    path: 'vendor',
    loadComponent: () => import('../../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'profile',
        loadComponent: () => import('./vendor-profile-form.component').then(m => m.VendorProfileFormComponent),
      },
      {
        path: 'dashboard',
        canActivate: [vendorProfileCompleteGuard],
        loadComponent: () => import('./vendor-dashboard.component').then(m => m.VendorDashboardComponent),
      },
    ],
  },
];
