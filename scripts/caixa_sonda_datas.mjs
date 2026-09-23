/**
 * Sonda: a API da Caixa Escolar devolve alguma DATA DE DECISÃO (aprovação /
 * recusa da proposta)?
 *
 * Motivo: o painel precisa filtrar por "quando o resultado saiu", e hoje a
 * única marca de tempo é StatusHistory.alteradoEm — que registra quando o
 * NOSSO sync percebeu, não quando a escola decidiu. 891 dos 914 resultados
 * carregam a data da importação inicial (14/09), inútil para relatório.
 *
 * Despeja o JSON CRU dos três endpoints de detalhe, para procurar campo de
 * data que ainda não mapeamos. Não grava nada no banco.
 *
 * Uso: node scripts/caixa_sonda_datas.mjs <idSubprogram> <idSchool> <idBudget> <idSupplier>
 */
import { readFileSync } from 'node:fs';

const API_BASE = 'https://api.caixaescolar.educacao.mg.gov.br';

const [idSubprogram, idSchool, idBudget, idSupplier] = process.argv.slice(2);
if (!idSupplier) {
  console.error('Faltam argumentos: <idSubprogram> <idSchool> <idBudget> <idSupplier>');
  process.exit(1);
}

/** Lê o .env do backend sem depender de dependência externa. */
function env(chave) {
  const texto = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
  const linha = texto.split(/\r?\n/).find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1).trim().replace(/^["']|["']$/g, '');
}

const res = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ txCpfCnpj: env('CAIXA_ESCOLAR_USER'), txPassword: env('CAIXA_ESCOLAR_PASS') }),
});
if (!res.ok) {
  console.error('Login falhou:', res.status);
  process.exit(1);
}
const cookies = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''])
  .map((c) => c.split(';')[0])
  .join('; ');

const base = `by-subprogram/${idSubprogram}/by-school/${idSchool}/by-budget/${idBudget}`;

const rotas = {
  budget: `budget/${base}`,
  propostas: `budget-proposal/${base}?sortBy=totalPropose:ASC&page=1&limit=50`,
  itens: `budget-proposal-item/${base}/by-supplier/${idSupplier}?sortBy=budgetItem.nuItemOrder:ASC&page=1&limit=9999`,
};

/** Campos cujo nome sugere data, em qualquer profundidade. */
function camposDeData(valor, caminho = '', achados = {}) {
  if (valor === null || typeof valor !== 'object') return achados;
  for (const [k, v] of Object.entries(valor)) {
    const p = caminho ? `${caminho}.${k}` : k;
    if (/^dt|date|_at$|Date$/i.test(k)) achados[p] = v;
    else camposDeData(v, p, achados);
  }
  return achados;
}

for (const [nome, rota] of Object.entries(rotas)) {
  const r = await fetch(`${API_BASE}/${rota}`, {
    headers: { Cookie: cookies, Accept: 'application/json' },
  });
  console.log(`\n===== ${nome} (HTTP ${r.status}) =====`);
  if (!r.ok) continue;
  const json = await r.json();
  const amostra = Array.isArray(json?.data) ? json.data[0] : json;
  console.log('-- chaves:', Object.keys(amostra ?? {}).join(', '));
  console.log('-- campos com cara de data:', JSON.stringify(camposDeData(json), null, 1));
}
