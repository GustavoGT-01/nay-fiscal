-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'padrao',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Profile_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ANALISTA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "officeId" TEXT NOT NULL,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "User_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "fails" INTEGER NOT NULL DEFAULT 1,
    "first" DATETIME NOT NULL,
    "lockedUntil" DATETIME
);

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "uploadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'LUCRO_REAL',
    "city" TEXT,
    "cityCode" TEXT,
    "uf" TEXT,
    "cnae" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "isMatriz" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Establishment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "fileName" TEXT NOT NULL,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdClients" TEXT NOT NULL DEFAULT '[]',
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSANDO',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "okCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "uploadId" TEXT,
    "model" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "natOp" TEXT NOT NULL DEFAULT '',
    "emitterCnpj" TEXT NOT NULL,
    "emitterName" TEXT NOT NULL,
    "emitterCity" TEXT NOT NULL DEFAULT '',
    "emitterCityCode" TEXT NOT NULL DEFAULT '',
    "emitterUf" TEXT NOT NULL DEFAULT '',
    "emitterCrt" TEXT,
    "recipientCnpj" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientCity" TEXT NOT NULL DEFAULT '',
    "recipientCityCode" TEXT NOT NULL DEFAULT '',
    "recipientUf" TEXT NOT NULL DEFAULT '',
    "emitterStreet" TEXT NOT NULL DEFAULT '',
    "emitterNumber" TEXT NOT NULL DEFAULT '',
    "emitterComplement" TEXT NOT NULL DEFAULT '',
    "emitterDistrict" TEXT NOT NULL DEFAULT '',
    "emitterCep" TEXT NOT NULL DEFAULT '',
    "emitterIe" TEXT NOT NULL DEFAULT '',
    "recipientStreet" TEXT NOT NULL DEFAULT '',
    "recipientNumber" TEXT NOT NULL DEFAULT '',
    "recipientComplement" TEXT NOT NULL DEFAULT '',
    "recipientDistrict" TEXT NOT NULL DEFAULT '',
    "recipientCep" TEXT NOT NULL DEFAULT '',
    "recipientIe" TEXT NOT NULL DEFAULT '',
    "exitAt" DATETIME,
    "protocolAt" DATETIME,
    "modFrete" TEXT,
    "additionalInfo" TEXT NOT NULL DEFAULT '',
    "nfse" TEXT,
    "vProd" BIGINT NOT NULL DEFAULT 0,
    "vFrete" BIGINT NOT NULL DEFAULT 0,
    "vSeg" BIGINT NOT NULL DEFAULT 0,
    "vDesc" BIGINT NOT NULL DEFAULT 0,
    "vOutro" BIGINT NOT NULL DEFAULT 0,
    "vIpi" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "vBc" BIGINT NOT NULL DEFAULT 0,
    "vIcms" BIGINT NOT NULL DEFAULT 0,
    "vPis" BIGINT NOT NULL DEFAULT 0,
    "vCofins" BIGINT NOT NULL DEFAULT 0,
    "vIbs" BIGINT NOT NULL DEFAULT 0,
    "vCbs" BIGINT NOT NULL DEFAULT 0,
    "cStat" TEXT,
    "protocol" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "verdict" TEXT NOT NULL DEFAULT '',
    "auditedAt" DATETIME,
    "xml" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "ncm" TEXT NOT NULL DEFAULT '',
    "cfop" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "qty" REAL NOT NULL DEFAULT 0,
    "unitValue" REAL NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "icmsTable" TEXT,
    "cstIcms" TEXT,
    "vIcms" BIGINT NOT NULL DEFAULT 0,
    "cstPis" TEXT,
    "vPis" BIGINT NOT NULL DEFAULT 0,
    "cstCofins" TEXT,
    "vCofins" BIGINT NOT NULL DEFAULT 0,
    "hasIbsCbs" BOOLEAN NOT NULL DEFAULT false,
    "cstIbsCbs" TEXT,
    "cClassTrib" TEXT,
    "pIbs" REAL NOT NULL DEFAULT 0,
    "vIbs" BIGINT NOT NULL DEFAULT 0,
    "pCbs" REAL NOT NULL DEFAULT 0,
    "vCbs" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "DocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tributaria',
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'interpretada',
    "severity" TEXT NOT NULL DEFAULT 'erro',
    "definition" TEXT NOT NULL DEFAULT '{}',
    "description" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "fixTag" TEXT,
    "legalBasis" TEXT NOT NULL,
    "source" TEXT,
    "action" TEXT NOT NULL DEFAULT 'conferir',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "itemId" TEXT,
    "ruleCode" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "observed" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Finding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DocumentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RODANDO',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "AuditRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("notificationId", "userId"),
    CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "entries" INTEGER NOT NULL,
    "ignored" INTEGER NOT NULL DEFAULT 0,
    "divergenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpedFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpedDivergence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spedFileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "documentId" TEXT,
    "sped" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    CONSTRAINT "SpedDivergence_spedFileId_fkey" FOREIGN KEY ("spedFileId") REFERENCES "SpedFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "DocumentEvent_officeId_createdAt_idx" ON "DocumentEvent"("officeId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentEvent_clientId_key_idx" ON "DocumentEvent"("clientId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Client_officeId_cnpj_key" ON "Client"("officeId", "cnpj");

-- CreateIndex
CREATE INDEX "Upload_officeId_createdAt_idx" ON "Upload"("officeId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_clientId_issuedAt_idx" ON "Document"("clientId", "issuedAt");

-- CreateIndex
CREATE INDEX "Document_clientId_direction_verdict_idx" ON "Document"("clientId", "direction", "verdict");

-- CreateIndex
CREATE INDEX "Document_clientId_status_idx" ON "Document"("clientId", "status");

-- CreateIndex
CREATE INDEX "Document_key_idx" ON "Document"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Document_clientId_key_key" ON "Document"("clientId", "key");

-- CreateIndex
CREATE INDEX "DocumentItem_documentId_idx" ON "DocumentItem"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_code_key" ON "Rule"("code");

-- CreateIndex
CREATE INDEX "Finding_documentId_severity_idx" ON "Finding"("documentId", "severity");

-- CreateIndex
CREATE INDEX "Finding_ruleCode_severity_idx" ON "Finding"("ruleCode", "severity");

-- CreateIndex
CREATE INDEX "AuditRun_clientId_status_idx" ON "AuditRun"("clientId", "status");

-- CreateIndex
CREATE INDEX "Notification_officeId_createdAt_idx" ON "Notification"("officeId", "createdAt");

-- CreateIndex
CREATE INDEX "SpedFile_clientId_createdAt_idx" ON "SpedFile"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "SpedDivergence_spedFileId_kind_idx" ON "SpedDivergence"("spedFileId", "kind");

