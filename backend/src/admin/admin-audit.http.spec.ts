/**
 * HTTP contract for GET /api/admin/audit-log: admin-only, newest first,
 * each row carries the acting user's email (null for SYSTEM rows).
 */
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditController } from './admin-audit.controller';

describe('admin audit-log HTTP contract', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const findMany = jest.fn();
  const count = jest.fn();

  beforeAll(async () => {
    const tx = { auditLog: { findMany, count } };
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [AdminAuditController],
      providers: [
        { provide: PrismaService, useValue: { runAsAdmin: (fn: (t: unknown) => unknown) => fn(tx) } },
        JwtAuthGuard,
        RolesGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([
      { id: '2', actor: 'USER', actorUserId: 'u1', action: 'auth.login', payloadJson: {}, firmId: null,
        createdAt: new Date('2026-10-02T10:00:00Z'), actorUser: { email: 'user@demo.local' } },
      { id: '1', actor: 'SYSTEM', actorUserId: null, action: 'system.startup', payloadJson: {}, firmId: null,
        createdAt: new Date('2026-10-01T10:00:00Z'), actorUser: null },
    ]);
    count.mockReset().mockResolvedValue(2);
  });

  const cookie = async (role: string) =>
    `session=${await jwt.signAsync({ userId: `u-${role}`, role, firmId: null })}`;

  it('401 without a session', () =>
    request(app.getHttpServer()).get('/api/admin/audit-log').expect(401));

  it('403 for a USER', async () =>
    request(app.getHttpServer()).get('/api/admin/audit-log').set('Cookie', await cookie('USER')).expect(403));

  it('403 for a MANAGER', async () =>
    request(app.getHttpServer()).get('/api/admin/audit-log').set('Cookie', await cookie('MANAGER')).expect(403));

  it('200 for an ADMIN with actorEmail on each row, newest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/audit-log?actor=USER&action=auth.')
      .set('Cookie', await cookie('ADMIN'))
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.rows[0]).toMatchObject({ action: 'auth.login', actorEmail: 'user@demo.local' });
    expect(res.body.rows[0].actorUser).toBeUndefined();
    expect(res.body.rows[1]).toMatchObject({ action: 'system.startup', actorEmail: null });
    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.where).toMatchObject({ actor: 'USER', action: { startsWith: 'auth.' } });
    expect(args.include).toEqual({ actorUser: { select: { email: true } } });
  });
});
