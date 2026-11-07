import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubDayNav } from '../../components/HubDayNav';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { formatYmd } from '../../utils/hubCalendar';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import {
  hubReceptionApi,
  type ReceptionBoardItem,
  type ReceptionResolveAction,
  type ReceptionResolvePayload,
} from '../../api/hubReceptionApi';
import ReceptionHandoffPanel from './ReceptionHandoffPanel';
import { caixaSearchHref } from '../finance/hubRelatoriosLinks';
import '../clientes/clientes.css';
import '../clinica/clinica-page.css';
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

function waitLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

function kindLabel(item: ReceptionBoardItem): string {
  if (item.status === 'cancelled') return 'Cancelada';
  if (item.status === 'done') return 'Concluída';
  if (item.kind === 'chegada') return 'Chegada';
  if (item.kind === 'autorizar_extra') return 'Extra';
  if (item.kind === 'encaminhar') return 'Encaminhar';
  if (item.kind === 'embarque') return 'Embarque';
  if (item.kind === 'lt_falha') return 'Falha L&T';
  return 'Retirada';
}

function pillClass(item: ReceptionBoardItem): string {
  if (item.status === 'done') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  if (item.status === 'cancelled') return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
  if (item.kind === 'lt_falha') return 'hub-clientes__pill hub-reception__pill--failure';
  if (item.kind === 'autorizar_extra' || item.kind === 'encaminhar') {
    return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
  }
  if (item.kind === 'retirada_balcao' || item.kind === 'embarque') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

function primaryAction(item: ReceptionBoardItem): { action: ReceptionResolveAction; label: string } | null {
  if (item.status !== 'open') return null;
  if (item.kind === 'chegada') return { action: 'chegou', label: 'Chegou' };
  if (item.kind === 'retirada_balcao') return { action: 'entreguei', label: 'Entreguei' };
  if (item.kind === 'embarque') return { action: 'embarquei', label: 'Embarcou' };
  if (item.kind === 'autorizar_extra' && item.context?.hub_service_type_id) {
    return { action: 'autorizar', label: 'Autorizar' };
  }
  return null;
}

function scheduleDestinationPath(item: ReceptionBoardItem, day: string): {
  pathname: string;
  search: string;
  state: {
    walkInInitial: {
      date: string;
      pet_id: string | null;
      pet_name: string | null;
      guardian_id: string | null;
      guardian_name: string | null;
    };
  };
} {
  const params = new URLSearchParams({
    openWalkIn: '1',
    date: day,
  });
  if (item.pet.id) params.set('petId', item.pet.id);
  if (item.pet.name?.trim()) params.set('petName', item.pet.name.trim());
  if (item.guardian?.id) params.set('guardianId', item.guardian.id);
  if (item.guardian?.full_name?.trim()) params.set('guardianName', item.guardian.full_name.trim());
  return {
    pathname: '/hub/appointments',
    search: `?${params.toString()}`,
    state: {
      walkInInitial: {
        date: day,
        pet_id: item.pet.id,
        pet_name: item.pet.name,
        guardian_id: item.guardian?.id ?? null,
        guardian_name: item.guardian?.full_name ?? null,
      },
    },
  };
}

const HubReceptionPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('reception.ops.read');
  const canManage = hasPermission('reception.ops.manage');
  const canSeeChargeHint = hasPermission('hub.financial.read') || hasPermission('hub.cash.receive');
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { showError, showSuccess, showAlert } = useAlert();
  const templates = useMessageTemplates();
  const [day, setDay] = useState(() => ymdSaoPaulo(new Date()));
  const [items, setItems] = useState<ReceptionBoardItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReceptionBoardItem | null>(null);
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
    const atencao = open
      .filter((i) => i.kind === 'lt_falha' || i.kind === 'autorizar_extra' || i.kind === 'encaminhar')
      .sort((a, b) => Number(b.kind === 'lt_falha') - Number(a.kind === 'lt_falha'));
    const saidas = open
      .filter((i) => i.kind === 'retirada_balcao' || i.kind === 'embarque')
      .sort((a, b) => String(a.opened_at).localeCompare(String(b.opened_at)));
    const feitos = items
      .filter((i) => i.status === 'done' || i.status === 'cancelled')
      .sort((a, b) => String(b.resolved_at || b.opened_at).localeCompare(String(a.resolved_at || a.opened_at)));
    return { chegadas, atencao, saidas, feitos };
  }, [items]);

  const run = async (
    item: ReceptionBoardItem,
    action: ReceptionResolveAction,
    payload?: ReceptionResolvePayload,
  ) => {
    if (!clinicId || !canManage) return;
    setBusyId(item.id);
    try {
      await hubReceptionApi.resolve(item.id, clinicId, action, payload);
      showSuccess(
        action === 'novo_lt'
          ? 'Novo Leva e Traz criado. Atribua a uma rota no quadro do Leva e Traz.'
          : action === 'tutor_busca'
            ? 'Combinado: o tutor busca no balcão.'
            : 'Tarefa concluída.',
      );
      if (canSeeChargeHint && (action === 'entreguei' || action === 'embarquei')) {
        try {
          const detail = await hubReceptionApi.detail(item.id, clinicId);
          if (detail.charge_pending) {
            const petName = (() => {
              const candidates = [detail.pet?.name, item.pet.name];
              for (const name of candidates) {
                const trimmed = typeof name === 'string' ? name.trim() : '';
                if (trimmed && trimmed.toLowerCase() !== 'pet' && trimmed.toLowerCase() !== 'sem nome') {
                  return trimmed;
                }
              }
              return detail.guardian?.full_name || item.guardian?.full_name || '';
            })();
            showAlert({
              type: 'warning',
              title: 'Caixa',
              message: 'Há cobrança em aberto no Caixa para este pet.',
              confirmText: 'OK',
              secondaryText: 'Ir ao Caixa',
              onSecondary: () => {
                navigate(
                  caixaSearchHref({
                    q: petName || null,
                    status: 'comanda_aberta',
                  }),
                );
              },
            });
          }
        } catch {
          /* aviso de caixa é opcional */
        }
      }
      setSelected(null);
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Não foi possível concluir a tarefa');
    } finally {
      setBusyId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="hub-clientes hub-clinic-page hub-reception">
        <p className="hub-clientes__muted">Você não tem acesso à operação da recepção.</p>
      </div>
    );
  }
  if (!unitId) {
    return (
      <div className="hub-clientes hub-clinic-page hub-reception">
        <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>
      </div>
    );
  }

  const columns: { id: string; title: string; empty: string; rows: ReceptionBoardItem[] }[] = [
    { id: 'chegadas', title: 'Chegadas', empty: 'Nenhuma chegada agora.', rows: groups.chegadas },
    { id: 'atencao', title: 'Atenção', empty: 'Nada pedindo a recepção.', rows: groups.atencao },
    { id: 'saidas', title: 'Saídas', empty: 'Nenhum pet aguardando saída.', rows: groups.saidas },
    { id: 'feitos', title: 'Feitos', empty: 'Nada concluído neste dia.', rows: groups.feitos },
  ];

  return (
    <div className="hub-clientes hub-clinic-page hub-reception">
      <div className="hub-reception__toolbar">
        <div className="hub-reception__date">
          <HubDayNav
            dateFieldId="hub-reception-date"
            value={day}
            onChange={(next) => setDay(formatYmd(next))}
          />
        </div>
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando recepção…" />

      {loading ? (
        <HubLoading variant="block" label="Carregando recepção…" />
      ) : (
        <div className="hub-clinic-queue">
          {columns.map((col) => (
            <section key={col.id} className="hub-clinic-queue__col" aria-label={col.title}>
              <h3 className="hub-clinic-queue__col-title">
                {col.title} <span className="hub-clinic-queue__count">{col.rows.length}</span>
              </h3>
              <div className="hub-clinic-queue__cards">
                {col.rows.length === 0 ? <p className="hub-clientes__muted hub-clinic-queue__empty">{col.empty}</p> : null}
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
                  const wait = item.status === 'open' ? waitLabel(item.opened_at) : '';
                  return (
                    <article key={item.id} className="hub-clinic-queue__card">
                      <div className="hub-clinic-queue__card-top">
                        <p className="hub-clinic-queue__pet">{item.pet.name}</p>
                        <span className={pillClass(item)}>{kindLabel(item)}</span>
                      </div>
                      {late ? <p className="hub-clientes__pill hub-clinic-queue__pill--waiting" style={{ marginTop: 6, marginBottom: 0 }}>Atrasado</p> : null}
                      <p className="hub-clientes__muted hub-clinic-queue__meta">{item.context?.label || 'Operação'}</p>
                      {item.kind === 'lt_falha' && item.context?.failure_reason ? (
                        <p className="hub-reception__failure-reason">{item.context.failure_reason}</p>
                      ) : null}
                      <p className="hub-clientes__muted hub-clinic-queue__meta">
                        {wait ? `${wait} · ` : ''}
                        {item.guardian?.full_name || 'Sem tutor'}
                      </p>
                      <div className="hub-clinic-queue__actions">
                        {item.status === 'open' && canManage && item.kind === 'encaminhar' ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            onClick={() => {
                              const dest = scheduleDestinationPath(item, day);
                              navigate(`${dest.pathname}${dest.search}`, { state: dest.state });
                            }}
                          >
                            Agendar destino
                          </button>
                        ) : null}
                        {item.status === 'open' && canManage && item.kind === 'lt_falha' ? (
                          <>
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                              onClick={() => setSelected(item)}
                            >
                              Resolver
                            </button>
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                              disabled={busyId === item.id}
                              onClick={() => void run(item, 'tutor_busca')}
                            >
                              {busyId === item.id ? 'Salvando…' : 'Tutor busca'}
                            </button>
                          </>
                        ) : null}
                        {item.status === 'open' && canManage && action ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void run(item, action.action)}
                          >
                            {busyId === item.id ? 'Salvando…' : action.label}
                          </button>
                        ) : null}
                        {item.status === 'open' && canManage && item.kind === 'autorizar_extra' ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                            disabled={busyId === item.id}
                            onClick={() => void run(item, 'dispensar')}
                          >
                            Dispensar
                          </button>
                        ) : null}
                        {item.status === 'open' && canManage && wa ? (
                          <a className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" href={wa} target="_blank" rel="noreferrer">
                            <MessageCircle size={14} aria-hidden /> Avisar
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          onClick={() => setSelected(item)}
                        >
                          Detalhes
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {clinicId ? (
        <ReceptionHandoffPanel
          open={Boolean(selected)}
          item={selected}
          clinicId={clinicId}
          canManage={canManage}
          busy={Boolean(selected && busyId === selected.id)}
          onClose={() => setSelected(null)}
          onAction={(item, action, payload) => void run(item, action, payload)}
          onScheduleDestination={(item) => {
            const dest = scheduleDestinationPath(item, day);
            navigate(`${dest.pathname}${dest.search}`, { state: dest.state });
          }}
        />
      ) : null}
    </div>
  );
};

export default HubReceptionPage;
