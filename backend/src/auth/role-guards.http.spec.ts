/**
 * HTTP contract spec for the global auth and role guards.
 *
 * Boots a slim test application (no database, no real services) that wires
 * JwtAuthGuard and RolesGuard as global APP_GUARDs — exactly as AuthModule
 * does in production — and asserts end-to-end HTTP status codes for every
 * guard combination, including the real GET /api/users/me handler.
 */

import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireAdmin, RequireManager, RolesGuard } from './roles.guard';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';

// ---------------------------------------------------------------------------
// Minimal test controller covering all guard combinations
// ---------------------------------------------------------------------------
@Controller('t')
class TestController {
  @Public()
  @Get('public')
  getPublic(): string {
    return 'ok';
  }

  @Get('any')
  getAny(): string {
    return 'ok';
  }

  @RequireManager()
  @Get('manager')
  getManager(): string {
    return 'ok';
  }

  @RequireAdmin()
  @Get('admin')
  getAdmin(): string {
    return 'ok';
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('role-guards HTTP contract', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockUsersService = {
    findById: jest.fn(async (id: string) => ({
      id,
      email: `${id}@demo.local`,
      name: 'N',
      role: 'MANAGER' as const,
      passwordHash: 'x',
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [TestController, UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        JwtAuthGuard,
        RolesGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Sign a session cookie for the given userId and role. */
  const mintCookie = async (userId: string, role: string): Promise<string> => {
    const token = await jwtService.signAsync({ userId, role, firmId: null });
    return `session=${token}`;
  };

  // -------------------------------------------------------------------------
  // Authentication checks
  // -------------------------------------------------------------------------
  it('GET /t/any without cookie → 401', () =>
    request(app.getHttpServer()).get('/t/any').expect(401));

  it('GET /t/any with tampered cookie → 401', () =>
    request(app.getHttpServer())
      .get('/t/any')
      .set('Cookie', 'session=garbage')
      .expect(401));

  it('GET /t/public without cookie → 200 (@Public bypasses JWT)', () =>
    request(app.getHttpServer()).get('/t/public').expect(200));

  it('GET /t/any as USER → 200 (no role restriction)', async () => {
    const cookie = await mintCookie('u-user', 'USER');
    return request(app.getHttpServer()).get('/t/any').set('Cookie', cookie).expect(200);
  });

  // -------------------------------------------------------------------------
  // @RequireAdmin: ADMIN only
  // -------------------------------------------------------------------------
  it('GET /t/admin as USER → 403', async () => {
    const cookie = await mintCookie('u-user', 'USER');
    return request(app.getHttpServer()).get('/t/admin').set('Cookie', cookie).expect(403);
  });

  it('GET /t/admin as MANAGER → 403', async () => {
    const cookie = await mintCookie('u-mgr', 'MANAGER');
    return request(app.getHttpServer()).get('/t/admin').set('Cookie', cookie).expect(403);
  });

  it('GET /t/admin as ADMIN → 200', async () => {
    const cookie = await mintCookie('u-admin', 'ADMIN');
    return request(app.getHttpServer()).get('/t/admin').set('Cookie', cookie).expect(200);
  });

  // -------------------------------------------------------------------------
  // @RequireManager: MANAGER or ADMIN
  // -------------------------------------------------------------------------
  it('GET /t/manager as USER → 403', async () => {
    const cookie = await mintCookie('u-user', 'USER');
    return request(app.getHttpServer()).get('/t/manager').set('Cookie', cookie).expect(403);
  });

  it('GET /t/manager as MANAGER → 200', async () => {
    const cookie = await mintCookie('u-mgr', 'MANAGER');
    return request(app.getHttpServer()).get('/t/manager').set('Cookie', cookie).expect(200);
  });

  it('GET /t/manager as ADMIN → 200', async () => {
    const cookie = await mintCookie('u-admin', 'ADMIN');
    return request(app.getHttpServer()).get('/t/manager').set('Cookie', cookie).expect(200);
  });

  // -------------------------------------------------------------------------
  // GET /api/users/me
  // -------------------------------------------------------------------------
  it('GET /api/users/me without cookie → 401', () =>
    request(app.getHttpServer()).get('/api/users/me').expect(401));

  it('GET /api/users/me as MANAGER → 200 with user fields only (no passwordHash)', async () => {
    const cookie = await mintCookie('u-m', 'MANAGER');
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual({
      id: 'u-m',
      email: 'u-m@demo.local',
      name: 'N',
      role: 'MANAGER',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});
