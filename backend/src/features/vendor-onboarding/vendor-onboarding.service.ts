import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../../lib/integrations/minio.service';

export interface VendorProfileInput {
  companyName?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
}

export interface UploadedVendorFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  getProfile(userId: string) {
    return this.prisma.vendorProfile.findUnique({ where: { userId } });
  }

  async saveProfile(userId: string, input: VendorProfileInput) {
    const companyName = str(input?.companyName);
    const contactName = str(input?.contactName);
    const contactEmail = str(input?.contactEmail);
    const contactPhone = str(input?.contactPhone) || null;
    const errors: string[] = [];
    if (!companyName) errors.push('companyName is required');
    if (!contactName) errors.push('contactName is required');
    if (!EMAIL_RE.test(contactEmail)) errors.push('contactEmail must be a valid email');
    if (errors.length) throw new BadRequestException(errors.join('; '));

    const data = { companyName, contactName, contactEmail, contactPhone, completedAt: new Date() };
    return this.prisma.vendorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async listDocuments(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile) return [];
    return this.prisma.vendorDocument.findMany({
      where: { vendorProfileId: profile.id },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadDocument(userId: string, file: UploadedVendorFile | undefined) {
    if (!file || !file.buffer) throw new BadRequestException('file is required');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('file too large');
    const profile = await this.getProfile(userId);
    if (!profile || !profile.completedAt) {
      throw new BadRequestException('complete your vendor profile before uploading documents');
    }
    const safeName = (file.originalname || 'document').replace(/[^A-Za-z0-9._-]/g, '_');
    const storageKey = `vendor/${profile.id}/${Date.now()}-${safeName}`;
    await this.minio.putObject(storageKey, file.buffer, file.size, file.mimetype);
    return this.prisma.vendorDocument.create({
      data: {
        vendorProfileId: profile.id,
        filename: file.originalname || safeName,
        storageKey,
        contentType: file.mimetype ?? null,
        sizeBytes: file.size,
        status: 'PENDING_REVIEW',
      },
    });
  }
}
