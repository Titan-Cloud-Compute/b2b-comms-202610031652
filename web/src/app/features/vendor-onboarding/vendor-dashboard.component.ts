import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VendorApi, VendorProfile } from './vendor-api.service';
import { VendorDocumentLibraryComponent } from './vendor-document-library.component';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [RouterLink, VendorDocumentLibraryComponent],
  template: `
    <div class="vendor-page" data-testid="vendor-dashboard">
      <header>
        <h1>Vendor dashboard</h1>
        @if (profile(); as p) {
          <p class="company" data-testid="vendor-company-name">{{ p.companyName }}</p>
          <p class="contact">{{ p.contactName }} · {{ p.contactEmail }}</p>
        }
        <a routerLink="/vendor/profile">Edit profile</a>
      </header>
      <app-vendor-document-library />
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .company { font-weight: 600; }
  `],
})
export class VendorDashboardComponent implements OnInit {
  private api = inject(VendorApi);
  profile = signal<VendorProfile | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.profile.set(await this.api.getProfile());
    } catch {
      this.profile.set(null);
    }
  }
}
