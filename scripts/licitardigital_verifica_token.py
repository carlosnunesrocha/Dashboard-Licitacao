"""
Verifica o LICITAR_DIGITAL_TOKEN do .env sem expo-lo.

Responde tres coisas de uma vez:
  1. o token e' valido?
  2. a resposta vem ESCOPADA a empresa (flags true) ou e' a consulta publica?
  3. quantos registros tem cada visao (proposal vs favorite)?

O (2) e' o ponto critico: sem token valido a API nao da erro — ela ignora o
shortFilter e devolve ~101 mil editais publicos. E' o modo de falha que o
verificarEscopo() do adaptador existe para barrar.

O token nunca e' impresso.

Uso:
    python scripts/licitardigital_verifica_token.py
"""

import json
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

API = "https://manager-api.licitardigital.com.br/auction-notice/doSearchAuctionNotice"
APP = "https://app2.licitardigital.com.br"
ENV = Path(__file__).resolve().parent.parent / "backend" / ".env"

# Sem estes cabecalhos o Cloudflare responde 403 antes de chegar no app.
HEADERS = {
    "Content-Type": "application/json",
    "Origin": APP,
    "Referer": f"{APP}/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

TETO_ADAPTADOR = 5_000  # MAX_ESPERADO no licitar-digital.adapter.ts


def ler_token() -> str | None:
    if not ENV.exists():
        return None
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if linha.strip().startswith("LICITAR_DIGITAL_TOKEN="):
            return linha.partition("=")[2].strip().strip('"').strip("'")
    return None


def buscar(
    token: str, short_filter: str, offset: int = 0, *, prefixo: str = ""
) -> tuple[int, dict | None, str]:
    """Retorna (status, corpo_json, texto_do_erro). O corpo do erro importa:
    um 400 costuma dizer o que a API esperava."""
    corpo = json.dumps(
        {
            "filter": {
                "supliesProviders": [],
                "shortFilter": short_filter,
                "startDate": 0,
                "startDatePublication": 0,
                "isMarketplace": 0,
            },
            "offset": offset,
        }
    ).encode()
    req = urllib.request.Request(
        API,
        data=corpo,
        headers={**HEADERS, "Authorization": f"{prefixo}{token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read()), ""
    except urllib.error.HTTPError as e:
        try:
            detalhe = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            detalhe = ""
        return e.code, None, detalhe


def main() -> int:
    token = ler_token()
    if not token:
        print("ERRO: LICITAR_DIGITAL_TOKEN vazio ou ausente em backend/.env")
        return 1

    print(f"Token encontrado: {len(token)} chars, {token.count('.') + 1} partes")

    # Valida ANTES de ir na rede. O erro mais comum e' colar o valor que o
    # DevTools mostra abreviado, que vem com reticencias no meio.
    if "…" in token or "..." in token:
        print("\nERRO: o token contem reticencias — foi copiado TRUNCADO da tela.")
        print("  O DevTools abrevia strings longas na exibicao. Para copiar inteiro,")
        print('  use no Console:   copy(localStorage.getItem("_LDToken"))')
        print("  Isso poe o valor completo na area de transferencia, sem cortar.")
        return 1

    nao_ascii = [c for c in token if ord(c) > 127]
    if nao_ascii:
        print(f"\nERRO: o token tem caractere nao-ASCII ({nao_ascii[:3]}). "
              "Um JWT e' base64url: so A-Z a-z 0-9 - _ e ponto.")
        return 1

    if any(c.isspace() for c in token):
        print("\nERRO: o token tem espaco/quebra de linha. Cole em uma linha so, sem aspas.")
        return 1

    if token.count(".") != 2:
        print("\nERRO: um JWT tem 3 partes separadas por ponto; este tem "
              f"{token.count('.') + 1}. Valor incompleto.")
        return 1

    if len(token) < 200:
        print(f"\nAVISO: {len(token)} chars e' curto — o _LDToken observado tinha 335. "
              "Provavelmente esta incompleto; seguindo mesmo assim para confirmar.")
    print()

    # A API aceita o JWT cru ou exige o prefixo Bearer? Descobrir antes de
    # concluir qualquer coisa sobre a validade do token — um 400 por formato
    # de header e' facil de confundir com token invalido.
    print("Descobrindo o formato do header Authorization:")
    prefixo = None
    for candidato in ("", "Bearer "):
        status, corpo, detalhe = buscar(token, "proposal", prefixo=candidato)
        rotulo = "JWT cru" if candidato == "" else "Bearer <JWT>"
        ok = corpo is not None and "data" in (corpo or {})
        print(f"  {rotulo:14} -> HTTP {status}" + (f"  {detalhe[:120]}" if detalhe else ""))
        if ok and prefixo is None:
            prefixo = candidato
    if prefixo is None:
        print("\nNenhum dos formatos funcionou. Ver o detalhe do erro acima.")
        return 1
    print(f"  => usando: {'JWT cru' if prefixo == '' else 'Bearer <JWT>'}\n")

    problemas = []

    for filtro in ("proposal", "favorite"):
        status, corpo, detalhe = buscar(token, filtro, prefixo=prefixo)
        print(f"--- shortFilter = {filtro} ---")

        if status in (401, 403):
            print(f"  HTTP {status}: token rejeitado ou WAF. {detalhe[:150]}")
            problemas.append(f"{filtro}: HTTP {status}")
            print()
            continue
        if not corpo:
            print(f"  HTTP {status}: {detalhe[:200] or 'sem corpo utilizavel'}")
            problemas.append(f"{filtro}: HTTP {status}")
            print()
            continue

        itens = corpo.get("data") or []
        meta = corpo.get("meta") or {}
        total = meta.get("count")
        print(f"  HTTP {status}  |  total: {total}  |  nesta pagina: {len(itens)}"
              f"  |  limit: {meta.get('limit')}")

        if itens:
            flags = Counter(
                (i.get("isFavorite"), i.get("hasProposal")) for i in itens
            )
            print("  flags (isFavorite, hasProposal):")
            for k, v in sorted(flags.items(), key=lambda x: -x[1]):
                print(f"     fav={str(k[0]):5} prop={str(k[1]):5} -> {v}")

        # O mesmo criterio do adaptador.
        if total and total > TETO_ADAPTADOR:
            print(f"  >> ESCOPO FALHOU: {total} passa do teto {TETO_ADAPTADOR}."
                  " Isso e' a consulta publica, nao a empresa.")
            problemas.append(f"{filtro}: resposta nao escopada ({total})")
        elif itens:
            campo = "hasProposal" if filtro == "proposal" else "isFavorite"
            fora = [i["id"] for i in itens if not i.get(campo)]
            if fora:
                print(f"  >> ESCOPO FALHOU: itens sem {campo}: {fora[:5]}")
                problemas.append(f"{filtro}: itens fora do filtro")
            else:
                paginas = -(-total // 20) if total else 0
                print(f"  >> OK: escopado a empresa. {paginas} pagina(s) a sincronizar.")
        print()

    print("=" * 60)
    if problemas:
        print("RESULTADO: PROBLEMAS ->", "; ".join(problemas))
        return 1
    print("RESULTADO: token valido e respostas escopadas a empresa.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
