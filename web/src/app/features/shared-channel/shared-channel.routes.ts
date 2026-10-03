import { Routes } from '@angular/router';
import { authGuard } from '../../shared/auth.guard';

/** Shared-channel routes, rendered inside the signed-in layout shell. */
export const SHARED_CHANNEL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('../../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: 'channels',
        loadComponent: () => import('./channel-list.component').then(m => m.ChannelListComponent),
      },
      {
        path: 'channels/:id',
        loadComponent: () => import('./channel-detail.component').then(m => m.ChannelDetailComponent),
      },
    ],
  },
];
