import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O transporte é curl, não fetch: o Cloudflare do portal identifica o cliente
 * HTTP do Node e devolve desafio JS mesmo com todos os cabeçalhos corretos
 * (ver comentário no client). Estes testes cobrem o que isso implica —
 * montagem da config do curl, leitura do status e normalização do token.
 */

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile }));

const { LicitarDigitalClient } = await import('./licitar-digital.client.js');

/** Config que o client escreveu no stdin do curl. */
let configEnviada = '';

function responder(corpo: string, status: number) {
  execFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string) => void) => {
      cb(null, `${corpo}\n${status}`);
      return { stdin: { end: (c: string) => (configEnviada = c) } };
    },
  );
}

const paginaOk = JSON.stringify({ data: [], meta: { count: 0, limit: 20, offset: 0 } });

describe('LicitarDigitalClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configEnviada = '';
  });

  describe('token', () => {
    it('prefixa com Bearer — o JWT cru dá 400 TOKEN_MALFORMED', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('abc.def.ghi').buscarPagina('proposal', 0);

      expect(configEnviada).toContain('header = "Authorization: Bearer abc.def.ghi"');
    });

    it('não duplica o prefixo se já vier no .env', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('Bearer abc.def.ghi').buscarPagina('proposal', 0);

      expect(configEnviada).toContain('header = "Authorization: Bearer abc.def.ghi"');
      expect(configEnviada).not.toContain('Bearer Bearer');
    });

    it('tolera espaços em volta do valor colado', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('  abc.def.ghi \n').buscarPagina('proposal', 0);

      expect(configEnviada).toContain('header = "Authorization: Bearer abc.def.ghi"');
    });
  });

  describe('requisição', () => {
    it('passa o token por stdin, nunca por argumento de linha de comando', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('segredo').buscarPagina('proposal', 0);

      // argv deve ser apenas ['--config', '-']: o token fica fora da lista
      // de processos da máquina.
      const args = execFile.mock.calls[0][1];
      expect(args).toEqual(['--config', '-']);
      expect(JSON.stringify(args)).not.toContain('segredo');
    });

    it('envia os cabeçalhos que o WAF exige', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('t').buscarPagina('proposal', 0);

      expect(configEnviada).toContain('Origin: https://app2.licitardigital.com.br');
      expect(configEnviada).toContain('Referer: https://app2.licitardigital.com.br/');
      expect(configEnviada).toMatch(/User-Agent: Mozilla.*Chrome/);
    });

    it('monta o filtro e o offset pedidos', async () => {
      responder(paginaOk, 200);

      await new LicitarDigitalClient('t').buscarPagina('favorite', 40);

      expect(configEnviada).toContain('\\"shortFilter\\":\\"favorite\\"');
      expect(configEnviada).toContain('\\"offset\\":40');
    });
  });

  describe('respostas', () => {
    it('devolve data e meta quando dá certo', async () => {
      responder(
        JSON.stringify({ data: [{ id: 1 }], meta: { count: 1, limit: 20, offset: 0 } }),
        201,
      );

      const p = await new LicitarDigitalClient('t').buscarPagina('proposal', 0);

      expect(p.meta.count).toBe(1);
      expect(p.data).toHaveLength(1);
    });

    it('traduz 401 em mensagem acionável sobre o token', async () => {
      responder('nope', 401);

      await expect(new LicitarDigitalClient('t').buscarPagina('proposal', 0)).rejects.toThrow(
        /token rejeitado.*_LDToken/is,
      );
    });

    it('trata o 403 do Cloudflare como token rejeitado', async () => {
      responder('<html><title>Just a moment</title>', 403);

      await expect(new LicitarDigitalClient('t').buscarPagina('proposal', 0)).rejects.toThrow(
        /token rejeitado \(HTTP 403\)/i,
      );
    });

    it('rejeita corpo que não é JSON', async () => {
      responder('<html>erro</html>', 200);

      await expect(new LicitarDigitalClient('t').buscarPagina('proposal', 0)).rejects.toThrow(
        /não é JSON/i,
      );
    });

    it('rejeita JSON sem data/meta', async () => {
      responder(JSON.stringify({ foo: 1 }), 200);

      await expect(new LicitarDigitalClient('t').buscarPagina('proposal', 0)).rejects.toThrow(
        /sem data\/meta/i,
      );
    });

    it('avisa quando o curl nem roda (ausente no PATH)', async () => {
      execFile.mockImplementation(
        (_c: string, _a: string[], _o: unknown, cb: (e: Error, out: string) => void) => {
          cb(new Error('spawn curl ENOENT'), '');
          return { stdin: { end: () => {} } };
        },
      );

      await expect(new LicitarDigitalClient('t').buscarPagina('proposal', 0)).rejects.toThrow(
        /falha ao executar curl/i,
      );
    });
  });
});
