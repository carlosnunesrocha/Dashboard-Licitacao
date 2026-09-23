/**
 * Roda o backfill de detalhes em lotes, contra o backend já no ar.
 *
 * Por que em lotes e não numa chamada só: a carga inicial da Caixa Escolar são
 * ~928 cards a ~2,3s cada, perto de 35 minutos. Uma única requisição HTTP
 * aberta esse tempo todo morre em qualquer proxy ou timeout. Em lotes de 50 a
 * requisição dura ~2 min, dá para acompanhar o progresso e, se parar no meio,
 * é só rodar de novo — cada rodada só pega quem ainda está sem detalhe.
 *
 * Uso: node scripts/backfill_detalhes.mjs [portal] [lote] [pausaMs]
 *   node scripts/backfill_detalhes.mjs caixa-escolar 50 1500
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const API = 'http://localhost:3001/api';
const [portal = 'caixa-escolar', lote = '50', pausaMs = '1500'] = process.argv.slice(2);

const prisma = new PrismaClient();

/**
 * O access token vale 15 minutos e a carga inicial leva mais de 30 — o lote
 * que atravessa a virada toma 401. Por isso o login é refeito a cada lote em
 * vez de uma vez só no começo: é uma requisição barata perto dos 50 cards que
 * vêm a seguir, e elimina a classe inteira de erro.
 */
async function autenticar() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@exemplo.com',
      senha: process.env.SEED_ADMIN_SENHA ?? 'admin123',
    }),
  });
  if (!r.ok) {
    console.error('Login falhou:', r.status);
    process.exit(1);
  }
  return (await r.json()).accessToken;
}

let accessToken = await autenticar();

/**
 * A conexão com o backend cai quando ele reinicia (em dev, o `nest --watch`
 * derruba a aplicação a cada arquivo salvo). Perder 30 min de fila por causa
 * disso é inaceitável: espera o backend voltar e refaz o lote. Os cards já
 * processados não são refeitos — o `limite` sempre pega quem ainda não tem
 * detalhe.
 */
async function comRetry(chamada, tentativas = 6) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await chamada();
    } catch (e) {
      if (i === tentativas) return null;
      const espera = Math.min(2 ** i, 30);
      console.log(`  conexão caiu (${e.cause?.code ?? e.message}); nova tentativa em ${espera}s`);
      await new Promise((r) => setTimeout(r, espera * 1000));
    }
  }
  return null;
}

/**
 * Mesma definição de "falta detalhe" que o backend usa (DETALHES_INCOMPLETOS):
 * inclui os cards em Perdeu sem vencedor, buscados enquanto o portal ainda
 * estava em análise. Se este contador divergisse do servidor, a fila terminaria
 * achando que acabou enquanto o backend ainda tinha trabalho.
 */
async function pendentes() {
  return prisma.licitacao.count({
    where: {
      portalOrigem: portal,
      desaparecidoEm: null,
      OR: [{ detalhesSincronizadosEm: null }, { resultado: 'PERDEU', empresaVencedora: null }],
    },
  });
}

async function comValor() {
  return prisma.licitacao.count({
    where: { portalOrigem: portal, valorTotalProposta: { not: null } },
  });
}

const inicial = await pendentes();
console.log(`${portal}: ${inicial} cards sem detalhes · ${await comValor()} com valor`);
console.log(`Lotes de ${lote}, pausa de ${pausaMs}ms entre cards. Ctrl+C interrompe sem estragar nada.\n`);

const comecou = Date.now();
let rodada = 0;

while ((await pendentes()) > 0) {
  rodada++;
  const antes = await pendentes();
  accessToken = await autenticar();

  const r = await comRetry(() =>
    fetch(`${API}/integrations/${portal}/backfill-detalhes?limite=${lote}&pausaMs=${pausaMs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  if (!r) {
    console.error('\nBackend não voltou depois de várias tentativas — parando aqui.');
    break;
  }
  if (!r.ok) {
    console.error(`\nLote ${rodada} falhou: HTTP ${r.status} ${await r.text()}`);
    break;
  }

  const res = await r.json();
  const restam = await pendentes();
  const min = Math.round((Date.now() - comecou) / 60000);
  console.log(
    `lote ${String(rodada).padStart(3)}  ${res.ok} ok, ${res.falhas} falhas  ` +
      `· faltam ${restam} de ${inicial}  · ${min} min corridos`,
  );

  // Nenhum card saiu da fila. Normal quando só restam os que dependem do
  // portal concluir (Perdeu ainda sem vencedor): não há o que buscar hoje.
  if (restam === antes) {
    console.log(
      `\nO lote não avançou: ${restam} cards dependem de dados que o portal ainda não publicou.\n` +
        'Nada a fazer agora — a próxima rodada os pega quando a escola concluir.',
    );
    break;
  }
}

console.log(`\nFim: ${await pendentes()} ainda sem detalhes · ${await comValor()} com valor preenchido`);
await prisma.$disconnect();
