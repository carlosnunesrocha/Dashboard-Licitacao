import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLicitacao } from '../api/licitacoes';
import { listUsers } from '../api/users';
import { KANBAN_STATUS, KANBAN_STATUS_LABEL, PORTAL_LABEL } from '../types';
import type { KanbanStatus, Portal } from '../types';
import { parseValor } from '../utils/valor';

/**
 * Cadastro manual de licitação.
 *
 * Existe porque BNC Compras e BLL Compras não têm integração possível: o
 * portal exige um reCAPTCHA v3 por requisição e não oferece exportação de
 * arquivo (medido em 2026-09-22, ver PROGRESS.md). Para esses portais a
 * operadora lança o processo à mão e o acompanha no board junto com os que
 * vêm por sync.
 *
 * Só admin chega aqui — é a mesma regra do `POST /licitacoes` no backend.
 */

/** Portais sem sync: são os que fazem sentido no cadastro manual. */
const PORTAIS_MANUAIS: Portal[] = ['bnc-compras', 'bll-compras'];
/** Os demais entram por integração; ficam disponíveis, mas não como padrão. */
const PORTAIS_INTEGRADOS: Portal[] = ['caixa-escolar', 'licitar-digital', 'pncp'];

/**
 * Modalidades do BNC/BLL, na grafia do próprio portal — assim o texto do card
 * bate com o que a operadora vê na outra tela.
 */
const MODALIDADES = [
  'PREGÃO ELETRÔNICO',
  'DISPENSA ELETRÔNICA',
  'CONCORRÊNCIA ELETRÔNICA',
  'LEILÃO ELETRÔNICO',
  'REGIME DIF. DE COMPRAS',
  'SELEÇÃO SESI/SENAI',
  'LICITAÇÃO 13.303',
  'CREDENCIAMENTO',
  'SELEÇÃO PÚBLICA',
];

interface Props {
  onClose: () => void;
  /** Recebe o id da licitação criada, para abrir o card logo em seguida. */
  onCreated?: (id: string) => void;
}

export function NovaLicitacaoModal({ onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const [portalOrigem, setPortalOrigem] = useState<Portal>('bnc-compras');
  const [externalId, setExternalId] = useState('');
  const [orgao, setOrgao] = useState('');
  const [objeto, setObjeto] = useState('');
  const [modalidade, setModalidade] = useState('');
  const [valorEstimado, setValorEstimado] = useState('');
  const [dataAbertura, setDataAbertura] = useState('');
  const [dataLimite, setDataLimite] = useState('');
  const [status, setStatus] = useState<KanbanStatus>('EM_ANALISE');
  const [responsavelId, setResponsavelId] = useState('');
  const [urlOriginal, setUrlOriginal] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createLicitacao({
        portalOrigem,
        externalId: externalId.trim(),
        orgao: orgao.trim(),
        objeto: objeto.trim(),
        modalidade: modalidade || undefined,
        // O input aceita "12.345,67" (teclado brasileiro) e "12345.67".
        valorEstimado: parseValor(valorEstimado),
        // <input type="date"> dá "2026-09-22"; o DTO exige ISO completo.
        dataAbertura: dataAbertura ? `${dataAbertura}T00:00:00.000Z` : undefined,
        dataLimite: dataLimite ? `${dataLimite}T00:00:00.000Z` : undefined,
        status,
        responsavelId: responsavelId || undefined,
        urlOriginal: urlOriginal.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      }),
    onSuccess: (criada) => {
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      onCreated?.(criada.id);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // O índice único (portalOrigem, externalId) é a checagem que mais
      // dispara na prática: a operadora relança um processo já cadastrado.
      setErro(
        /unique|constraint|já existe/i.test(msg)
          ? `Já existe uma licitação com o número ${externalId} neste portal.`
          : msg,
      );
    },
  });

  const camposObrigatoriosOk =
    externalId.trim() !== '' && orgao.trim() !== '' && objeto.trim() !== '';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!camposObrigatoriosOk) {
      setErro('Preencha número do processo, órgão e objeto.');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal-card nova-licitacao-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-header">
          <h2>Nova licitação</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="form-hint">
          Para processos de portais sem integração automática. Os demais chegam sozinhos pelo
          sync.
        </p>

        <div className="form-grid">
          <label className="form-field">
            <span>
              Portal <em>*</em>
            </span>
            <select
              value={portalOrigem}
              onChange={(e) => setPortalOrigem(e.target.value as Portal)}
            >
              <optgroup label="Sem integração (manual)">
                {PORTAIS_MANUAIS.map((p) => (
                  <option key={p} value={p}>
                    {PORTAL_LABEL[p]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Integrados por sync">
                {PORTAIS_INTEGRADOS.map((p) => (
                  <option key={p} value={p}>
                    {PORTAL_LABEL[p]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="form-field">
            <span>
              Nº do processo <em>*</em>
            </span>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="ex: 184/2026"
              autoFocus
            />
          </label>
        </div>

        <label className="form-field">
          <span>
            Órgão / Instituição <em>*</em>
          </span>
          <input
            type="text"
            value={orgao}
            onChange={(e) => setOrgao(e.target.value)}
            placeholder="ex: Prefeitura Municipal de Três Marias"
          />
        </label>

        <label className="form-field">
          <span>
            Objeto <em>*</em>
          </span>
          <textarea
            value={objeto}
            onChange={(e) => setObjeto(e.target.value)}
            rows={2}
            placeholder="O que está sendo licitado"
          />
        </label>

        <div className="form-grid">
          <label className="form-field">
            <span>Modalidade</span>
            <select value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
              <option value="">—</option>
              {MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Valor estimado</span>
            <input
              type="text"
              inputMode="decimal"
              value={valorEstimado}
              onChange={(e) => setValorEstimado(e.target.value)}
              placeholder="R$ 0,00"
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Data de abertura</span>
            <input
              type="date"
              value={dataAbertura}
              onChange={(e) => setDataAbertura(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Prazo / disputa</span>
            <input
              type="date"
              value={dataLimite}
              onChange={(e) => setDataLimite(e.target.value)}
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Fase inicial</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as KanbanStatus)}>
              {/* Resultado exige escolher ganhou/perdeu — isso se faz
                  arrastando o card, então não é fase inicial válida. */}
              {KANBAN_STATUS.filter((s) => s !== 'RESULTADO').map((s) => (
                <option key={s} value={s}>
                  {KANBAN_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Responsável</span>
            <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Sem responsável</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-field">
          <span>Link no portal</span>
          <input
            type="url"
            value={urlOriginal}
            onChange={(e) => setUrlOriginal(e.target.value)}
            placeholder="https://bnccompras.com/..."
          />
        </label>

        <label className="form-field">
          <span>Observações</span>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
          />
        </label>

        {erro && <div className="form-error">{erro}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-link" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </div>
  );
}

