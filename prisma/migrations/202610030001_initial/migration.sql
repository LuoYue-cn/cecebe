-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'active',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "csrf" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "generationModel" TEXT NOT NULL,
    "analysisModel" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 12000,
    "timeout" INTEGER NOT NULL DEFAULT 120,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT,
    "anonymousOwner" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "cover" TEXT,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "currentVersionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestVersion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dimension" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Dimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scores" JSONB NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSession" (
    "id" TEXT NOT NULL,
    "testVersionId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousSessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "consistencyScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'started',

    CONSTRAINT "TestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreResult" (
    "sessionId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "ScoreResult_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "sessionId" TEXT NOT NULL,
    "resultLabel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "traits" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "potentialIssues" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "shareSummary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sessionId" TEXT,
    "creatorId" TEXT,
    "anonymousOwner" TEXT,
    "shareCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "code" TEXT NOT NULL,
    "pages" JSONB NOT NULL,
    "label" TEXT NOT NULL DEFAULT '广告 / Advertisement',
    "impressions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRequestLog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latency" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "anonymousOwner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "resultId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitRecord" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_kind_version_key" ON "PromptTemplate"("kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Test_slug_key" ON "Test"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Test_currentVersionId_key" ON "Test"("currentVersionId");

-- CreateIndex
CREATE INDEX "Test_status_visibility_idx" ON "Test"("status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "TestVersion_testId_version_key" ON "TestVersion"("testId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Dimension_versionId_key_key" ON "Dimension"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Question_versionId_key_key" ON "Question"("versionId", "key");

-- CreateIndex
CREATE INDEX "TestSession_userId_completedAt_idx" ON "TestSession"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_sessionId_questionId_key" ON "Answer"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Share_shareCode_key" ON "Share"("shareCode");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "TestVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestVersion" ADD CONSTRAINT "TestVersion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dimension" ADD CONSTRAINT "Dimension_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TestVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TestVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_testVersionId_fkey" FOREIGN KEY ("testVersionId") REFERENCES "TestVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResult" ADD CONSTRAINT "ScoreResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

