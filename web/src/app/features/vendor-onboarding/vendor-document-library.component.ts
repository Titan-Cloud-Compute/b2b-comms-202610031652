import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { VendorApi, VendorDocument, VENDOR_STATUS_LABELS } from './vendor-api.service';

@Component({
  selector: 'app-vendor-document-library',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="library" data-testid="vendor-document-library">
      <h2>Compliance documents</h2>
      <label for="vd-upload">Upload a compliance document</label>
      <input id="vd-upload" type="file" data-testid="vendor-document-upload" (change)="onFile($event)" [disabled]="uploading()" />
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (docs().length === 0) {
        <p class="empty" data-testid="vendor-document-empty">No documents uploaded yet.</p>
      } @else {
        <ul>
          @for (d of docs(); track d.id) {
            <li data-testid="vendor-document-row">
              <span data-testid="vendor-document-name">{{ d.filename }}</span>
              <span class="badge" data-testid="vendor-document-status">{{ label(d) }}</span>
              <span class="date">{{ d.uploadedAt | date: 'medium' }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    ul { list-style: none; padding: 0; }
    li { display: flex; gap: 1rem; align-items: center; padding: 0.5rem 0; }
    .badge { padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--color-warning-bg, #fef3c7); }
    .error { color: var(--color-error, #b91c1c); }
  `],
})
export class VendorDocumentLibraryComponent implements OnInit {
  private api = inject(VendorApi);

  docs = signal<VendorDocument[]>([]);
  uploading = signal(false);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  label(d: VendorDocument): string {
    return VENDOR_STATUS_LABELS[d.status] ?? d.status;
  }

  async refresh(): Promise<void> {
    try {
      this.docs.set((await this.api.listDocuments()) ?? []);
    } catch {
      this.error.set('Could not load documents.');
    }
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const doc = await this.api.uploadDocument(file);
      this.docs.set([doc, ...this.docs().filter((d) => d.id !== doc.id)]);
    } catch (e) {
      this.error.set((e as Error)?.message || 'Upload failed.');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }
}
