import { Module } from '@nestjs/common';
import { AuditStartupRecorder } from './audit-startup.recorder';

/** Audit-log story: records system events (start-up) into AuditLog. */
@Module({
  providers: [AuditStartupRecorder],
})
export class AuditLogFeatureModule {}
