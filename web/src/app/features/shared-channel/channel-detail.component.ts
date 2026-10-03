import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChannelDto, ChannelMessageDto, SharedChannelApiService } from './shared-channel-api.service';

const POLL_MS = 5000;

@Component({
  selector: 'app-channel-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="channel-page">
      <a routerLink="/channels" class="back">← All channels</a>
      <header class="page-header">
        <h1 data-testid="channel-title">{{ channel()?.name || 'Channel' }}</h1>
      </header>
      @if (notFound()) {
        <p class="error" role="alert">This channel does not exist or you are not a member.</p>
      } @else {
        <ul class="thread" data-testid="message-thread">
          @for (m of messages(); track m.id) {
            <li data-testid="message-item">
              <strong>{{ m.authorName || 'Member' }}</strong>
              <span class="muted">{{ m.createdAt | date: 'short' }}</span>
              <p>{{ m.body }}</p>
            </li>
          } @empty {
            <li class="muted">No messages yet.</li>
          }
        </ul>
        <form class="composer" (ngSubmit)="send()">
          <label for="message-body" class="sr-only">Message</label>
          <textarea id="message-body" name="body" rows="2" [(ngModel)]="draft" data-testid="message-input"></textarea>
          <button type="submit" class="btn-primary" data-testid="message-send" [disabled]="busy() || !draft.trim()">Send</button>
        </form>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      }
    </div>
  `,
  styles: [`
    .channel-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .thread { list-style: none; padding: 0; margin: 1rem 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .thread p { margin: 0.25rem 0 0; white-space: pre-wrap; }
    .composer { display: flex; gap: 0.5rem; align-items: flex-end; }
    .composer textarea { flex: 1; }
    .muted { opacity: 0.7; margin-left: 0.5rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `],
})
export class ChannelDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(SharedChannelApiService);
  private readonly route = inject(ActivatedRoute);

  readonly channel = signal<ChannelDto | null>(null);
  readonly messages = signal<ChannelMessageDto[]>([]);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  draft = '';

  private id = '';
  private source: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      this.channel.set(await this.api.getChannel(this.id));
      await this.refresh();
    } catch {
      this.notFound.set(true);
      return;
    }
    this.openStream();
    // Polling fallback: keeps the thread live even when SSE is unavailable.
    this.pollTimer = setInterval(() => { void this.refresh(); }, POLL_MS);
  }

  ngOnDestroy(): void {
    this.source?.close();
    this.source = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource(this.api.streamUrl(this.id), { withCredentials: true });
      es.addEventListener('message', (evt) => this.onEvent((evt as MessageEvent<string>).data));
      es.onerror = () => { es.close(); if (this.source === es) this.source = null; };
      this.source = es;
    } catch {
      this.source = null;
    }
  }

  private onEvent(raw: string): void {
    try {
      const msg = JSON.parse(raw) as ChannelMessageDto;
      if (msg && msg.id && msg.channelId === this.id) this.merge([msg]);
    } catch { /* ignore malformed frames */ }
  }

  private async refresh(): Promise<void> {
    const list = await this.api.listMessages(this.id);
    this.merge(Array.isArray(list) ? list : []);
  }

  private merge(incoming: ChannelMessageDto[]): void {
    const byId = new Map(this.messages().map(m => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    this.messages.set([...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async send(): Promise<void> {
    const body = this.draft.trim();
    if (!body) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const msg = await this.api.postMessage(this.id, body);
      this.draft = '';
      if (msg?.id) this.merge([msg]);
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'Could not send message.');
    } finally {
      this.busy.set(false);
    }
  }
}
