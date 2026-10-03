import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VendorApi, VendorProfileInput } from './vendor-api.service';

@Component({
  selector: 'app-vendor-profile-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="vendor-page">
      <h1>Vendor profile</h1>
      <p class="subtitle">Tell us about your company to unlock the vendor dashboard.</p>
      <form data-testid="vendor-profile-form" (ngSubmit)="submit()">
        <fieldset>
          <legend>Company profile</legend>
          <label for="vp-company">Company name</label>
          <input id="vp-company" name="companyName" data-testid="vendor-company-input" [(ngModel)]="model.companyName" required />
        </fieldset>
        <fieldset>
          <legend>Contact details</legend>
          <label for="vp-contact-name">Contact name</label>
          <input id="vp-contact-name" name="contactName" data-testid="vendor-contact-name-input" [(ngModel)]="model.contactName" required />
          <label for="vp-contact-email">Contact email</label>
          <input id="vp-contact-email" name="contactEmail" type="email" data-testid="vendor-contact-email-input" [(ngModel)]="model.contactEmail" required />
          <label for="vp-contact-phone">Contact phone</label>
          <input id="vp-contact-phone" name="contactPhone" data-testid="vendor-contact-phone-input" [(ngModel)]="model.contactPhone" />
        </fieldset>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn-primary" data-testid="vendor-profile-submit" [disabled]="saving()">Save profile</button>
      </form>
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 640px; margin: 0 auto; padding: 2rem 1rem; }
    fieldset { border: none; padding: 0; margin: 0 0 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
    .subtitle { color: var(--color-text-secondary); }
    .error { color: var(--color-error, #b91c1c); }
  `],
})
export class VendorProfileFormComponent implements OnInit {
  private api = inject(VendorApi);
  private router = inject(Router);

  model: VendorProfileInput = { companyName: '', contactName: '', contactEmail: '', contactPhone: '' };
  saving = signal(false);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const p = await this.api.getProfile();
      if (p) {
        this.model = {
          companyName: p.companyName,
          contactName: p.contactName,
          contactEmail: p.contactEmail,
          contactPhone: p.contactPhone ?? '',
        };
      }
    } catch {
      /* new vendor — empty form */
    }
  }

  async submit(): Promise<void> {
    const m = this.model;
    if (!m.companyName.trim() || !m.contactName.trim() || !m.contactEmail.trim()) {
      this.error.set('Company name, contact name and contact email are required.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.saveProfile(m);
      await this.router.navigate(['/vendor/dashboard']);
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not save your profile.');
    } finally {
      this.saving.set(false);
    }
  }
}
