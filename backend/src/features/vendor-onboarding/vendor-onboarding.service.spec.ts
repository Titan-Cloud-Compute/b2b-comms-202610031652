import { BadRequestException } from '@nestjs/common';
import { VendorOnboardingService } from './vendor-onboarding.service';

function makeService() {
  const prisma = {
    vendorProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 'vp1', ...args.create })),
    },
    vendorDocument: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'd1', ...args.data })),
    },
  };
  const minio = { putObject: jest.fn(async () => ({ etag: 'e', bucket: 'b', key: 'k' })) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new VendorOnboardingService(prisma as any, minio as any);
  return { svc, prisma, minio };
}

describe('VendorOnboardingService', () => {
  it('saves a complete profile with completedAt set', async () => {
    const { svc, prisma } = makeService();
    const p = await svc.saveProfile('u1', {
      companyName: 'Acme Supplies',
      contactName: 'Jane Doe',
      contactEmail: 'jane@acme.test',
    });
    expect(prisma.vendorProfile.upsert).toHaveBeenCalled();
    expect(p.companyName).toBe('Acme Supplies');
    expect(p.completedAt).toBeInstanceOf(Date);
  });

  it('rejects a profile without company name or valid email', async () => {
    const { svc } = makeService();
    await expect(svc.saveProfile('u1', { contactName: 'x', contactEmail: 'bad' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads a document through MinIO with PENDING_REVIEW status', async () => {
    const { svc, prisma, minio } = makeService();
    prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vp1', completedAt: new Date() });
    const doc = await svc.uploadDocument('u1', {
      originalname: 'insurance.pdf',
      mimetype: 'application/pdf',
      size: 3,
      buffer: Buffer.from('abc'),
    });
    expect(minio.putObject).toHaveBeenCalled();
    expect(doc.status).toBe('PENDING_REVIEW');
    expect(doc.vendorProfileId).toBe('vp1');
  });

  it('refuses uploads before the profile is complete', async () => {
    const { svc, prisma } = makeService();
    prisma.vendorProfile.findUnique.mockResolvedValue(null);
    await expect(
      svc.uploadDocument('u1', { originalname: 'a.pdf', size: 1, buffer: Buffer.from('a') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
