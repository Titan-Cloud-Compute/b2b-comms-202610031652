import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export interface VendorProfile {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  completedAt: string | null;
}

export interface VendorProfileInput {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
}

export type VendorDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface VendorDocument {
  id: string;
  filename: string;
  status: VendorDocumentStatus;
  uploadedAt: string;
}

export const VENDOR_STATUS_LABELS: Record<VendorDocumentStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** Story: vendor-onboarding — wraps /api/vendor/* endpoints. */
@Injectable({ providedIn: 'root' })
export class VendorApi {
  private api = inject(ApiClient);

  async getProfile(): Promise<VendorProfile | null> {
    const res = await this.api.get<{ profile: VendorProfile | null }>('vendor/profile');
    return res?.profile ?? null;
  }

  async saveProfile(input: VendorProfileInput): Promise<VendorProfile> {
    const res = await this.api.put<{ profile: VendorProfile }>('vendor/profile', input);
    return res.profile;
  }

  listDocuments(): Promise<VendorDocument[]> {
    return this.api.get<VendorDocument[]>('vendor/documents');
  }

  uploadDocument(file: File): Promise<VendorDocument> {
    return this.api.upload<VendorDocument>('vendor/documents', file);
  }
}
