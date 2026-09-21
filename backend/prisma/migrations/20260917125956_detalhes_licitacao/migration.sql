-- CreateTable
CREATE TABLE "LicitacaoItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licitacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT,
    "unidade" TEXT,
    "quantidade" DECIMAL,
    "valorReferencia" DECIMAL,
    "valorUnitario" DECIMAL,
    "observacoes" TEXT,
    "garantiaOfertada" TEXT,
    "garantiaExigida" TEXT,
    CONSTRAINT "LicitacaoItem_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Licitacao" (
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
    "status" TEXT NOT NULL DEFAULT 'EM_ANALISE',
    "resultado" TEXT,
    "responsavelId" TEXT,
    "observacoes" TEXT,
    "idSubprogram" INTEGER,
    "idSchool" INTEGER,
    "idSupplier" INTEGER,
    "detalhamento" TEXT,
    "valorTotalProposta" DECIMAL,
    "empresaVencedora" TEXT,
    "valorVencedor" DECIMAL,
    "detalhesSincronizadosEm" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Licitacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Licitacao" ("createdAt", "dataAbertura", "dataLimite", "externalId", "id", "modalidade", "objeto", "observacoes", "orgao", "portalOrigem", "responsavelId", "resultado", "status", "updatedAt", "urlOriginal", "valorEstimado") SELECT "createdAt", "dataAbertura", "dataLimite", "externalId", "id", "modalidade", "objeto", "observacoes", "orgao", "portalOrigem", "responsavelId", "resultado", "status", "updatedAt", "urlOriginal", "valorEstimado" FROM "Licitacao";
DROP TABLE "Licitacao";
ALTER TABLE "new_Licitacao" RENAME TO "Licitacao";
CREATE UNIQUE INDEX "Licitacao_portalOrigem_externalId_key" ON "Licitacao"("portalOrigem", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LicitacaoItem_licitacaoId_idx" ON "LicitacaoItem"("licitacaoId");
