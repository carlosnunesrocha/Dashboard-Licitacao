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
    "desaparecidoEm" DATETIME,
    "dataProposta" DATETIME,
    "dataResultado" DATETIME,
    "valorPropostaManual" BOOLEAN NOT NULL DEFAULT false,
    "dataPropostaManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Licitacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Licitacao" ("createdAt", "dataAbertura", "dataLimite", "desaparecidoEm", "detalhamento", "detalhesSincronizadosEm", "empresaVencedora", "externalId", "id", "idSchool", "idSubprogram", "idSupplier", "modalidade", "objeto", "observacoes", "orgao", "portalOrigem", "responsavelId", "resultado", "status", "updatedAt", "urlOriginal", "valorEstimado", "valorTotalProposta", "valorVencedor") SELECT "createdAt", "dataAbertura", "dataLimite", "desaparecidoEm", "detalhamento", "detalhesSincronizadosEm", "empresaVencedora", "externalId", "id", "idSchool", "idSubprogram", "idSupplier", "modalidade", "objeto", "observacoes", "orgao", "portalOrigem", "responsavelId", "resultado", "status", "updatedAt", "urlOriginal", "valorEstimado", "valorTotalProposta", "valorVencedor" FROM "Licitacao";
DROP TABLE "Licitacao";
ALTER TABLE "new_Licitacao" RENAME TO "Licitacao";
CREATE INDEX "Licitacao_dataProposta_idx" ON "Licitacao"("dataProposta");
CREATE INDEX "Licitacao_dataResultado_idx" ON "Licitacao"("dataResultado");
CREATE INDEX "Licitacao_status_resultado_idx" ON "Licitacao"("status", "resultado");
CREATE INDEX "Licitacao_portalOrigem_status_idx" ON "Licitacao"("portalOrigem", "status");
CREATE INDEX "Licitacao_desaparecidoEm_idx" ON "Licitacao"("desaparecidoEm");
CREATE UNIQUE INDEX "Licitacao_portalOrigem_externalId_key" ON "Licitacao"("portalOrigem", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: na Caixa Escolar, `dataAbertura` sempre guardou
-- `dtProposalSubmission`, que é exatamente a data de envio da proposta. Então
-- dataProposta já nasce preenchida para os 964 cards, sem uma requisição
-- sequer ao portal. Vem do portal, não da operadora: dataPropostaManual fica
-- false. O LicitarDigital não entra aqui — lá `dataAbertura` é a data da
-- sessão do pregão, coisa diferente, e a data da proposta será digitada.
UPDATE "Licitacao"
   SET "dataProposta" = "dataAbertura"
 WHERE "portalOrigem" = 'caixa-escolar'
   AND "dataAbertura" IS NOT NULL
   AND "dataProposta" IS NULL;
