"""
Sonda etapa 6 — LicitarDigital: a API dos FAVORITOS (o que a empresa disputa).

Descobertas ate aqui:
  - API real: manager-api.licitardigital.com.br  (NAO api.licitardigital.com.br,
    que era o palpite de 17/09 e levava a 404)
  - Endpoint da listagem: POST /auction-notice/doSearchAuctionNotice
  - O campo 'shortFilter' troca a visao: 'proposal' | favoritos | sugeridos
  - Empresa: ARTEFATOS DE PAPEL LUCRI LTDA, companyId/providerId = 4709

Correcao de negocio dada pelo usuario: os leiloes em que a empresa esta
participando ficam em FAVORITOS, nao em "Propostas iniciadas".

Este script captura o body real da chamada dos favoritos e replaya o request
dentro da pagina (onde o token ja existe) para revelar o formato da resposta.

Segredo: o token NUNCA e' impresso. So o nome do header e o formato do payload.

Uso:
    python scripts/licitardigital_favoritos.py
"""

import asyncio
import json
import re
import time
from pathlib import Path

from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions
from pydoll.protocol.network.events import NetworkEvent

SSO = "https://minhaconta.licitardigital.com.br/oauth2/in/"
FAVORITOS = "https://app2.licitardigital.com.br/pesquisa?onlyFavorites"
ENDPOINT = "auction-notice/doSearchAuctionNotice"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out"
ENV = ROOT / "backend" / ".env"

requisicoes: list[dict] = []


def build_options() -> ChromiumOptions:
    o = ChromiumOptions()
    o.headless = False
    o.binary_location = CHROME
    o.start_timeout = 30
    o.add_argument("--window-size=1920,1080")
    fake = int(time.time()) - (7 * 24 * 60 * 60)
    o.browser_preferences = {
        "profile": {
            "last_engagement_time": fake,
            "exit_type": "Normal",
            "exited_cleanly": True,
            "password_manager_enabled": False,
        },
        "intl": {"accept_languages": "pt-BR,pt,en-US,en"},
    }
    o.webrtc_leak_protection = True
    return o


def ler_env() -> tuple[str, str]:
    d = {}
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if linha.startswith("LICITAR_DIGITAL_"):
            k, _, v = linha.partition("=")
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d["LICITAR_DIGITAL_USER"], d["LICITAR_DIGITAL_PASS"]


respostas: list[str] = []  # requestIds do endpoint alvo


async def on_request(event):
    try:
        p = event["params"]
        req = p["request"]
        url = req.get("url", "")
        if ENDPOINT not in url or req.get("method") != "POST":
            return
        requisicoes.append({"url": url, "body": req.get("postData")})
    except Exception:
        pass


async def on_response(event):
    """Guarda o requestId para buscar o corpo depois. execute_script nao aguarda
    Promise (sem awaitPromise), entao replay por fetch volta undefined — o
    caminho confiavel e' o corpo que o proprio CDP ja tem."""
    try:
        p = event["params"]
        if ENDPOINT in p.get("response", {}).get("url", ""):
            respostas.append(p["requestId"])
    except Exception:
        pass


async def js_val(tab, script):
    bruto = await tab.execute_script(script)
    if isinstance(bruto, dict):
        bruto = bruto.get("result", {}).get("result", {}).get("value", bruto)
    return bruto


async def js(tab, script):
    bruto = await js_val(tab, script)
    return json.loads(bruto) if isinstance(bruto, str) else bruto


async def esperar_visivel(tab, css: str, timeout: int = 20):
    script = (
        "(() => { const el = document.querySelector('%s'); if (!el) return 'ausente';"
        " const r = el.getBoundingClientRect(); const s = getComputedStyle(el);"
        " return (r.width > 0 && r.height > 0 && s.visibility !== 'hidden'"
        " && s.display !== 'none') ? 'visivel' : 'oculto'; })()" % css
    )
    for _ in range(timeout * 2):
        if await js_val(tab, script) == "visivel":
            return await tab.query(css)
        await asyncio.sleep(0.5)
    return None


async def abrir_tela_login(tab, tentativas: int = 3) -> bool:
    for n in range(1, tentativas + 1):
        try:
            async with tab.expect_and_bypass_cloudflare_captcha():
                await tab.go_to(SSO)
        except Exception:
            pass
        await asyncio.sleep(8)
        if await esperar_visivel(tab, "#username", timeout=20):
            return True
        print(f"   challenge na tentativa {n}/{tentativas}, recarregando")
        await asyncio.sleep(5)
    return False


async def login(tab, cpf, senha) -> bool:
    if not await abrir_tela_login(tab):
        return False
    campo = await esperar_visivel(tab, "#username", timeout=20)
    await campo.type_text(cpf, humanize=True)
    await asyncio.sleep(1)
    b = await esperar_visivel(tab, "#next-button", timeout=10)
    if not b:
        return False
    await b.click()
    await asyncio.sleep(8)
    pwd = await esperar_visivel(tab, "#password", timeout=25)
    if not pwd:
        return False
    await pwd.type_text(senha, humanize=True)
    await asyncio.sleep(1)
    e = await esperar_visivel(tab, "#login", timeout=10)
    if not e:
        return False
    await e.click()
    await asyncio.sleep(12)
    return "/oauth2/me" in (await tab.current_url)


async def entrar_como_fornecedor(tab) -> bool:
    await tab.go_to(SSO)
    await asyncio.sleep(8)
    if not await esperar_visivel(tab, "#select_organization", timeout=20):
        return False
    ok = await js_val(
        tab,
        "(() => { const s = document.querySelector('#select_organization');"
        " const opt = [...s.options].find(o => o.dataset.type === 'provider');"
        " if (!opt) return 'sem-provider'; s.value = opt.value;"
        " s.dispatchEvent(new Event('change', {bubbles: true})); return 'ok'; })()",
    )
    if ok != "ok":
        return False
    await asyncio.sleep(2)
    clique = await js_val(
        tab,
        "(() => { const vis = (el) => { const r = el.getBoundingClientRect();"
        " const s = getComputedStyle(el); return r.width>0 && r.height>0"
        " && s.visibility!=='hidden' && s.display!=='none'; };"
        " const alvo = [...document.querySelectorAll('a,button,input[type=submit]')]"
        ".filter(vis).find(el => /avan[cç]ar/i.test((el.innerText||el.value||'').trim()));"
        " if (!alvo) return 'nao'; alvo.click(); return 'ok'; })()",
    )
    if clique != "ok":
        return False
    await asyncio.sleep(15)
    return True


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cpf, senha = ler_env()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()
        await tab.enable_network_events()
        await tab.on(NetworkEvent.REQUEST_WILL_BE_SENT, on_request)
        await tab.on(NetworkEvent.RESPONSE_RECEIVED, on_response)

        print("1) Login...")
        if not await login(tab, cpf, senha):
            print("   ERRO: login falhou.")
            return 1

        print("2) Entrando como fornecedor...")
        if not await entrar_como_fornecedor(tab):
            print("   ERRO: perfil de fornecedor falhou.")
            return 1

        print(f"3) Abrindo FAVORITOS: {FAVORITOS}")
        requisicoes.clear()
        respostas.clear()
        await tab.go_to(FAVORITOS)
        await asyncio.sleep(20)
        await tab.take_screenshot(path=str(OUT / "ld_6_favoritos.png"))

        print(f"\n4) Chamadas a {ENDPOINT}: {len(requisicoes)}")
        if not requisicoes:
            print("   ERRO: a listagem nao disparou. A tela pode exigir clique")
            print("   na aba 'Favoritos' em vez do query param.")
            return 1

        for i, r in enumerate(requisicoes):
            print(f"\n   --- request {i} ---")
            try:
                corpo = json.loads(r["body"]) if r["body"] else {}
                print(json.dumps(corpo, indent=4, ensure_ascii=False)[:1500])
            except Exception:
                print(f"   body cru: {str(r['body'])[:500]}")

        body = requisicoes[-1]["body"]
        url = requisicoes[-1]["url"]

        print(f"\n5) Corpo da resposta ({len(respostas)} capturadas)...")
        dados = None
        for rid in reversed(respostas):
            try:
                bruto = await tab.get_network_response_body(rid)
                if isinstance(bruto, dict):
                    bruto = bruto.get("body", bruto)
                dados = json.loads(bruto) if isinstance(bruto, str) else bruto
                break
            except Exception as exc:
                print(f"   requestId {rid}: {type(exc).__name__}")

        if dados is None:
            print("   ERRO: nao consegui ler o corpo da resposta.")
            return 1

        topo = list(dados) if isinstance(dados, dict) else type(dados).__name__
        lista = dados
        for chave in ("data", "items", "result", "rows"):
            if isinstance(lista, dict) and chave in lista:
                lista = lista[chave]
        if isinstance(lista, dict):
            for chave in ("data", "items", "rows"):
                if chave in lista:
                    lista = lista[chave]
                    break
        itens = lista if isinstance(lista, list) else []

        total = None
        if isinstance(dados, dict):
            for chave in ("total", "count", "totalCount", "totalRecords"):
                if chave in dados:
                    total = dados[chave]
                    break

        print(f"   chaves do topo      : {topo}")
        print(f"   total declarado     : {total}")
        print(f"   itens nesta pagina  : {len(itens)}")
        if itens:
            print(f"   campos de cada item : {list(itens[0])}")
            print("\n   --- AMOSTRA (item 0) ---")
            print(json.dumps(itens[0], indent=4, ensure_ascii=False)[:2000])

        (OUT / "ld_favoritos.json").write_text(
            json.dumps(
                {
                    "url": url,
                    "request_body": json.loads(body) if body else None,
                    "total": total,
                    "campos": list(itens[0]) if itens else None,
                    "itens": itens,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"\nSalvo em {OUT / 'ld_favoritos.json'}")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except PermissionError as exc:
        print(f"\n[limpeza] temp do Chrome preso, ignorando: {exc.filename}")
        raise SystemExit(0)
