"""
Sonda etapa 2 — LicitarDigital: login real + captura das rotas da API.

Objetivo duplo:
  1. Confirmar que o login em 2 etapas (CPF -> senha) funciona via pydoll.
  2. Descobrir as rotas de api.licitardigital.com.br, desconhecidas desde 17/09.

POLITICA: UMA tentativa de login. Sem retry — senha errada em laco bloqueia
a conta no portal.

Segredos: senha nunca e' impressa; valores de Authorization/token saem
mascarados. Apenas os NOMES dos headers interessam para montar o adaptador.

Uso:
    python scripts/licitardigital_login.py

Saidas:
    scripts/out/ld_2_*.png          screenshots de cada etapa
    scripts/out/ld_network.json     rotas capturadas (valores mascarados)
"""

import asyncio
import json
import os
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
# Ruido de front-end que nao interessa para o adaptador.
IGNORAR = re.compile(r"\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico|map)(\?|$)", re.I)

capturado: list[dict] = []


def mascarar(valor: str) -> str:
    if not valor:
        return ""
    return f"<{len(valor)} chars: {valor[:4]}...{valor[-2:]}>" if len(valor) > 8 else "<curto>"


def ler_env() -> tuple[str, str]:
    dados = {}
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if linha.startswith("LICITAR_DIGITAL_"):
            k, _, v = linha.partition("=")
            dados[k.strip()] = v.strip().strip('"').strip("'")
    user = dados.get("LICITAR_DIGITAL_USER", "")
    pwd = dados.get("LICITAR_DIGITAL_PASS", "")
    if not user or not pwd:
        raise SystemExit("LICITAR_DIGITAL_USER/PASS ausentes no backend/.env")
    return user, pwd


def build_options() -> ChromiumOptions:
    options = ChromiumOptions()
    options.headless = False  # Managed Challenge detecta headless
    options.binary_location = CHROME
    options.start_timeout = 30
    options.add_argument("--window-size=1920,1080")
    fake = int(time.time()) - (7 * 24 * 60 * 60)
    options.browser_preferences = {
        "profile": {
            "last_engagement_time": fake,
            "exit_type": "Normal",
            "exited_cleanly": True,
            "default_content_setting_values": {"notifications": 2, "geolocation": 2},
            "password_manager_enabled": False,
        },
        "intl": {"accept_languages": "pt-BR,pt,en-US,en"},
    }
    options.webrtc_leak_protection = True
    return options


async def on_request(event):
    try:
        req = event["params"]["request"]
        url = req.get("url", "")
        if url.startswith("data:") or IGNORAR.search(url):
            return
        headers = {
            k: (mascarar(v) if SENSIVEL.search(k) else v)
            for k, v in (req.get("headers") or {}).items()
        }
        capturado.append(
            {
                "metodo": req.get("method"),
                "url": url,
                "tipo": event["params"].get("type"),
                "headers_sensiveis": [k for k in headers if SENSIVEL.search(k)],
                "tem_body": bool(req.get("postData")),
            }
        )
    except Exception:
        pass


async def etapa(tab, nome: str):
    caminho = OUT / f"ld_2_{nome}.png"
    await tab.take_screenshot(path=str(caminho))
    print(f"  [{nome}] url={await tab.current_url}  -> {caminho.name}")


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cpf, senha = ler_env()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()

        await tab.enable_network_events()
        await tab.on(NetworkEvent.REQUEST_WILL_BE_SENT, on_request)

        print("1) Abrindo login (bypass Cloudflare)...")
        async with tab.expect_and_bypass_cloudflare_captcha():
            await tab.go_to(URL)
        await asyncio.sleep(8)
        await etapa(tab, "01_login")

        # IDs reais mapeados por licitardigital_inspect.py. NAO usar
        # find(tag_name='button'): pega o navbar-toggler invisivel.
        print("2) Preenchendo CPF (#username)...")
        campo_cpf = await tab.find(id="username", timeout=10, raise_exc=False)
        if not campo_cpf:
            print("   ERRO: #username nao encontrado.")
            await etapa(tab, "02_erro_cpf")
            return 1
        await campo_cpf.type_text(cpf, humanize=True)
        await asyncio.sleep(1)

        botao = await tab.find(id="next-button", timeout=10, raise_exc=False)
        if not botao:
            print("   ERRO: #next-button nao encontrado.")
            return 1
        await botao.click()
        await asyncio.sleep(6)
        await etapa(tab, "03_pos_avancar")

        print("3) Preenchendo senha (#password) — UMA tentativa...")
        campo_senha = await tab.find(id="password", timeout=15, raise_exc=False)
        if not campo_senha:
            print("   ERRO: #password nao apareceu. Ver screenshot 03.")
            return 1
        await campo_senha.type_text(senha, humanize=True)
        await asyncio.sleep(1)

        entrar = await tab.find(id="login", timeout=10, raise_exc=False)
        if not entrar:
            print("   ERRO: #login nao encontrado.")
            return 1
        await entrar.click()
        await asyncio.sleep(12)
        await etapa(tab, "04_pos_login")

        url_final = await tab.current_url
        html = (await tab.page_source) or ""
        logado = "/oauth2/in" not in url_final or "sair" in html.lower()

        # Chamadas de API, sem o ruido de assets.
        api = [c for c in capturado if "api." in c["url"] or "/api/" in c["url"]]
        xhr = [c for c in capturado if c.get("tipo") in ("XHR", "Fetch")]
        relevantes = {json.dumps(c, sort_keys=True) for c in api + xhr}
        rotas = sorted((json.loads(c) for c in relevantes), key=lambda c: c["url"])

        (OUT / "ld_network.json").write_text(
            json.dumps(rotas, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        print("=" * 70)
        print(f"URL final : {url_final}")
        print(f"Logado?   : {logado}")
        print(f"Requests  : {len(capturado)} total | {len(rotas)} de API/XHR")
        print("-" * 70)
        for c in rotas[:40]:
            sens = f"  headers={c['headers_sensiveis']}" if c["headers_sensiveis"] else ""
            body = " +body" if c["tem_body"] else ""
            print(f"  {c['metodo']:6} {c['url'][:110]}{body}{sens}")
        print("=" * 70)
        print(f"Detalhe completo: {OUT / 'ld_network.json'}")
        return 0 if logado else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
