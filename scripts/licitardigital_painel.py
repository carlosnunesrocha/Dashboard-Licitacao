"""
Sonda etapa 5 — LicitarDigital: painel do fornecedor em app2.

Host confirmado pelo usuario: https://app2.licitardigital.com.br/painel-fornecedor

Objetivo final da investigacao: capturar as rotas que devolvem as licitacoes
DA EMPRESA. Se so aparecer busca publica de editais, o adaptador nao se
justifica (prospeccao — fora do escopo do painel).

Estrategia: login no SSO -> escolher o perfil de acesso (AVANCAR) -> navegar
ate o painel -> gravar todo XHR/Fetch, inclusive corpo das respostas.

Uso:
    python scripts/licitardigital_painel.py
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
PAINEL = "https://app2.licitardigital.com.br/painel-fornecedor"
PROPOSTAS = "https://app2.licitardigital.com.br/pesquisa?onlyProposal"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out"
ENV = ROOT / "backend" / ".env"

SENSIVEL = re.compile(r"(authorization|token|senha|password|cookie|key)", re.I)
IGNORAR = re.compile(r"\.(js|css|woff2?|ttf|png|jpe?g|svg|gif|ico|map)(\?|$)", re.I)
RUIDO = re.compile(r"(cdn-cgi|cloudflareinsights|octadesk|google|gstatic|hotjar)", re.I)

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


async def on_request(event):
    try:
        p = event["params"]
        req = p["request"]
        url = req.get("url", "")
        if url.startswith("data:") or url.startswith("blob:"):
            return
        if IGNORAR.search(url) or RUIDO.search(url):
            return
        hdrs = req.get("headers") or {}
        corpo = req.get("postData")
        requisicoes.append(
            {
                "metodo": req.get("method"),
                "url": url,
                "tipo": p.get("type"),
                # Só os NOMES dos headers sensiveis; valores nunca.
                "headers_sensiveis": sorted(k for k in hdrs if SENSIVEL.search(k)),
                "body": (corpo[:300] if corpo else None),
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


async def dump_estado(tab, marco: str):
    """Fotografa a tela a cada transicao: qual campo esta visivel agora.
    E' o que revela a ordem real dos passos do login."""
    estado = await js_val(
        tab,
        "(() => { const q = (s) => { const el = document.querySelector(s);"
        " if (!el) return '-'; const r = el.getBoundingClientRect();"
        " const st = getComputedStyle(el);"
        " return (r.width>0 && r.height>0 && st.visibility!=='hidden'"
        " && st.display!=='none') ? 'VISIVEL' : 'oculto'; };"
        " return ['user=' + q('#username'), 'pwd=' + q('#password'),"
        " 'org=' + q('#select_organization'), 'next=' + q('#next-button'),"
        " 'login=' + q('#login')].join('  '); })()",
    )
    texto = await js_val(
        tab, "(document.body.innerText || '').trim().replace(/\\s+/g,' ').slice(0, 200)"
    )
    await tab.take_screenshot(path=str(OUT / f"ld_5_{marco}.png"))
    print(f"   [{marco}] {await tab.current_url}")
    print(f"      campos: {estado}")
    print(f"      texto : {texto[:160]}")


async def abrir_tela_login(tab, tentativas: int = 3) -> bool:
    """Retry SEGURO: recarregar a pagina ate o challenge do Cloudflare passar.
    Isso nao consome tentativa de senha — nenhuma credencial foi enviada ainda.
    O bypass e' intermitente; 'element was not found' aqui e' challenge, nao erro
    de credencial."""
    for n in range(1, tentativas + 1):
        try:
            async with tab.expect_and_bypass_cloudflare_captcha():
                await tab.go_to(SSO)
        except Exception as exc:
            print(f"   tentativa {n}: bypass reclamou ({type(exc).__name__}), seguindo")
        await asyncio.sleep(8)
        if await esperar_visivel(tab, "#username", timeout=20):
            if n > 1:
                print(f"   tela de login obtida na tentativa {n}")
            return True
        print(f"   tentativa {n}/{tentativas}: #username nao apareceu, recarregando")
        await asyncio.sleep(5)
    return False


async def login(tab, cpf, senha) -> bool:
    """UMA unica submissao de credencial. O retry acontece so antes disto,
    na obtencao da tela — senha em laco bloqueia a conta."""
    if not await abrir_tela_login(tab):
        print("   ERRO: nunca cheguei a tela de login (Cloudflare).")
        return False

    await dump_estado(tab, "A_tela_inicial")

    campo = await esperar_visivel(tab, "#username", timeout=20)
    await campo.type_text(cpf, humanize=True)
    await asyncio.sleep(1)
    b = await esperar_visivel(tab, "#next-button", timeout=10)
    if not b:
        print("   ERRO: #next-button nao visivel na tela do CPF.")
        return False
    await b.click()
    await asyncio.sleep(8)
    await dump_estado(tab, "B_pos_avancar_cpf")

    # A ordem real dos passos e' o que este dump revela: a senha pode vir
    # depois da escolha de organizacao, nao antes.
    pwd = await esperar_visivel(tab, "#password", timeout=25)
    if not pwd:
        print("   ERRO: #password nao ficou visivel apos o CPF.")
        print("   Ver dump B acima: se #select_organization estiver visivel,")
        print("   a escolha do perfil vem ANTES da senha.")
        return False
    await pwd.type_text(senha, humanize=True)
    await asyncio.sleep(1)
    e = await esperar_visivel(tab, "#login", timeout=10)
    if not e:
        print("   ERRO: #login nao visivel.")
        return False
    await e.click()
    await asyncio.sleep(12)
    await dump_estado(tab, "C_pos_senha")
    return "/oauth2/me" in (await tab.current_url)


async def entrar_como_fornecedor(tab) -> bool:
    """Apos o login o SSO pede o tipo de acesso via <select id=select_organization>:
      common   -> Cidadao
      provider -> ARTEFATOS DE PAPEL LUCRI LTDA (data-company=4709)
    So o perfil provider enxerga as licitacoes da empresa."""
    await tab.go_to(SSO)
    await asyncio.sleep(8)

    sel = await esperar_visivel(tab, "#select_organization", timeout=20)
    if not sel:
        print("   ERRO: #select_organization nao apareceu.")
        await tab.take_screenshot(path=str(OUT / "ld_5_falha_select.png"))
        return False

    opcoes = await js(
        tab,
        "(() => JSON.stringify([...document.querySelectorAll('#select_organization option')]"
        ".map(o => ({value: o.value, tipo: o.dataset.type, company: o.dataset.company,"
        " texto: o.textContent.trim()}))))()",
    )
    print(f"   perfis disponiveis: {opcoes}")

    # Seleciona 'provider' e dispara change (o form escuta o evento).
    resultado = await js_val(
        tab,
        "(() => { const s = document.querySelector('#select_organization');"
        " const opt = [...s.options].find(o => o.dataset.type === 'provider');"
        " if (!opt) return 'sem-provider'; s.value = opt.value;"
        " s.dispatchEvent(new Event('change', {bubbles: true}));"
        " return 'selecionado:' + opt.textContent.trim(); })()",
    )
    print(f"   {resultado}")
    if resultado == "sem-provider":
        return False
    await asyncio.sleep(2)

    # Atencao: nesta tela o AVANCAR NAO e' #next-button (esse e' o da tela do
    # CPF). Aqui e' <a href="javascript:void(0)">. Clicar por texto.
    clique = await js_val(
        tab,
        "(() => { const vis = (el) => { const r = el.getBoundingClientRect();"
        " const s = getComputedStyle(el); return r.width>0 && r.height>0"
        " && s.visibility!=='hidden' && s.display!=='none'; };"
        " const alvo = [...document.querySelectorAll('a,button,input[type=submit]')]"
        ".filter(vis).find(el => /avan[cç]ar/i.test((el.innerText||el.value||'').trim()));"
        " if (!alvo) return 'nao-achei'; alvo.click();"
        " return 'clicou:' + alvo.tagName + ':' + (alvo.id || alvo.className || '-'); })()",
    )
    print(f"   AVANCAR -> {clique}")
    if clique == "nao-achei":
        await tab.take_screenshot(path=str(OUT / "ld_5_falha_avancar.png"))
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

        print("1) Login no SSO...")
        if not await login(tab, cpf, senha):
            print("   ERRO: login falhou.")
            await tab.take_screenshot(path=str(OUT / "ld_5_falha_login.png"))
            return 1
        print(f"   OK: {await tab.current_url}")

        print("2) Escolhendo o perfil de FORNECEDOR...")
        if not await entrar_como_fornecedor(tab):
            print("   ERRO: nao consegui entrar como fornecedor.")
            return 1
        print(f"   apos escolher perfil: {await tab.current_url}")

        print(f"3) Painel: {PAINEL}")
        if PAINEL not in (await tab.current_url):
            async with tab.expect_and_bypass_cloudflare_captcha():
                await tab.go_to(PAINEL)
            await asyncio.sleep(15)

        # O alvo real: as 67 'Propostas iniciadas' = licitacoes DA EMPRESA.
        # /pesquisa sozinho e' busca publica (prospeccao, fora do escopo);
        # o filtro onlyProposal e' o que restringe ao que a empresa disputou.
        marca = len(requisicoes)  # corte DEPOIS do painel, ANTES do alvo
        await tab.go_to(PROPOSTAS)
        await asyncio.sleep(18)  # SPA monta e dispara os XHR da listagem
        await tab.take_screenshot(path=str(OUT / "ld_5_02_propostas.png"))
        await tab.take_screenshot(path=str(OUT / "ld_5_01_painel.png"))

        url_atual = await tab.current_url
        print(f"   url: {url_atual}")

        if "oauth2" in url_atual or "login" in url_atual.lower():
            print("   ATENCAO: redirecionou de volta ao login — sessao nao carregou.")
            print("   Sera preciso passar pelo seletor de perfil (AVANCAR) antes.")

        titulo = await js_val(
            tab, "(document.body.innerText || '').trim().replace(/\\s+/g,' ').slice(0, 600)"
        )
        print(f"\n3) Texto da tela:\n   {titulo}\n")

        # Menu do painel: onde estao 'minhas propostas', 'disputas', etc.
        links = await js(
            tab,
            "(() => { const vis = (el) => { const r = el.getBoundingClientRect();"
            " const s = getComputedStyle(el); return r.width>0 && r.height>0"
            " && s.visibility!=='hidden' && s.display!=='none'; };"
            " return JSON.stringify([...document.querySelectorAll('a,button,[routerlink]')]"
            ".filter(vis).map(el => ({texto: (el.innerText||'').trim().replace(/\\s+/g,' ')"
            ".slice(0,50), href: el.getAttribute('href')||el.getAttribute('routerlink')||null}))"
            ".filter(e => e.texto)); })()",
        )
        vistos, menu = set(), []
        for l in links:
            k = (l["texto"], l["href"])
            if k not in vistos:
                vistos.add(k)
                menu.append(l)
        print(f"4) Menu do painel ({len(menu)} itens):")
        for l in menu[:40]:
            print(f"     {l['texto'][:45]:45} -> {l['href']}")

        novas = requisicoes[marca:]
        xhr = [r for r in novas if r["tipo"] in ("XHR", "Fetch") or "api." in r["url"]]
        hosts = {}
        for r in novas:
            h = re.sub(r"^https?://([^/]+).*", r"\1", r["url"])
            hosts[h] = hosts.get(h, 0) + 1

        print(f"\n5) Hosts no painel: {hosts}")
        print(f"\n6) Chamadas de API no painel ({len(xhr)}):")
        for r in xhr[:50]:
            sens = f"  hdrs={r['headers_sensiveis']}" if r["headers_sensiveis"] else ""
            body = f"  body={r['body'][:60]}" if r["body"] else ""
            print(f"     {r['metodo']:6} {r['url'][:100]}{sens}{body}")

        (OUT / "ld_painel.json").write_text(
            json.dumps(
                {"url": url_atual, "hosts": hosts, "menu": menu, "api": xhr},
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"\nSalvo em {OUT / 'ld_painel.json'}")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except PermissionError as exc:
        # Windows: o Chrome ainda segura arquivos do perfil temporario quando
        # o pydoll tenta apagar a pasta. Ocorre DEPOIS do trabalho todo —
        # ruido de limpeza, nao falha da sonda.
        print(f"\n[limpeza] temp do Chrome preso, ignorando: {exc.filename}")
        raise SystemExit(0)
