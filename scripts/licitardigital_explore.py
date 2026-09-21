"""
Sonda etapa 3 — LicitarDigital: mapear a area logada.

Pergunta que decide o adaptador: existe uma tela com as licitacoes DA EMPRESA
(propostas/resultados)? Se so houver consulta publica de editais, e' prospeccao
e esta fora do escopo do painel.

Reaproveita o fluxo ja provado em licitardigital_login.py.

Uso:
    python scripts/licitardigital_explore.py

Saidas:
    scripts/out/ld_3_*.png
    scripts/out/ld_area_logada.json   links/menus + rotas de API
"""

import asyncio
import json
import re
import time
from pathlib import Path

from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions
from pydoll.protocol.network.events import NetworkEvent

URL = "https://minhaconta.licitardigital.com.br/oauth2/in/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out"
ENV = ROOT / "backend" / ".env"

SENSIVEL = re.compile(r"(authorization|token|senha|password|cookie|key)", re.I)
IGNORAR = re.compile(r"\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico|map)(\?|$)", re.I)

# Palavras que sugerem "minhas licitacoes" e nao "buscar editais".
PISTAS_EMPRESA = re.compile(
    r"(minhas|minha|propost|process|disput|lance|participa|fornecedor|"
    r"empresa|contrat|habilita|julgamen|resultado|agenda)",
    re.I,
)

capturado: list[dict] = []

JS_LINKS = """
(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  return JSON.stringify(
    [...document.querySelectorAll('a,button,[role=menuitem],[routerlink]')]
      .filter(vis)
      .map((el) => ({
        texto: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
        href: el.getAttribute('href') || el.getAttribute('routerlink') || null,
      }))
      .filter((e) => e.texto || e.href)
  );
})()
"""


def mascarar(v: str) -> str:
    return f"<{len(v)} chars>" if v else ""


def ler_env() -> tuple[str, str]:
    d = {}
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if linha.startswith("LICITAR_DIGITAL_"):
            k, _, v = linha.partition("=")
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d["LICITAR_DIGITAL_USER"], d["LICITAR_DIGITAL_PASS"]


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


async def on_request(event):
    try:
        req = event["params"]["request"]
        url = req.get("url", "")
        if url.startswith("data:") or IGNORAR.search(url) or "cdn-cgi" in url:
            return
        hdrs = req.get("headers") or {}
        capturado.append(
            {
                "metodo": req.get("method"),
                "url": url,
                "tipo": event["params"].get("type"),
                "headers_sensiveis": [k for k in hdrs if SENSIVEL.search(k)],
                "tem_body": bool(req.get("postData")),
            }
        )
    except Exception:
        pass


async def js_val(tab, script):
    """Valor cru do eval, sem parse."""
    bruto = await tab.execute_script(script)
    if isinstance(bruto, dict):
        bruto = bruto.get("result", {}).get("result", {}).get("value", bruto)
    return bruto


async def js(tab, script):
    """Para scripts que retornam JSON.stringify(...)."""
    bruto = await js_val(tab, script)
    return json.loads(bruto) if isinstance(bruto, str) else bruto


async def esperar_visivel(tab, css: str, timeout: int = 20):
    """find() acha elemento oculto (o #password existe desde o inicio, hidden).
    Aqui espera ficar de fato visivel antes de interagir."""
    script = (
        "(() => { const el = document.querySelector('%s'); if (!el) return 'ausente';"
        " const r = el.getBoundingClientRect(); const s = getComputedStyle(el);"
        " return (r.width > 0 && r.height > 0 && s.visibility !== 'hidden'"
        " && s.display !== 'none') ? 'visivel' : 'oculto'; })()" % css
    )
    for _ in range(timeout * 2):
        estado = await js_val(tab, script)
        if estado == "visivel":
            return await tab.query(css)
        await asyncio.sleep(0.5)
    return None


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cpf, senha = ler_env()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()
        await tab.enable_network_events()
        await tab.on(NetworkEvent.REQUEST_WILL_BE_SENT, on_request)

        print("1) Login...")
        async with tab.expect_and_bypass_cloudflare_captcha():
            await tab.go_to(URL)
        await asyncio.sleep(8)

        campo = await tab.find(id="username", timeout=10, raise_exc=False)
        if not campo:
            print("   ERRO: #username nao encontrado")
            return 1
        await campo.type_text(cpf, humanize=True)
        await asyncio.sleep(1)
        await (await tab.find(id="next-button", timeout=10)).click()
        await asyncio.sleep(6)
        await tab.take_screenshot(path=str(OUT / "ld_3_00_pos_avancar.png"))

        pwd = await esperar_visivel(tab, "#password", timeout=25)
        if not pwd:
            print("   ERRO: #password nunca ficou visivel.")
            print("   Ver scripts/out/ld_3_00_pos_avancar.png para o estado da tela.")
            return 1
        await pwd.type_text(senha, humanize=True)
        await asyncio.sleep(1)

        entrar = await esperar_visivel(tab, "#login", timeout=10)
        if not entrar:
            print("   ERRO: #login nao ficou visivel.")
            return 1
        await entrar.click()
        await asyncio.sleep(12)

        url_logada = await tab.current_url
        print(f"   logado em: {url_logada}")
        await tab.take_screenshot(path=str(OUT / "ld_3_01_area_logada.png"))

        print("2) Mapeando menus/links da area logada...")
        links = await js(tab, JS_LINKS)
        # Dedup preservando ordem.
        vistos, unicos = set(), []
        for l in links:
            chave = (l["texto"], l["href"])
            if chave not in vistos:
                vistos.add(chave)
                unicos.append(l)

        candidatos = [l for l in unicos if PISTAS_EMPRESA.search(f"{l['texto']} {l['href'] or ''}")]

        print(f"   {len(unicos)} elementos visiveis | {len(candidatos)} candidatos\n")
        print("   --- CANDIDATOS (podem levar as licitacoes da empresa) ---")
        for l in candidatos[:30]:
            print(f"     {l['texto'][:45]:45} -> {l['href']}")
        print("\n   --- TODOS os links visiveis ---")
        for l in unicos[:50]:
            print(f"     {l['texto'][:45]:45} -> {l['href']}")

        api = [c for c in capturado if "api." in c["url"] or "/api/" in c["url"]]
        xhr = [c for c in capturado if c.get("tipo") in ("XHR", "Fetch")]
        chaves = {json.dumps(c, sort_keys=True) for c in api + xhr}
        rotas = sorted((json.loads(c) for c in chaves), key=lambda c: c["url"])

        print(f"\n3) Rotas de API/XHR observadas ({len(rotas)}):")
        for c in rotas[:40]:
            print(f"     {c['metodo']:6} {c['url'][:110]}")

        (OUT / "ld_area_logada.json").write_text(
            json.dumps(
                {"url_logada": url_logada, "links": unicos, "candidatos": candidatos, "rotas": rotas},
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"\nSalvo em {OUT / 'ld_area_logada.json'}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
