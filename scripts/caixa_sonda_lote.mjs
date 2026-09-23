/**
 * Sonda em lote: `dtJustification` (candidata a data de decisão) alguma vez
 * vem preenchida? E `estimatedValue` — que a API devolve e o adaptador não
 * grava — está lá de verdade?
 *
 * Só faz GET no endpoint `budget`, 1 requisição por card, em série.
 *
 * Uso: node scripts/caixa_sonda_lote.mjs   (lê os cards do banco de dev)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const API_BASE = 'https://api.caixaescolar.educacao.mg.gov.br';

function env(chave) {
  const texto = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
  const linha = texto.split(/\r?\n/).find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1).trim().replace(/^["']|["']$/g, '');
}

const login = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ txCpfCnpj: env('CAIXA_ESCOLAR_USER'), txPassword: env('CAIXA_ESCOLAR_PASS') }),
});
const cookies = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie') ?? ''])
  .map((c) => c.split(';')[0])
  .join('; ');

const prisma = new PrismaClient();
const cards = await prisma.licitacao.findMany({
  where: { portalOrigem: 'caixa-escolar', idSubprogram: { not: null } },
  select: { externalId: true, idSubprogram: true, idSchool: true, resultado: true, status: true },
  take: 12,
  orderBy: { createdAt: 'desc' },
});

let comJustificativa = 0;
let comValor = 0;

for (const c of cards) {
  const rota = `budget/by-subprogram/${c.idSubprogram}/by-school/${c.idSchool}/by-budget/${c.externalId}`;
  const r = await fetch(`${API_BASE}/${rota}`, { headers: { Cookie: cookies, Accept: 'application/json' } });
  if (!r.ok) {
    console.log(`${c.externalId}  HTTP ${r.status}`);
    continue;
  }
  const j = await r.json();
  if (j.dtJustification) comJustificativa++;
  if (j.estimatedValue) comValor++;
  console.log(
    `${c.externalId}  ${(c.resultado ?? c.status).padEnd(16)}` +
      `status=${String(j.status).padEnd(12)} ` +
      `estimatedValue=${String(j.estimatedValue).padEnd(12)} ` +
      `dtJustification=${j.dtJustification ?? '-'} ` +
      `analista=${j.analystName ?? '-'}`,
  );
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n${comJustificativa}/${cards.length} com dtJustification · ${comValor}/${cards.length} com estimatedValue`);
await prisma.$disconnect();
