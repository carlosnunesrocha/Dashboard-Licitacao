"""
Sonda etapa 1 — LicitarDigital: passar do Cloudflare e chegar na tela de login.

NAO faz login. So responde: o Managed Challenge cai com pydoll + headless=False?

Uso:
    python scripts/licitardigital_probe.py

Saida: scripts/out/licitardigital_login.png + relatorio no stdout.
"""

import asyncio
import time
from pathlib import Path

from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions

URL = "https://minhaconta.licitardigital.com.br/oauth2/in/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = Path(__file__).parent / "out"

# Marcadores de que o Cloudflare ainda esta na frente.
CF_MARKERS = [
    "just a moment",
    "checking your browser",
    "verificacao de seguranca",
    "verificação de segurança",
    "attention required",
    "cf-browser-verification",
    "cf-chl-bypass",
    "_cf_chl_opt",
]


def build_options() -> ChromiumOptions:
    options = ChromiumOptions()
    # Managed Challenge detecta headless — tem que ser janela real.
    options.headless = False
    options.binary_location = CHROME
    options.start_timeout = 30
    options.add_argument("--window-size=1920,1080")

    # Perfil "usado ha semanas", nao recem-criado.
    fake_engagement = int(time.time()) - (7 * 24 * 60 * 60)
    options.browser_preferences = {
        "profile": {
            "last_engagement_time": fake_engagement,
            "exit_type": "Normal",
            "exited_cleanly": True,
            "default_content_setting_values": {"notifications": 2, "geolocation": 2},
            "password_manager_enabled": False,
        },
        "intl": {"accept_languages": "pt-BR,pt,en-US,en"},
    }
    options.webrtc_leak_protection = True
    return options


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    started = time.time()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()

        async with tab.expect_and_bypass_cloudflare_captcha():
            await tab.go_to(URL)

        # Folga para o challenge liquidar e o app Angular/React montar.
        await asyncio.sleep(8)

        title = await tab.title
        html = (await tab.page_source) or ""
        low = html.lower()
        elapsed = round(time.time() - started, 1)

        shot = OUT / "licitardigital_login.png"
        await tab.take_screenshot(path=str(shot))

        hits = [m for m in CF_MARKERS if m in low]

        # A tela de login existe? Procura campos sem estourar excecao.
        campos = {}
        for rotulo, kwargs in {
            "input_email": {"tag_name": "input", "type": "email"},
            "input_text": {"tag_name": "input", "type": "text"},
            "input_password": {"tag_name": "input", "type": "password"},
            "button": {"tag_name": "button"},
        }.items():
            el = await tab.find(**kwargs, timeout=3, raise_exc=False)
            campos[rotulo] = el is not None

        print("=" * 60)
        print(f"URL final : {await tab.current_url}")
        print(f"Titulo    : {title!r}")
        print(f"Tempo     : {elapsed}s")
        print(f"HTML      : {len(html)} chars")
        print(f"Screenshot: {shot}")
        print("-" * 60)
        print(f"Marcadores Cloudflare presentes: {hits or 'NENHUM'}")
        print(f"Campos encontrados: {campos}")
        print("-" * 60)

        passou = not hits and campos.get("input_password")
        if passou:
            print("RESULTADO: PASSOU — tela de login alcancada.")
        elif not hits:
            print("RESULTADO: PARCIAL — sem Cloudflare, mas sem campo de senha.")
            print("           Ver o screenshot; pode ser SPA ainda montando.")
        else:
            print("RESULTADO: BLOQUEADO — Cloudflare ainda na frente.")
        print("=" * 60)
        return 0 if passou else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
