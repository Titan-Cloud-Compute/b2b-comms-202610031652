import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AuditActor } from '@prisma/client';
import { AuditLogService } from '../../common/audit-log.service';

/**
 * Writes a SYSTEM `system.startup` row into the AuditLog each time the API
 * boots, so admins can see restarts in the audit trail.
 */
@Injectable()
export class AuditStartupRecorder implements OnApplicationBootstrap {
  constructor(private readonly auditLog: AuditLogService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.auditLog.write({
      actor: AuditActor.SYSTEM,
      actorUserId: null,
      action: 'system.startup',
      payload: { pid: process.pid },
    });
  }
}
