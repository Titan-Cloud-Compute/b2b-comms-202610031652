import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { firstValueFrom, take } from 'rxjs';
import { SharedChannelService } from './shared-channel.service';
import type { PrismaService } from '../../prisma/prisma.service';

function makePrisma() {
  const members = new Set<string>(['c1:vendor', 'c1:cust']);
  const prisma = {
    user: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] }; role?: string } }) => {
        const all = [
          { id: 'vendor', email: 'v@x', name: 'Vendor', role: 'MANAGER' },
          { id: 'cust', email: 'c@x', name: 'Cust', role: 'USER' },
        ];
        return all
          .filter((u) => !where.role || u.role === where.role)
          .filter((u) => !where.id || where.id.in.includes(u.id));
      }),
    },
    channelMember: {
      findUnique: jest.fn(async ({ where }: { where: { channelId_userId: { channelId: string; userId: string } } }) => {
        const k = `${where.channelId_userId.channelId}:${where.channelId_userId.userId}`;
        return members.has(k) ? { id: k } : null;
      }),
    },
    channel: {
      findMany: jest.fn(async () => [
        {
          id: 'c1', name: 'Ops', createdById: 'vendor', createdAt: new Date(),
          members: [{ userId: 'vendor', role: 'VENDOR' }, { userId: 'cust', role: 'CUSTOMER' }],
        },
      ]),
    },
    message: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: { channelId: string; authorId: string; body: string } }) => ({
        id: 'm1', createdAt: new Date(), ...data,
      })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        customer: { upsert: jest.fn(async () => ({})) },
        channel: {
          create: jest.fn(async ({ data }: { data: { name: string; createdById: string; members: { create: { userId: string; role: string }[] } } }) => ({
            id: 'c2', name: data.name, createdById: data.createdById, createdAt: new Date(),
            members: data.members.create,
          })),
        },
      }),
    ),
  };
  return prisma;
}

describe('SharedChannelService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: SharedChannelService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new SharedChannelService(prisma as unknown as PrismaService);
  });

  it('lists only channels the user is a member of', async () => {
    const list = await svc.listChannelsFor('cust');
    expect(prisma.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { members: { some: { userId: 'cust' } } } }),
    );
    expect(list[0].members.map((m) => m.userId)).toEqual(['vendor', 'cust']);
  });

  it('lets a vendor create a channel with customer members', async () => {
    const ch = await svc.createChannel({ userId: 'vendor', role: 'MANAGER' }, { name: 'Ops', customerIds: ['cust'] });
    expect(ch.members).toEqual([
      { userId: 'vendor', role: 'VENDOR' },
      { userId: 'cust', role: 'CUSTOMER' },
    ]);
  });

  it('forbids customers from creating channels', async () => {
    await expect(
      svc.createChannel({ userId: 'cust', role: 'USER' }, { name: 'x', customerIds: ['vendor'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects channels without customers or with unknown customers', async () => {
    await expect(
      svc.createChannel({ userId: 'vendor', role: 'MANAGER' }, { name: 'x', customerIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createChannel({ userId: 'vendor', role: 'MANAGER' }, { name: 'x', customerIds: ['nobody'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks non-members from reading or posting', async () => {
    await expect(svc.listMessages('c1', 'stranger')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.postMessage('c1', 'stranger', 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('streams a posted customer message to channel listeners in real time', async () => {
    const next = firstValueFrom(svc.stream('c1').pipe(take(1)));
    const posted = await svc.postMessage('c1', 'cust', '  hello vendor  ');
    const evt = await next;
    expect(posted.body).toBe('hello vendor');
    expect(evt.type).toBe('message');
    expect(evt.data).toEqual(expect.objectContaining({ id: 'm1', authorId: 'cust', authorName: 'Cust' }));
  });

  it('rejects empty messages', async () => {
    await expect(svc.postMessage('c1', 'cust', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });
});
