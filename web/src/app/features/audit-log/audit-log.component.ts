import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../shared/api/api-client.service';

export type AuditActorType = 'USER' | 'ADMIN' | 'SYSTEM';

export interface AuditLogRow {
  id: string;
  actor: AuditActorType;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  payloadJson: unknown;
  createdAt: string;
}

interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

/** Admin-only, newest-first audit trail of user actions and system events. */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="audit-page">
      <header class="page-header">
        <h1>Audit Log</h1>
        <p class="subtitle">User actions and system events, newest first</p>
      </header>

      <form class="filters" (ngSubmit)="applyFilters()">
        <label>
          Actor
          <select name="actor" [(ngModel)]="actorFilter" data-testid="audit-log-actor-filter">
            <option value="">All</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>
        <label>
          Action
          <input name="action" [(ngModel)]="actionFilter" placeholder="e.g. auth." data-testid="audit-log-action-filter" />
        </label>
        <button type="submit" data-testid="audit-log-apply">Apply</button>
      </form>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <table class="audit-table" data-testid="audit-log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>User</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.id) {
            <tr data-testid="audit-log-row">
              <td data-testid="audit-log-time">{{ row.createdAt | date: 'medium' }}</td>
              <td data-testid="audit-log-actor">{{ row.actor }}</td>
              <td data-testid="audit-log-user">{{ userLabel(row) }}</td>
              <td data-testid="audit-log-action">{{ row.action }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="empty">{{ loading() ? 'Loading…' : 'No audit events found.' }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="pager">
        <button type="button" [disabled]="page() <= 1 || loading()" (click)="goTo(page() - 1)" data-testid="audit-log-prev">Previous</button>
        <span>Page {{ page() }} of {{ pageCount() }}</span>
        <button type="button" [disabled]="page() >= pageCount() || loading()" (click)="goTo(page() + 1)" data-testid="audit-log-next">Next</button>
      </div>
    </div>
  `,
  styles: [`
    .audit-page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    .subtitle { color: var(--color-text-secondary); }
    .filters { display: flex; gap: 1rem; align-items: flex-end; margin: 1rem 0; flex-wrap: wrap; }
    .filters label { display: flex; flex-direction: column; gap: 0.25rem; }
    .audit-table { width: 100%; border-collapse: collapse; }
    .audit-table th, .audit-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    .empty { text-align: center; color: var(--color-text-secondary); }
    .pager { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
    .error { color: var(--color-error); }
  `],
})
export class AuditLogComponent implements OnInit {
  private readonly api = inject(ApiClient);

  readonly rows = signal<AuditLogRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  actorFilter = '';
  actionFilter = '';

  ngOnInit(): void {
    void this.load();
  }

  pageCount(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  userLabel(row: AuditLogRow): string {
    if (row.actor === 'SYSTEM') return 'System';
    return row.actorEmail ?? row.actorUserId ?? '—';
  }

  applyFilters(): void {
    this.page.set(1);
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.get<AuditLogPage | AuditLogRow[]>('admin/audit-log', {
        params: {
          actor: this.actorFilter || undefined,
          action: this.actionFilter.trim() || undefined,
          page: this.page(),
          pageSize: PAGE_SIZE,
        },
      });
      const rows = Array.isArray(res) ? res : (res?.rows ?? []);
      const sorted = [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      this.rows.set(sorted);
      this.total.set(Array.isArray(res) ? rows.length : (res?.total ?? rows.length));
    } catch {
      this.error.set('Could not load the audit log.');
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
