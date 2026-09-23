/**
 * Verificação ponta a ponta da proposta manual:
 * 1. grava valor + data num card do LicitarDigital pela API;
 * 2. confere que as marcas `valorPropostaManual`/`dataPropostaManual` subiram;
 * 3. roda o sync de detalhes desse card — que no LicitarDigital devolve valor
 *    NULO — e confere que o valor digitado SOBREVIVEU;
 * 4. limpa o campo (null) e confere que a marca caiu junto.
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const API = 'http://localhost:3001/api';
const prisma = new PrismaClient();

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@exemplo.com', senha: 'admin123' }),
});
if (!login.ok) {
  console.error('Login falhou:', login.status, await login.text());
  process.exit(1);
}
const { accessToken: token } = await login.json();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const alvo = await prisma.licitacao.findFirst({
  where: { portalOrigem: 'licitar-digital' },
  select: { id: true, objeto: true },
});
console.log('Card:', alvo.id, '-', alvo.objeto.slice(0, 60));

async function estado(rotulo) {
  const l = await prisma.licitacao.findUnique({
    where: { id: alvo.id },
    select: {
      valorTotalProposta: true,
      dataProposta: true,
      valorPropostaManual: true,
      dataPropostaManual: true,
    },
  });
  console.log(
    `${rotulo.padEnd(30)} valor=${String(l.valorTotalProposta).padEnd(9)} ` +
      `data=${l.dataProposta ? l.dataProposta.toISOString().slice(0, 10) : 'null'}  ` +
      `manual(valor)=${l.valorPropostaManual} manual(data)=${l.dataPropostaManual}`,
  );
  return l;
}

await estado('antes');

// 1 + 2 — grava
let r = await fetch(`${API}/licitacoes/${alvo.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ valorTotalProposta: 12345.67, dataProposta: '2026-09-10T00:00:00.000Z' }),
});
console.log('PATCH grava ->', r.status);
const gravado = await estado('depois de gravar');

// 3 — o sync de detalhes não pode apagar o que foi digitado
// força nova busca: o endpoint devolve o cache se detalhesSincronizadosEm existe
await prisma.licitacao.update({
  where: { id: alvo.id },
  data: { detalhesSincronizadosEm: null },
});
r = await fetch(`${API}/integrations/detalhes/${alvo.id}`, { headers: auth });
console.log('GET detalhes ->', r.status);
const pos = await estado('depois do sync detalhes');

// 4 — limpar devolve o controle ao sync
r = await fetch(`${API}/licitacoes/${alvo.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ valorTotalProposta: null, dataProposta: null }),
});
console.log('PATCH limpa ->', r.status);
const limpo = await estado('depois de limpar');

const ok =
  Number(gravado.valorTotalProposta) === 12345.67 &&
  gravado.valorPropostaManual === true &&
  Number(pos.valorTotalProposta) === 12345.67 &&
  limpo.valorTotalProposta === null &&
  limpo.valorPropostaManual === false;

console.log(ok ? '\nOK: valor digitado sobreviveu ao sync e a limpeza soltou a trava' : '\nFALHOU');
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
