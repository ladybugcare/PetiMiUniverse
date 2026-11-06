import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import {
  hubReceptionApi,
  type ReceptionBoardItem,
  type ReceptionResolveAction,
} from '../../api/hubReceptionApi';
import '../clientes/clientes.css';
import './hub-reception.css';

const REFRESH_MS = 30_000;

function ymdSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function waitLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

function primaryAction(item: ReceptionBoardItem): { action: ReceptionResolveAction; label: string } | null {
  if (item.status !== 'open') return null;
  if (item.kind === 'chegada') return { action: 'chegou', label: 'Chegou' };
  if (item.kind === 'retirada_balcao') return { action: 'entreguei', label: 'Entreguei' };
  if (item.kind === 'embarque') return { action: 'embarquei', label: 'Embarcou' };
  if (item.kind === 'encaminhar') return { action: 'recebi', label: 'Recebi' };
  if (item.kind === 'autorizar_extra' && item.context?.hub_service_type_id) {
    return { action: 'autorizar', label: 'Autorizar' };
  }
  return null;
}

const HubReceptionPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('reception.ops.read');
  const canManage = hasPermission('reception.ops.manage');
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { showError, showSuccess } = useAlert();
  const templates = useMessageTemplates();
  const [day, setDay] = useState(() => ymdSaoPaulo(new Date()));
  const [items, setItems] = useState<ReceptionBoardItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadKey = clinicId && unitId ? `${clinicId}|${unitId}|${day}` : null;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(loadKey);
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!clinicId || !unitId || !canRead) {
      setItems([]);
      finish();
      return;
    }
    const seq = ++loadSeqRef.current;
    begin();
    try {
      const res = await hubReceptionApi.board(clinicId, unitId, day);
      if (seq !== loadSeqRef.current) return;
      setItems(res.items ?? []);
      succeed();
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar a recepção');
    } finally {
      if (seq === loadSeqRef.current) finish();
    }
  }, [clinicId, unitId, day, canRead, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const groups = useMemo(() => {
    const open = items.filter((i) => i.status === 'open');
    const chegadas = open
      .filter((i) => i.kind === 'chegada')
      .sort((a, b) => String(a.context?.starts_at || a.opened_at).localeCompare(String(b.context?.starts_at || b.opened_at)));
    const atencao = open.filter((i) => i.kind === 'autorizar_extra' || i.kind === 'encaminhar');
    const saidas = open
      .filter((i) => i.kind === 'retirada_balcao' || i.kind === 'embarque')
      .sort((a, b) => String(a.opened_at).localeCompare(String(b.opened_at)));
    const feitos = items
      .filter((i) => i.status === 'done' || i.status === 'cancelled')
      .sort((a, b) => String(b.resolved_at || b.opened_at).localeCompare(String(a.resolved_at || a.opened_at)));
    return { chegadas, atencao, saidas, feitos };
  }, [items]);

  const run = async (item: ReceptionBoardItem, action: ReceptionResolveAction) => {
    if (!clinicId || !canManage) return;
    setBusyId(item.id);
    try {
      await hubReceptionApi.resolve(item.id, clinicId, action);
      showSuccess('Tarefa concluída.');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Não foi possível concluir a tarefa');
    } finally {
      setBusyId(null);
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted">Você não tem acesso à operação da recepção.</p>;
  }
  if (!unitId) {
    return <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>;
  }

  const columns: { id: string; title: string; empty: string; rows: ReceptionBoardItem[] }[] = [
    { id: 'chegadas', title: 'Chegadas', empty: 'Nenhuma chegada agora.', rows: groups.chegadas },
    { id: 'atencao', title: 'Atenção', empty: 'Nada pedindo a recepção.', rows: groups.atencao },
    { id: 'saidas', title: 'Saídas', empty: 'Nenhum pet aguardando saída.', rows: groups.saidas },
    { id: 'feitos', title: 'Feitos', empty: 'Nada concluído neste dia.', rows: groups.feitos },
  ];

  return (
    <div className="hub-reception">
      <div className="hub-reception__head">
        <div className="hub-reception__date">
          <button type="button" className="hub-clientes__icon-btn" aria-label="Dia anterior" onClick={() => setDay((d) => shiftYmd(d, -1))}>
            <ChevronLeft size={18} />
          </button>
          <span className="hub-reception__date-label">{formatDay(day)}</span>
          <button type="button" className="hub-clientes__icon-btn" aria-label="Próximo dia" onClick={() => setDay((d) => shiftYmd(d, 1))}>
            <ChevronRight size={18} />
          </button>
          {day !== ymdSaoPaulo(new Date()) ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={() => setDay(ymdSaoPaulo(new Date()))}>
              Hoje
            </button>
          ) : null}
        </div>
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando recepção…" />

      {loading ? (
        <HubLoading variant="block" label="Carregando recepção…" />
      ) : (
        <div className="hub-reception__groups">
          {columns.map((col) => (
            <section key={col.id} className="hub-reception__group" aria-label={col.title}>
              <h2 className="hub-reception__group-title">
                {col.title}
                <span className="hub-reception__count">{col.rows.length}</span>
              </h2>
              {col.rows.length === 0 ? <p className="hub-clientes__muted hub-reception__empty">{col.empty}</p> : null}
              {col.rows.map((item) => {
                const action = primaryAction(item);
                const late =
                  item.kind === 'chegada' &&
                  item.status === 'open' &&
                  Boolean(item.context?.starts_at) &&
                  new Date(item.context.starts_at as string).getTime() < Date.now();
                const phone = item.guardian?.phone;
                const wa =
                  phone && (item.kind === 'retirada_balcao' || item.kind === 'embarque')
                    ? buildWhatsappLink(
                        phone,
                        renderTemplate(
                          'pet_ready',
                          { tutor: item.guardian?.full_name || '', pet: item.pet.name },
                          templates,
                        ),
                      )
                    : null;
                return (
                  <article key={item.id} className={`hub-reception__card${late ? ' hub-reception__card--late' : ''}`}>
                    <p className="hub-reception__pet">{item.pet.name}</p>
                    <p className="hub-reception__meta">
                      {item.guardian?.full_name || 'Sem tutor'}
                      {' · '}
                      {item.context?.label || 'Operação'}
                    </p>
                    {item.status === 'open' ? (
                      <p className="hub-reception__wait">{waitLabel(item.opened_at)}</p>
                    ) : (
                      <p className="hub-reception__wait">{item.status === 'cancelled' ? 'Cancelada' : 'Concluída'}</p>
                    )}
                    {late ? (
                      <div className="hub-reception__flags">
                        <span className="hub-reception__flag">Atrasado</span>
                      </div>
                    ) : null}
                    {item.status === 'open' && canManage ? (
                      <div className="hub-reception__actions">
                        {action ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void run(item, action.action)}
                          >
                            {action.label}
                          </button>
                        ) : null}
                        {item.kind === 'autorizar_extra' ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void run(item, 'dispensar')}
                          >
                            Dispensar
                          </button>
                        ) : null}
                        {wa ? (
                          <a className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" href={wa} target="_blank" rel="noreferrer">
                            <MessageCircle size={14} aria-hidden /> Avisar
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default HubReceptionPage;
