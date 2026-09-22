#!/usr/bin/env bash
# Sonda o BNC com o cookie de sessão copiado do navegador.
#
# Responde três perguntas que decidem se o adaptador é viável:
#   1. O cookie autentica? (302 para /Base/DataResult = não)
#   2. A resposta é JSON ou HTML renderizado?
#   3. Quantos registros a empresa tem, e em que situações?
#
# O cookie sai do .env e vai ao curl por stdin (--config -), nunca por
# argumento: argumento aparece na lista de processos da máquina.
#
# Uso:  bash scripts/bnc_sonda.sh [fkStatus] [fkModality] [dias]
#       bash scripts/bnc_sonda.sh              # sem filtro, 180 dias
#       bash scripts/bnc_sonda.sh 24 1 180     # homologado + pregão
set -uo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="backend/.env"
[ -f "$ENV_FILE" ] || { echo "ERRO: $ENV_FILE não encontrado."; exit 1; }

COOKIE=$(grep -E '^BNC_COMPRAS_COOKIE=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
if [ -z "$COOKIE" ]; then
  echo "ERRO: BNC_COMPRAS_COOKIE está vazio em $ENV_FILE."
  echo
  echo "Como preencher:"
  echo "  1. Entre no BNC pelo Chrome e vá até /Proposal/ProposalSearch"
  echo "  2. F12 → Network → clique em PESQUISAR"
  echo "  3. Na requisição, copie o valor inteiro do cabeçalho 'Cookie:'"
  echo "  4. Cole entre as aspas de BNC_COMPRAS_COOKIE no backend/.env"
  exit 1
fi

STATUS="${1:-}"
MODALITY="${2:-}"
DIAS="${3:-180}"

# O portal usa dd/MM/yyyy HH:mm:ss.
if date -d "now" >/dev/null 2>&1; then           # GNU date (Git Bash, Linux)
  FIM=$(date +'%d/%m/%Y %H:%M:%S')
  INICIO=$(date -d "-${DIAS} days" +'%d/%m/%Y %H:%M:%S')
else                                              # BSD date (macOS)
  FIM=$(date +'%d/%m/%Y %H:%M:%S')
  INICIO=$(date -v-"${DIAS}"d +'%d/%m/%Y %H:%M:%S')
fi

OUT_DIR="scripts/out/bnc"
mkdir -p "$OUT_DIR"
CORPO="$OUT_DIR/proposal_resposta.txt"

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
URL='https://bnccompras.com/Proposal/GetProposalsByParams'

echo "→ POST $URL"
echo "  janela .... $INICIO  ..  $FIM  (${DIAS} dias)"
echo "  fkStatus .. ${STATUS:-<vazio>}     fkModality .. ${MODALITY:-<vazio>}"
echo

# O cookie vai num arquivo de config temporário com permissão restrita, nunca
# em argv (argv aparece na lista de processos da máquina). O trap garante que
# ele suma mesmo se o script morrer no meio.
CFG=$(mktemp)
chmod 600 "$CFG"
trap 'rm -f "$CFG"' EXIT INT TERM

# ⚠️ Parâmetros vão na QUERY STRING, não no corpo — e as datas se chamam
# creationStart/creationEnd, não DateStart/DateEnd (estes são só os IDs dos
# inputs na tela). Conferido no JS da página logada em 2026-09-22.
# O `token` é o reCAPTCHA v3 invisível (action getProposals); sem ele o
# portal responde 302 "Captcha inválido".
QS="Organization=&Number=&City=&fkModality=${MODALITY}&fkStatus=${STATUS}"
QS="${QS}&creationStart=$(printf %s "$INICIO" | sed 's/ /%20/g; s|/|%2F|g; s/:/%3A/g')"
QS="${QS}&creationEnd=$(printf %s "$FIM" | sed 's/ /%20/g; s|/|%2F|g; s/:/%3A/g')"
QS="${QS}&Offset=0&token=${BNC_CAPTCHA_TOKEN:-}"

cat > "$CFG" <<EOF
url = "$URL?$QS"
request = "POST"
header = "Content-Type: application/json;charset=utf-8"
header = "Cookie: $COOKIE"
header = "User-Agent: $UA"
header = "X-Requested-With: XMLHttpRequest"
header = "Referer: https://bnccompras.com/Proposal/ProposalSearch"
header = "Origin: https://bnccompras.com"
header = "Accept: application/json, text/javascript, */*; q=0.01"
output = "$CORPO"
write-out = "%{http_code}"
silent
show-error
max-time = 45
EOF

HTTP=$(curl --config "$CFG" 2>"$OUT_DIR/curl_erro.txt")
[ -s "$OUT_DIR/curl_erro.txt" ] && { echo "curl disse:"; cat "$OUT_DIR/curl_erro.txt"; echo; }
[ -f "$CORPO" ] || { echo "✗ curl não gravou resposta nenhuma."; exit 5; }

echo "HTTP $HTTP  ($(wc -c < "$CORPO" | tr -d ' ') bytes)"
echo

case "$HTTP" in
  302|401|403)
    # O 302 tem dois significados bem diferentes: ler o destino é o que
    # distingue "sessão morta" de "sessão viva, faltou captcha".
    DESTINO=$(grep -oE 'message=[^&"]*' "$CORPO" | head -1 | sed 's/^message=//')
    case "$DESTINO" in
      *aptcha*)
        echo "⚠ COOKIE VÁLIDO, mas o portal exigiu CAPTCHA."
        echo "  A sessão autenticou (não é expiração). A rota valida um token"
        echo "  de reCAPTCHA no corpo do POST, gerado por JS na página."
        echo "  → Ver PROGRESS.md: isso inviabiliza sync automático." ;;
      *)
        echo "✗ NÃO AUTENTICADO — o cookie não vale mais."
        echo "  Sessão ASP.NET expira por inatividade (~20-30 min)."
        echo "  Copie o Cookie de novo, com o navegador recém-usado." ;;
    esac
    [ -n "$DESTINO" ] && echo "  (portal disse: $DESTINO)"
    exit 2 ;;
  404)
    echo "✗ 404 — rota ou nome de parâmetro errado. Confirmar no F12." ; exit 3 ;;
  200) : ;;
  *)
    echo "✗ status inesperado. Início da resposta:" ; head -c 300 "$CORPO" ; exit 4 ;;
esac

echo "✓ AUTENTICADO."
echo
PRIMEIRO=$(head -c 1 "$CORPO")
if [ "$PRIMEIRO" = "{" ] || [ "$PRIMEIRO" = "[" ]; then
  echo "FORMATO: JSON"
  echo "Chaves do topo:"
  grep -oE '"[a-zA-Z_]+"\s*:' "$CORPO" | head -20 | sed 's/^/  /'
else
  echo "FORMATO: HTML renderizado (como a busca pública) → adaptador precisa de parse"
fi
echo
echo "Linhas de tabela (<tr>): $(grep -oc '<tr' "$CORPO" 2>/dev/null || echo 0)"
echo
echo "Resposta salva em $CORPO  (ignorada pelo git; pode conter dados da empresa)"
echo "Se vier vazio, tente sem filtro de situação e janela curta:"
echo "    bash scripts/bnc_sonda.sh \"\" \"\" 30"
