import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';
import { ChannelDto, CustomerOptionDto, SharedChannelApiService } from './shared-channel-api.service';

@Component({
  selector: 'app-channel-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="channels-page">
      <header class="page-header">
        <h1>Channels</h1>
        <p class="subtitle">Shared communication channels between vendors and customers.</p>
      </header>

      @if (canCreate()) {
        <section class="card" data-testid="create-channel">
          <h2>New shared channel</h2>
          <form (ngSubmit)="create()">
            <div class="form-group">
              <label for="channel-name">Channel name</label>
              <input id="channel-name" name="channelName" type="text" [(ngModel)]="name" data-testid="channel-name" />
            </div>
            <fieldset class="form-group" data-testid="customer-picker">
              <legend>Customers</legend>
              @for (c of customers(); track c.id) {
                <label class="check">
                  <input type="checkbox" [checked]="selected().has(c.id)" (change)="toggle(c.id)" [attr.data-testid]="'customer-' + c.id" />
                  {{ c.name || c.email }}
                </label>
              } @empty {
                <p class="muted">No customers available yet.</p>
              }
            </fieldset>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <button type="submit" class="btn-primary" data-testid="create-channel-submit"
                    [disabled]="busy() || !name.trim() || selected().size === 0">Create channel</button>
          </form>
        </section>
      }

      <section class="card">
        <h2>Your channels</h2>
        <ul class="channel-list" data-testid="channel-list">
          @for (ch of channels(); track ch.id) {
            <li data-testid="channel-item">
              <a [routerLink]="['/channels', ch.id]">{{ ch.name }}</a>
              <span class="muted">{{ memberSummary(ch) }}</span>
            </li>
          } @empty {
            <li class="muted" data-testid="channel-empty">{{ loading() ? 'Loading…' : 'No channels yet.' }}</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .channels-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 1.5rem; }
    .card { margin-bottom: 1.5rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; border: 0; padding: 0; }
    .check { display: flex; gap: 0.5rem; align-items: center; }
    .channel-list { list-style: none; padding: 0; margin: 0; }
    .channel-list li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.5rem 0; }
    .muted { opacity: 0.7; }
  `],
})
export class ChannelListComponent implements OnInit {
  private readonly api = inject(SharedChannelApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly channels = signal<ChannelDto[]>([]);
  readonly customers = signal<CustomerOptionDto[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly canCreate = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  });
  name = '';

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadChannels(), this.canCreate() ? this.loadCustomers() : Promise.resolve()]);
  }

  async loadChannels(): Promise<void> {
    try {
      const list = await this.api.listChannels();
      this.channels.set(Array.isArray(list) ? list : []);
    } catch {
      this.channels.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCustomers(): Promise<void> {
    try {
      const list = await this.api.listCustomers();
      this.customers.set(Array.isArray(list) ? list : []);
    } catch {
      this.customers.set([]);
    }
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selected.set(next);
  }

  memberSummary(ch: ChannelDto): string {
    const members = Array.isArray(ch.members) ? ch.members : [];
    return members.map(m => m.name || m.email || m.role.toLowerCase()).join(', ');
  }

  async create(): Promise<void> {
    const name = this.name.trim();
    if (!name || this.selected().size === 0) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const ch = await this.api.createChannel(name, [...this.selected()]);
      this.name = '';
      this.selected.set(new Set());
      await this.loadChannels();
      if (ch?.id) await this.router.navigate(['/channels', ch.id]);
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'Could not create channel.');
    } finally {
      this.busy.set(false);
    }
  }
}
