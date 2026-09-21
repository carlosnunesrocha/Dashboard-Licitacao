"""
Mapeia o DOM da tela de login do LicitarDigital para achar os seletores certos.

Motivo: find(tag_name='button') pega o primeiro botao do DOM, que e' invisivel
(widget de chat). Precisamos do seletor do AVANCAR de verdade.

Uso:
    python scripts/licitardigital_inspect.py
"""

import asyncio
import json
import time
from pathlib import Path

from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions

URL = "https://minhaconta.licitardigital.com.br/oauth2/in/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = Path(__file__).parent / "out"

JS = """
(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const desc = (el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || null,
    id: el.id || null,
    name: el.getAttribute('name') || null,
    cls: (el.className && el.className.toString().slice(0, 80)) || null,
    placeholder: el.getAttribute('placeholder') || null,
    formcontrol: el.getAttribute('formcontrolname') || null,
    texto: (el.innerText || el.value || '').trim().slice(0, 40) || null,
    visivel: vis(el),
  });
  return JSON.stringify({
    inputs: [...document.querySelectorAll('input,select')].map(desc),
    buttons: [...document.querySelectorAll('button,[type=submit],a.btn')].map(desc),
    forms: [...document.querySelectorAll('form')].map((f) => ({
      id: f.id || null, action: f.action || null, cls: (f.className||'').slice(0,60),
    })),
  });
})()
"""


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


def mostrar(titulo, itens):
    print(f"\n--- {titulo} ({len(itens)}) ---")
    for i, e in enumerate(itens):
        marca = "OK " if e.get("visivel") else "   "  # so os visiveis servem
        campos = {k: v for k, v in e.items() if v not in (None, "", False)}
        campos.pop("visivel", None)
        print(f" {marca}[{i}] {campos}")


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()
        async with tab.expect_and_bypass_cloudflare_captcha():
            await tab.go_to(URL)
        await asyncio.sleep(8)

        bruto = await tab.execute_script(JS)
        # pydoll devolve o envelope do CDP; extrai o valor.
        if isinstance(bruto, dict):
            bruto = bruto.get("result", {}).get("result", {}).get("value", bruto)
        dados = json.loads(bruto) if isinstance(bruto, str) else bruto

        mostrar("INPUTS / SELECTS", dados["inputs"])
        mostrar("BUTTONS", dados["buttons"])
        mostrar("FORMS", dados["forms"])

        (OUT / "ld_dom_login.json").write_text(
            json.dumps(dados, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"\nSalvo em {OUT / 'ld_dom_login.json'}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
