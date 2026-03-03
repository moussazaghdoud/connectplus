-- CreateEnum
CREATE TYPE "ConnectorDefinitionStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ConnectorDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "tenantId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ConnectorDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "lastTestResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorDefinitionVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorDefinition_slug_key" ON "ConnectorDefinition"("slug");
CREATE INDEX "ConnectorDefinition_tenantId_idx" ON "ConnectorDefinition"("tenantId");
CREATE INDEX "ConnectorDefinition_status_idx" ON "ConnectorDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorDefinitionVersion_definitionId_version_key" ON "ConnectorDefinitionVersion"("definitionId", "version");

-- AddForeignKey
ALTER TABLE "ConnectorDefinitionVersion" ADD CONSTRAINT "ConnectorDefinitionVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ConnectorDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
