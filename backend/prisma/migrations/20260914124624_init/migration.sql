-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'membro',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Licitacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgao" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "modalidade" TEXT,
    "valorEstimado" DECIMAL,
    "dataAbertura" DATETIME,
    "dataLimite" DATETIME,
    "portalOrigem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "urlOriginal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'MONITORANDO',
    "resultado" TEXT,
    "responsavelId" TEXT,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Licitacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licitacaoId" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT NOT NULL,
    "userId" TEXT,
    "alteradoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusHistory_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Licitacao_portalOrigem_externalId_key" ON "Licitacao"("portalOrigem", "externalId");

-- CreateIndex
CREATE INDEX "StatusHistory_licitacaoId_idx" ON "StatusHistory"("licitacaoId");
