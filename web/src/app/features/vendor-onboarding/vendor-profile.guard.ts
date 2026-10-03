import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { VendorApi } from './vendor-api.service';

/** Lets the vendor into the dashboard only once their company profile is complete. */
export const vendorProfileCompleteGuard: CanActivateFn = async () => {
  const api = inject(VendorApi);
  const router = inject(Router);
  try {
    const profile = await api.getProfile();
    if (profile?.completedAt) return true;
  } catch {
    /* fall through to the profile form */
  }
  return router.createUrlTree(['/vendor/profile']);
};
