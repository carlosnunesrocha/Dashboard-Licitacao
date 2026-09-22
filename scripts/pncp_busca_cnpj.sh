#!/usr/bin/env bash
# Varre os contratos do PNCP numa janela de datas e filtra pelo CNPJ da empresa.
#
# Por que varrer em vez de filtrar na origem: a API aceita `niFornecedor` na
# URL mas **ignora** o parâmetro — medido em 2026-09-22, devolveu 368
# fornecedores distintos numa página só. O CNPJ vem como campo de leitura em
# cada contrato, então o filtro tem de ser do nosso lado.
#
# A API tem rate limit agressivo (429/503 com facilidade), daí a pausa entre
# páginas. Não baixar de 2s.
#
# Uso:  bash scripts/pncp_busca_cnpj.sh [dataInicial] [dataFinal] [maxPaginas]
#       bash scripts/pncp_busca_cnpj.sh 20260901 20260922
set -uo pipefail
cd "$(dirname "$0")/.."

CNPJ="${PNCP_CNPJ:-17183484000154}"   # Artefatos de Papel Lucri, só dígitos
INICIO="${1:-$(date -d '-30 days' +%Y%m%d 2>/dev/null || date -v-30d +%Y%m%d)}"
FIM="${2:-$(date +%Y%m%d)}"
MAX_PAGINAS="${3:-999}"
PAUSA=2

OUT="scripts/out/pncp"
mkdir -p "$OUT"
ACHADOS="$OUT/achados_${CNPJ}.json"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
BASE="https://pncp.gov.br/api/consulta/v1/contratos/atualizacao"

echo "CNPJ .... $CNPJ"
echo "janela .. $INICIO a $FIM"
echo

pagina=1
total_paginas=0
total_varridos=0
echo "[]" > "$ACHADOS"

while [ "$pagina" -le "$MAX_PAGINAS" ]; do
  url="${BASE}?dataInicial=${INICIO}&dataFinal=${FIM}&pagina=${pagina}"
  http=$(curl -s --max-time 60 "$url" -H "Accept: application/json" \
    -H "User-Agent: $UA" -o "$OUT/pagina.json" -w "%{http_code}")

  # 429/503 = rate limit. Espera crescente em vez de desistir: a varredura é
  # longa e recomeçar do zero sai mais caro do que aguardar.
  if [ "$http" = "429" ] || [ "$http" = "503" ]; then
    espera=$((PAUSA * 15))
    echo "  pág $pagina: HTTP $http (limite) — aguardando ${espera}s"
    sleep "$espera"
    continue
  fi
  if [ "$http" != "200" ]; then
    echo "  pág $pagina: HTTP $http — abortando"
    break
  fi

  linha=$(node -e "
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$OUT/pagina.json','utf8'));
    const meus=d.data.filter(c=>c.niFornecedor==='$CNPJ');
    if(meus.length){
      const acc=JSON.parse(fs.readFileSync('$ACHADOS','utf8'));
      fs.writeFileSync('$ACHADOS', JSON.stringify(acc.concat(meus),null,1));
    }
    console.log([d.totalPaginas, d.data.length, meus.length].join(' '));
  ")
  set -- $linha
  total_paginas=$1; nesta=$2; achou=$3
  total_varridos=$((total_varridos + nesta))

  [ "$achou" -gt 0 ] && echo "  pág $pagina/$total_paginas: ★ $achou contrato(s) da empresa" \
                     || printf "\r  pág %s/%s (%s varridos)   " "$pagina" "$total_paginas" "$total_varridos"

  [ "$pagina" -ge "$total_paginas" ] && break
  pagina=$((pagina + 1))
  sleep "$PAUSA"
done

echo; echo
TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ACHADOS','utf8')).length)")
echo "varridos: $total_varridos contratos em $((pagina)) páginas"
echo "da empresa: $TOTAL"
[ "$TOTAL" -gt 0 ] && node -e "
  const a=JSON.parse(require('fs').readFileSync('$ACHADOS','utf8'));
  for(const c of a) console.log('  •', c.orgaoEntidade.razaoSocial,
    '| R\$', Number(c.valorInicial).toLocaleString('pt-BR'),
    '|', (c.objetoContrato||'').slice(0,60));
"
echo
echo "resultado em $ACHADOS (ignorado pelo git)"
