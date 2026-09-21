"""
Passo 0 — LicitarDigital: como o Authorization e' emitido.

E' a peca que falta para o adaptador NestJS autenticar sem navegador. Ja
sabemos que o Cloudflare do LicitarDigital e' regra de CABECALHO (Origin +
Referer + User-Agent), nao desafio JS: com eles, curl recebe 200 do app; sem
eles, 403 do WAF. Entao o backend consegue falar HTTP direto — desde que saiba
emitir e renovar o token.

Este script descobre:
  1. a sequencia exata de requisicoes do login (corpos de request e response)
  2. onde o app2 guarda o token (qual storage, qual chave)
  3. o payload do JWT: exp/iat (estrategia de renovacao) e se o companyId
     esta embutido

SEGREDO: o token nunca e' impresso nem salvo. Só o nome da chave, o tamanho,
e os claims nao sensiveis do payload.

Uso:
    python scripts/licitardigital_token.py
"""

import asyncio
import base64
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions
from pydoll.protocol.network.events import NetworkEvent

SSO = "https://minhaconta.licitardigital.com.br/oauth2/in/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out"
ENV = ROOT / "backend" / ".env"

# Endpoints do SSO que interessam para reproduzir o login em HTTP puro.
ALVOS = re.compile(r"(check-user-login|request-login|select|account|token|session)", re.I)
# Chaves de claim que nao devem aparecer no relatorio.
CLAIM_SENSIVEL = re.compile(r"(cpf|email|phone|telefone|document|senha|password)", re.I)

capturas: list[dict] = []
ids_resposta: dict[str, str] = {}  # requestId -> url


def build_options() -> ChromiumOptions:
    o = ChromiumOptions()
    o.headless = False  # Managed Challenge detecta headless
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


def mascarar_valores(obj, segredo: str, senha: str):
    """Troca CPF/senha/tokens por marcadores, preservando a ESTRUTURA — que e'
    o que precisamos para reproduzir a chamada no backend."""
    if isinstance(obj, dict):
        return {k: mascarar_valores(v, segredo, senha) for k, v in obj.items()}
    if isinstance(obj, list):
        return [mascarar_valores(v, segredo, senha) for v in obj]
    if isinstance(obj, str):
        if senha and senha in obj:
            return "<SENHA>"
        if segredo and segredo in obj:
            return "<CPF>"
        if obj.count(".") == 2 and len(obj) > 60:
            return f"<JWT {len(obj)} chars>"
        if len(obj) > 80:
            return f"<string {len(obj)} chars>"
    return obj


def _body_seguro(body: str | None, cpf: str, senha: str):
    """Body com CPF/senha/JWT trocados por marcadores, estrutura preservada."""
    if not body:
        return None
    try:
        return mascarar_valores(json.loads(body), cpf, senha)
    except Exception:
        return body.replace(senha, "<SENHA>").replace(cpf, "<CPF>")[:500]


async def on_request(event):
    try:
        p = event["params"]
        req = p["request"]
        url = req.get("url", "")
        if not ALVOS.search(url):
            return
        capturas.append(
            {
                "fase": "request",
                "metodo": req.get("method"),
                "url": url,
                "body": req.get("postData"),
            }
        )
    except Exception:
        pass


async def on_response(event):
    try:
        p = event["params"]
        url = p.get("response", {}).get("url", "")
        if ALVOS.search(url):
            ids_resposta[p["requestId"]] = url
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


async def chegar_na_senha(tab, cpf: str, tentativas: int = 3):
    """Ate a tela de senha aparecer. Retry aqui e' SEGURO: enviar o CPF nao e'
    tentativa de autenticacao — so a submissao da senha conta para bloqueio.
    O passo e' intermitente por causa do challenge do Cloudflare."""
    for n in range(1, tentativas + 1):
        if not await abrir_tela_login(tab):
            continue
        campo = await esperar_visivel(tab, "#username", timeout=20)
        if not campo:
            continue
        await campo.type_text(cpf, humanize=True)
        await asyncio.sleep(1)
        b = await esperar_visivel(tab, "#next-button", timeout=10)
        if not b:
            continue
        await b.click()
        await asyncio.sleep(8)
        pwd = await esperar_visivel(tab, "#password", timeout=25)
        if pwd:
            if n > 1:
                print(f"   tela de senha obtida na tentativa {n}")
            return pwd
        print(f"   tentativa {n}/{tentativas}: senha nao apareceu, recomecando")
        await asyncio.sleep(4)
    return None


async def login(tab, cpf, senha) -> bool:
    pwd = await chegar_na_senha(tab, cpf)
    if not pwd:
        print("   nunca cheguei a tela de senha (Cloudflare intermitente).")
        return False

    # Daqui pra frente, UMA tentativa so.
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
        " if (!opt) return 'nao'; s.value = opt.value;"
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


def decodificar_jwt(token: str) -> dict | None:
    """Le so o payload (parte do meio). Nao valida assinatura — queremos
    exp/iat e os claims de escopo, nao autenticar nada."""
    partes = token.split(".")
    if len(partes) != 3:
        return None
    corpo = partes[1] + "=" * (-len(partes[1]) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(corpo))
    except Exception:
        return None


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cpf, senha = ler_env()

    async with Chrome(options=build_options()) as browser:
        tab = await browser.start()
        await tab.enable_network_events()
        await tab.on(NetworkEvent.REQUEST_WILL_BE_SENT, on_request)
        await tab.on(NetworkEvent.RESPONSE_RECEIVED, on_response)

        print("1) Login no SSO...")
        if not await login(tab, cpf, senha):
            print("   ERRO: login falhou.")
            return 1

        print("2) Entrando como fornecedor...")
        if not await entrar_como_fornecedor(tab):
            print("   ERRO: perfil de fornecedor falhou.")
            return 1
        print(f"   agora em: {await tab.current_url}")

        print("\n3) Sequencia de requisicoes do login (estrutura, sem segredos):")
        for c in capturas:
            print(f"\n   {c['metodo']} {c['url']}")
            if c["body"]:
                try:
                    corpo = mascarar_valores(json.loads(c["body"]), cpf, senha)
                    print(f"      body: {json.dumps(corpo, ensure_ascii=False)}")
                except Exception:
                    # form-urlencoded: mascara por substituicao direta
                    cru = c["body"].replace(senha, "<SENHA>").replace(cpf, "<CPF>")
                    print(f"      body (form): {cru[:300]}")

        print("\n4) Corpos de resposta do SSO:")
        for rid, url in ids_resposta.items():
            try:
                bruto = await tab.get_network_response_body(rid)
                if isinstance(bruto, dict):
                    bruto = bruto.get("body", bruto)
                dados = json.loads(bruto) if isinstance(bruto, str) else bruto
                seguro = mascarar_valores(dados, cpf, senha)
                print(f"\n   {url}")
                print(f"      {json.dumps(seguro, ensure_ascii=False)[:600]}")
            except Exception as exc:
                print(f"\n   {url}\n      (sem corpo legivel: {type(exc).__name__})")

        print("\n5) Onde o app2 guarda o token:")
        achados = await js(
            tab,
            "(() => { const out = [];"
            " const varre = (store, nome) => { for (const k of Object.keys(store)) {"
            "   const v = store.getItem(k) || '';"
            "   if (v.split('.').length === 3 && v.length > 60) {"
            "     out.push({storage: nome, chave: k, tamanho: v.length, direto: true}); }"
            "   else { try { const o = JSON.parse(v);"
            "     for (const kk of Object.keys(o||{})) { const vv = String(o[kk]||'');"
            "       if (vv.split('.').length === 3 && vv.length > 60) {"
            "         out.push({storage: nome, chave: k + '.' + kk, tamanho: vv.length, direto: false}); } }"
            "   } catch (e) {} } } };"
            " varre(localStorage, 'localStorage'); varre(sessionStorage, 'sessionStorage');"
            " return JSON.stringify(out); })()",
        )
        for a in achados:
            print(f"   {a['storage']}['{a['chave']}']  ({a['tamanho']} chars,"
                  f" {'valor direto' if a['direto'] else 'aninhado em JSON'})")
        if not achados:
            print("   nenhum JWT em storage — o token deve vir por cookie httpOnly")

        print("\n6) Payload do JWT (claims, sem o token):")
        token = await js_val(
            tab,
            "(() => { const varre = (store) => { for (const k of Object.keys(store)) {"
            "   const v = store.getItem(k) || '';"
            "   if (v.split('.').length === 3 && v.length > 60) return v;"
            "   try { const o = JSON.parse(v); for (const kk of Object.keys(o||{})) {"
            "     const vv = String(o[kk]||''); if (vv.split('.').length === 3 && vv.length > 60) return vv; }"
            "   } catch (e) {} } return null; };"
            " return varre(localStorage) || varre(sessionStorage); })()",
        )
        relatorio_jwt = None
        if token:
            payload = decodificar_jwt(token)
            if payload:
                agora = datetime.now(timezone.utc)
                exp = payload.get("exp")
                iat = payload.get("iat")
                relatorio_jwt = {
                    "claims": sorted(payload.keys()),
                    "exp": exp,
                    "iat": iat,
                }
                print(f"   claims presentes: {sorted(payload.keys())}")
                if iat and exp:
                    vida = (exp - iat) / 60
                    resta = (datetime.fromtimestamp(exp, timezone.utc) - agora).total_seconds() / 60
                    print(f"   vida util do token : {vida:.0f} min")
                    print(f"   expira em          : {resta:.0f} min")
                    relatorio_jwt["vida_minutos"] = round(vida)
                for k, v in payload.items():
                    if CLAIM_SENSIVEL.search(k) or k in ("exp", "iat", "nbf"):
                        continue
                    print(f"   {k} = {str(v)[:60]}")
        else:
            print("   token nao encontrado em storage")

        (OUT / "ld_token.json").write_text(
            json.dumps(
                {
                    # Guarda URL completa e body MASCARADO: e' o que permite
                    # reproduzir a sequencia no backend sem outra rodada de login.
                    "requisicoes": [
                        {
                            "metodo": c["metodo"],
                            "url": c["url"],
                            "body": _body_seguro(c["body"], cpf, senha),
                        }
                        for c in capturas
                        if not re.search(r"(octadesk|select2|\.css|\.js)", c["url"])
                    ],
                    "storage": achados,
                    "jwt": relatorio_jwt,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"\nSalvo em {OUT / 'ld_token.json'}")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except PermissionError as exc:
        print(f"\n[limpeza] temp do Chrome preso, ignorando: {exc.filename}")
        raise SystemExit(0)
