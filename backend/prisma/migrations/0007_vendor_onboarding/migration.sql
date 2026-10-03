-- Story: vendor-onboarding. Adds vendor profile + compliance document tables.
-- Auth tables are NOT altered (FKs live on the new tables only).

CREATE TYPE "VendorDocumentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");

ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorDocument_vendorProfileId_idx" ON "VendorDocument"("vendorProfileId");

ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_vendorProfileId_fkey"
    FOREIGN KEY ("vendorProfileId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
