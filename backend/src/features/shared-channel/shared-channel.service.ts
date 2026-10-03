import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

export interface ChannelSummary {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  members: { userId: string; role: 'VENDOR' | 'CUSTOMER'; email?: string; name?: string | null }[];
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  createdAt: Date;
}

export interface CustomerOption {
  id: string;
  email: string;
  name: string | null;
}

const VENDOR_ROLES = new Set(['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
const MAX_BODY = 4000;

/**
 * Shared-channel domain logic. Real-time delivery is an in-process event bus:
 * every posted message is emitted on `events$` and streamed (SSE) to members
 * that have the channel open. Clients fall back to polling the messages list.
 */
@Injectable()
export class SharedChannelService {
  private readonly events$ = new Subject<ChannelMessage>();

  constructor(private readonly prisma: PrismaService) {}

  /** Users with the USER role are the portal's customers. */
  async listCustomers(): Promise<CustomerOption[]> {
    const users = await this.prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, email: true, name: true },
      orderBy: { email: 'asc' },
    });
    return users;
  }

  async listChannelsFor(userId: string): Promise<ChannelSummary[]> {
    const channels = await this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      include: { members: { select: { userId: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const userIds = [...new Set(channels.flatMap((c) => c.members.map((m) => m.userId)))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      createdById: c.createdById,
      createdAt: c.createdAt,
      members: c.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        email: byId.get(m.userId)?.email,
        name: byId.get(m.userId)?.name ?? null,
      })),
    }));
  }

  async createChannel(
    creator: { userId: string; role: string },
    input: { name?: unknown; customerIds?: unknown },
  ): Promise<ChannelSummary> {
    if (!VENDOR_ROLES.has(creator.role)) {
      throw new ForbiddenException('only vendors can create shared channels');
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new BadRequestException('name is required');
    if (name.length > 120) throw new BadRequestException('name is too long');
    const rawIds = Array.isArray(input.customerIds) ? input.customerIds : [];
    const customerIds = [...new Set(rawIds.filter((v): v is string => typeof v === 'string' && !!v))]
      .filter((id) => id !== creator.userId);
    if (customerIds.length === 0) {
      throw new BadRequestException('at least one customer is required');
    }
    const customers = await this.prisma.user.findMany({
      where: { id: { in: customerIds }, role: 'USER' },
      select: { id: true, name: true },
    });
    if (customers.length !== customerIds.length) {
      throw new BadRequestException('unknown customer id');
    }

    const channel = await this.prisma.$transaction(async (tx) => {
      for (const c of customers) {
        await tx.customer.upsert({
          where: { userId: c.id },
          create: { userId: c.id, name: c.name },
          update: {},
        });
      }
      return tx.channel.create({
        data: {
          name,
          createdById: creator.userId,
          members: {
            create: [
              { userId: creator.userId, role: 'VENDOR' },
              ...customers.map((c) => ({ userId: c.id, role: 'CUSTOMER' as const })),
            ],
          },
        },
        include: { members: { select: { userId: true, role: true } } },
      });
    });
    return {
      id: channel.id,
      name: channel.name,
      createdById: channel.createdById,
      createdAt: channel.createdAt,
      members: channel.members.map((m) => ({ userId: m.userId, role: m.role })),
    };
  }

  /** Throws 404 when the channel does not exist or the user is not a member. */
  async assertMember(channelId: string, userId: string): Promise<void> {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('channel not found');
  }

  async getChannel(channelId: string, userId: string): Promise<ChannelSummary> {
    await this.assertMember(channelId, userId);
    const all = await this.listChannelsFor(userId);
    const found = all.find((c) => c.id === channelId);
    if (!found) throw new NotFoundException('channel not found');
    return found;
  }

  async listMessages(channelId: string, userId: string): Promise<ChannelMessage[]> {
    await this.assertMember(channelId, userId);
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return this.withAuthors(rows);
  }

  async postMessage(channelId: string, userId: string, body: unknown): Promise<ChannelMessage> {
    await this.assertMember(channelId, userId);
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) throw new BadRequestException('message body is required');
    if (text.length > MAX_BODY) throw new BadRequestException('message is too long');
    const row = await this.prisma.message.create({
      data: { channelId, authorId: userId, body: text },
    });
    const [msg] = await this.withAuthors([row]);
    this.events$.next(msg);
    return msg;
  }

  /** Live stream of new messages for one channel (caller must check membership). */
  stream(channelId: string): Observable<{ data: ChannelMessage; type: string }> {
    return this.events$.pipe(
      filter((m) => m.channelId === channelId),
      map((m) => ({ data: m, type: 'message' })),
    );
  }

  private async withAuthors(
    rows: { id: string; channelId: string; authorId: string; body: string; createdAt: Date }[],
  ): Promise<ChannelMessage[]> {
    const ids = [...new Set(rows.map((r) => r.authorId))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u.name || u.email]));
    return rows.map((r) => ({ ...r, authorName: byId.get(r.authorId) ?? null }));
  }
}
