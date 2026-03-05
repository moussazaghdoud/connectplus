-- CreateEnum
CREATE TYPE "ConnectorCategory" AS ENUM ('CRM', 'HELPDESK', 'COLLABORATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ConnectorTier" AS ENUM ('CODE_BASED', 'CONFIG_DRIVEN');

-- AlterTable: add marketplace metadata columns
ALTER TABLE "ConnectorDefinition"
  ADD COLUMN "category"      "ConnectorCategory" NOT NULL DEFAULT 'CRM',
  ADD COLUMN "tier"          "ConnectorTier"     NOT NULL DEFAULT 'CONFIG_DRIVEN',
  ADD COLUMN "authType"      TEXT                NOT NULL DEFAULT 'oauth2',
  ADD COLUMN "vendorUrl"     TEXT,
  ADD COLUMN "docsUrl"       TEXT,
  ADD COLUMN "iconName"      TEXT,
  ADD COLUMN "pricingTier"   TEXT,
  ADD COLUMN "shortDesc"     TEXT                NOT NULL DEFAULT '',
  ADD COLUMN "prerequisites" JSONB               NOT NULL DEFAULT '[]',
  ADD COLUMN "setupSteps"    JSONB               NOT NULL DEFAULT '[]';

-- AlterTable: add operational tracking columns
ALTER TABLE "ConnectorDefinition"
  ADD COLUMN "lastHealthAt"       TIMESTAMP(3),
  ADD COLUMN "lastHealthStatus"   BOOLEAN,
  ADD COLUMN "lastHealthLatency"  INTEGER,
  ADD COLUMN "lastTokenRefreshAt" TIMESTAMP(3),
  ADD COLUMN "lastWebhookAt"      TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConnectorDefinition_category_idx" ON "ConnectorDefinition"("category");
