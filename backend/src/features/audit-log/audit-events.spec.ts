import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/auth.service';
import { AuditLogService } from '../../common/audit-log.service';
import { AuditStartupRecorder } from './audit-startup.recorder';

describe('audit events', () => {
  const makeAudit = () => ({ write: jest.fn(async () => undefined) });

  const makeAuth = (user: unknown, audit: ReturnType<typeof makeAudit>) => {
    const tx = { user: { findUnique: jest.fn(async () => user) } };
    const prisma = { runAsAdmin: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    const jwt = { signAsync: jest.fn(async () => 'tok') };
    return new AuthService(
      prisma as never,
      jwt as never,
      {} as never,
      {} as never,
      audit as unknown as AuditLogService,
    );
  };

  it('records auth.login for a successful USER login', async () => {
    const audit = makeAudit();
    const passwordHash = await bcrypt.hash('password1234', 4);
    const svc = makeAuth({ id: 'u1', email: 'u@x.io', role: 'USER', passwordHash, firmId: null }, audit);
    await svc.login({ email: 'u@x.io', password: 'password1234' });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'USER', actorUserId: 'u1', action: 'auth.login' }),
    );
  });

  it('records auth.login_failed for a bad password', async () => {
    const audit = makeAudit();
    const passwordHash = await bcrypt.hash('password1234', 4);
    const svc = makeAuth({ id: 'a1', email: 'a@x.io', role: 'ADMIN', passwordHash, firmId: null }, audit);
    await expect(svc.login({ email: 'a@x.io', password: 'wrong-password' })).rejects.toThrow();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ADMIN', actorUserId: 'a1', action: 'auth.login_failed' }),
    );
  });

  it('records a SYSTEM system.startup event on bootstrap', async () => {
    const audit = makeAudit();
    await new AuditStartupRecorder(audit as unknown as AuditLogService).onApplicationBootstrap();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'SYSTEM', actorUserId: null, action: 'system.startup' }),
    );
  });
});
