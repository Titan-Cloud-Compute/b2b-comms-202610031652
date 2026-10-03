import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client';

export interface ChannelMemberDto {
  userId: string;
  role: 'VENDOR' | 'CUSTOMER';
  email?: string;
  name?: string | null;
}

export interface ChannelDto {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  members: ChannelMemberDto[];
}

export interface ChannelMessageDto {
  id: string;
  channelId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  createdAt: string;
}

export interface CustomerOptionDto {
  id: string;
  email: string;
  name: string | null;
}

@Injectable({ providedIn: 'root' })
export class SharedChannelApiService {
  private readonly api = inject(ApiClient);

  listChannels(): Promise<ChannelDto[]> {
    return this.api.get<ChannelDto[]>('/api/channels');
  }

  listCustomers(): Promise<CustomerOptionDto[]> {
    return this.api.get<CustomerOptionDto[]>('/api/channels/customers');
  }

  createChannel(name: string, customerIds: string[]): Promise<ChannelDto> {
    return this.api.post<ChannelDto>('/api/channels', { name, customerIds });
  }

  getChannel(id: string): Promise<ChannelDto> {
    return this.api.get<ChannelDto>(`/api/channels/${encodeURIComponent(id)}`);
  }

  listMessages(id: string): Promise<ChannelMessageDto[]> {
    return this.api.get<ChannelMessageDto[]>(`/api/channels/${encodeURIComponent(id)}/messages`);
  }

  postMessage(id: string, body: string): Promise<ChannelMessageDto> {
    return this.api.post<ChannelMessageDto>(`/api/channels/${encodeURIComponent(id)}/messages`, { body });
  }

  /** Relative SSE URL (resolved against the document base like HttpApiClient). */
  streamUrl(id: string): string {
    return `api/channels/${encodeURIComponent(id)}/stream`;
  }
}
