"""
Sonda etapa 4 — LicitarDigital: do SSO ate a plataforma do fornecedor.

Etapa 3 revelou que minhaconta.licitardigital.com.br e' apenas o SSO (Perfil,
Metodos de Login, Preferencias). A plataforma de licitacoes fica atras de
"Contas -> Escolha o seu tipo de acesso" (/oauth2/in/), provavelmente em outro
host — que e' onde api.licitardigital.com.br deve ser usada.

Este script: login -> /oauth2/in/ -> mapeia os tipos de acesso -> entra no
perfil de fornecedor -> captura host e rotas da plataforma.

Uso:
    python scripts/licitardigital_contas.py
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
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out"
ENV = ROOT / "backend" / ".env"

SENSIVEL = re.compile(r"(authorization|token|senha|password|cookie|key)", re.I)
IGNORAR = re.compile(r"\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico|map)(\?|$)", re.I)
# Perfil de quem VENDE (nosso caso), nao de quem compra.
FORNECEDOR = re.compile(r"(fornecedor|licitante|particip|vendedor|empresa)", re.I)

capturado: list[dict] = []

JS_CLICAVEIS = """
(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  return JSON.stringify(
    [...document.querySelectorAll('a,button,[role=button],[class*=card],[class*=account],[class*=profile]')]
      .filter(vis)
      .map((el, i) => ({
        i,
        tag: el.tagName.toLowerCase(),
        texto: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
        href: el.getAttribute('href') || null,
        id: el.id || null,
        cls: (el.className || '').toString().slice(0, 60),
      }))
      .filter((e) => e.texto)
  );
})()
"""


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


async def diagnostico(tab, etapa: str):
    """Onde exatamente travou: url, titulo, e o que esta visivel na tela."""
    shot = OUT / f"ld_4_falha_{etapa}.png"
    await tab.take_screenshot(path=str(shot))
    estado = await js_val(
        tab,
        "(() => { const q = (s) => { const el = document.querySelector(s);"
        " if (!el) return 'ausente'; const r = el.getBoundingClientRect();"
        " const st = getComputedStyle(el);"
        " return (r.width>0 && r.height>0 && st.visibility!=='hidden'"
        " && st.display!=='none') ? 'visivel' : 'oculto'; };"
        " return ['#username='+q('#username'), '#password='+q('#password'),"
        " '#next-button='+q('#next-button'), '#login='+q('#login')].join(' | '); })()",
    )
    texto = await js_val(
        tab, "(document.body.innerText || '').trim().replace(/\\s+/g,' ').slice(0, 300)"
    )
    print(f"   [FALHA em {etapa}]")
    print(f"     url    : {await tab.current_url}")
    print(f"     campos : {estado}")
    print(f"     texto  : {texto}")
    print(f"     shot   : {shot.name}")


async def login(tab, cpf, senha) -> bool:
    async with tab.expect_and_bypass_cloudflare_captcha():
        await tab.go_to(SSO)
    await asyncio.sleep(8)

    campo = await esperar_visivel(tab, "#username", timeout=20)
    if not campo:
        await diagnostico(tab, "01_username")
        return False
    await campo.type_text(cpf, humanize=True)
    await asyncio.sleep(1)

    botao = await esperar_visivel(tab, "#next-button", timeout=10)
    if not botao:
        await diagnostico(tab, "02_next")
        return False
    await botao.click()
    await asyncio.sleep(6)

    pwd = await esperar_visivel(tab, "#password", timeout=25)
    if not pwd:
        await diagnostico(tab, "03_password")
        return False
    await pwd.type_text(senha, humanize=True)
    await asyncio.sleep(1)

    entrar = await esperar_visivel(tab, "#login", timeout=10)
    if not entrar:
        await diagnostico(tab, "04_entrar")
        return False
    await entrar.click()
    await asyncio.sleep(12)

    if "/oauth2/me" not in (await tab.current_url):
        await diagnostico(tab, "05_pos_login")
        return False
    return True


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cpf, senha = ler_env()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()
        await tab.enable_network_events()
        await tab.on(NetworkEvent.REQUEST_WILL_BE_SENT, on_request)

        print("1) Login no SSO...")
        if not await login(tab, cpf, senha):
            print("   ERRO: login falhou.")
            return 1
        print(f"   OK: {await tab.current_url}")

        print("2) Abrindo 'Contas' (/oauth2/in/)...")
        await tab.go_to(SSO)
        await asyncio.sleep(8)
        await tab.take_screenshot(path=str(OUT / "ld_4_01_contas.png"))

        opcoes = await js(tab, JS_CLICAVEIS)
        print(f"   {len(opcoes)} elementos clicaveis:")
        for o in opcoes[:25]:
            print(f"     [{o['i']}] {o['texto'][:60]:60} href={o['href']}")

        alvos = [o for o in opcoes if FORNECEDOR.search(f"{o['texto']} {o['cls']}")]
        print(f"\n   Candidatos a perfil de FORNECEDOR: {len(alvos)}")
        for o in alvos:
            print(f"     [{o['i']}] {o['texto'][:60]}")

        antes = await tab.current_url
        if alvos:
            print(f"\n3) Entrando em: {alvos[0]['texto'][:50]!r}")
            # Clique por JS pelo indice. O filtro aqui tem que ser IDENTICO ao
            # de JS_CLICAVEIS (so visibilidade) — o indice 'i' e' atribuido la
            # antes do filtro de texto, entao filtrar por texto aqui
            # desalinharia os indices.
            await js_val(
                tab,
                "(() => { const els = [...document.querySelectorAll("
                "'a,button,[role=button],[class*=card],[class*=account],[class*=profile]')]"
                ".filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);"
                " return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; });"
                f" els[{alvos[0]['i']}] && els[{alvos[0]['i']}].click(); return 'ok'; }})()",
            )
            await asyncio.sleep(12)
            await tab.take_screenshot(path=str(OUT / "ld_4_02_plataforma.png"))

        depois = await tab.current_url
        print(f"\n   URL antes : {antes}")
        print(f"   URL depois: {depois}")

        hosts = {}
        for c in capturado:
            h = re.sub(r"^https?://([^/]+).*", r"\1", c["url"])
            hosts[h] = hosts.get(h, 0) + 1
        print(f"\n4) Hosts contactados: {hosts}")

        api = [c for c in capturado if "api." in c["url"] or "/api/" in c["url"]]
        xhr = [c for c in capturado if c.get("tipo") in ("XHR", "Fetch")]
        chaves = {json.dumps(c, sort_keys=True) for c in api + xhr}
        rotas = sorted((json.loads(c) for c in chaves), key=lambda c: c["url"])
        print(f"\n5) Rotas de API/XHR ({len(rotas)}):")
        for c in rotas[:40]:
            sens = f"  hdrs={c['headers_sensiveis']}" if c["headers_sensiveis"] else ""
            print(f"     {c['metodo']:6} {c['url'][:110]}{sens}")

        (OUT / "ld_contas.json").write_text(
            json.dumps(
                {"url_final": depois, "hosts": hosts, "opcoes": opcoes, "rotas": rotas},
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"\nSalvo em {OUT / 'ld_contas.json'}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
