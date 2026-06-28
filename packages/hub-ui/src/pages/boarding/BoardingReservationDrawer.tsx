import React, { useCallback, useEffect, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import {
  hubBoardingApi,
  type BoardingDayBoardItem,
  type BoardingDrawerResponse,
  type BoardingDailyLog,
} from '../../api/hubBoardingApi';
import { getStoredClinicId } from '@petimi/web-core';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import { BOARDING_STAGE_LABELS, getBoardingItemStage } from './boardingStages';
import { useAlert } from '../../components/AlertProvider';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type BoardingReservationDrawerProps = {
  item: BoardingDayBoardItem | null;
  open: boolean;
  /** Reservado para ações futuras (ex.: edição de notas da reserva). */
  canWrite: boolean;
  canDailyReport: boolean;
  canManageFinance?: boolean;
  canWriteInventory?: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

const BoardingReservationDrawer: React.FC<BoardingReservationDrawerProps> = ({
  item,
  open,
  canWrite: _canWrite,
  canDailyReport,
  canManageFinance,
  canWriteInventory,
  onClose,
  onUpdated,
}) => {
  const clinicId = getStoredClinicId();
  const templateOverrides = useMessageTemplates();
  const { showError, showSuccess } = useAlert();
  const [stockItems, setStockItems] = useState<HubInventoryItem[]>([]);
  const [stockItemId, setStockItemId] = useState('');
  const [stockQty, setStockQty] = useState('1');
  const [stockNotes, setStockNotes] = useState('');
  const [stockBusy, setStockBusy] = useState(false);
  const [drawer, setDrawer] = useState<BoardingDrawerResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [todayLog, setTodayLog] = useState<BoardingDailyLog | null>(null);
  const [logDraft, setLogDraft] = useState({
    fed: false,
    medication: false,
    walks: false,
    mood: '',
    notes: '',
  });
  const [logBusy, setLogBusy] = useState(false);

  const loadDrawer = useCallback(async () => {
    if (!clinicId || !item?.reservation_id) return;
    setDrawerLoading(true);
    try {
      const d = await hubBoardingApi.reservationDrawer(item.reservation_id, clinicId);
      setDrawer(d);
      const today = todayYmd();
      const existing = d.daily_logs.find((l) => l.log_date === today) ?? null;
      setTodayLog(existing);
      if (existing) {
        const fed = (existing.fed as Record<string, boolean> | null);
        const medication = (existing.medication as Record<string, boolean> | null);
        const walks = (existing.walks as Record<string, boolean> | null);
        setLogDraft({
          fed: fed?.done ?? false,
          medication: medication?.done ?? false,
          walks: walks?.done ?? false,
          mood: existing.mood ?? '',
          notes: existing.notes ?? '',
        });
      } else {
        setLogDraft({ fed: false, medication: false, walks: false, mood: '', notes: '' });
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar detalhes da estadia');
    } finally {
      setDrawerLoading(false);
    }
  }, [clinicId, item?.reservation_id, showError]);

  useEffect(() => {
    if (!open) {
      setDrawer(null);
      setTodayLog(null);
      return;
    }
    if (item?.reservation_id) void loadDrawer();
  }, [open, item?.reservation_id, loadDrawer]);

  useEffect(() => {
    if (!open || !clinicId || !canWriteInventory) return;
    void hubInventoryApi.items.list(clinicId).then((r) => setStockItems(r.items ?? [])).catch(() => {});
  }, [open, clinicId, canWriteInventory]);

  const handleStockMovement = async () => {
    if (!clinicId || !item?.reservation_id || !stockItemId) return;
    const qty = parseFloat(stockQty);
    if (!qty || qty <= 0) return;
    setStockBusy(true);
    try {
      await hubInventoryApi.movements.create({
        clinic_id: clinicId,
        item_id: stockItemId,
        movement_type: 'adjustment_out',
        qty,
        notes: stockNotes.trim() || null,
        reference_type: 'hub_boarding_reservation',
        reference_id: item.reservation_id,
      });
      showSuccess('Consumo registrado no estoque');
      setStockItemId('');
      setStockQty('1');
      setStockNotes('');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar consumo');
    } finally {
      setStockBusy(false);
    }
  };

  const handleSaveLog = async () => {
    if (!clinicId || !item?.reservation_id) return;
    setLogBusy(true);
    try {
      await hubBoardingApi.postDailyLog(item.reservation_id, {
        clinic_id: clinicId,
        log_date: todayYmd(),
        fed: { done: logDraft.fed },
        medication: { done: logDraft.medication },
        walks: { done: logDraft.walks },
        mood: logDraft.mood.trim() || null,
        notes: logDraft.notes.trim() || null,
      });
      showSuccess('Relatório diário salvo');
      await loadDrawer();
      onUpdated?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar relatório diário');
    } finally {
      setLogBusy(false);
    }
  };

  if (!item) return null;

  const petName = item.pet?.name || 'Sem pet';
  const stage = getBoardingItemStage(item);
  const guardianPhone = item.guardian?.phone ?? null;
  const notifyTutorHref =
    stage === 'checked_in' || item.is_late
      ? buildWhatsappLink(
          guardianPhone,
          renderTemplate('pet_ready', { tutor: item.guardian?.full_name, pet: petName }, templateOverrides),
        )
      : null;
  const modeLabel = item.mode === 'hotel' ? 'Hotel' : item.mode === 'daycare' ? 'Creche' : String(item.mode);
  const porte = item.pet?.size_tier
    ? (PORTE_LABELS[item.pet.size_tier as PetBodyPorteValue] ?? item.pet.size_tier)
    : null;
  const nights = drawer?.nights_count ?? item.nights_count;
  const reservation = drawer?.reservation;
  const pet = drawer?.pet ?? item.pet;
  const guardian = drawer?.guardian ?? item.guardian;
  const clinicalTags = drawer?.clinical_tags ?? item.clinical_tags ?? [];
  const dailyLogs = drawer?.daily_logs ?? [];

  const subtitle = reservation
    ? `${formatDate(reservation.expected_check_in as string)} → ${formatDate(reservation.expected_check_out as string)}`
    : `${formatDate(item.starts_at)} → ${formatDate(item.ends_at)}`;

  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {/* Checkout de fim de hospedagem removido — use o Caixa (Atendimentos do dia). */}
      <button type="button" className="hub-btn hub-btn--ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  );

  return (
    <>
    <HubSidePanel open={open} onClose={onClose} title={petName} subtitle={subtitle} footer={footer}>
      {/* Cabeçalho informativo */}
      <div className="hub-drawer-section">
        <div className="hub-drawer-row">
          <span className="hub-clientes__muted">Status</span>
          <span className="hub-clientes__pill hub-clinic-queue__pill--waiting">
            {BOARDING_STAGE_LABELS[stage] ?? stage}
          </span>
          <span className="hub-clientes__pill hub-clientes__pill--neutral">{modeLabel}</span>
        </div>
        {porte && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">Porte</span>
            <span>{porte}</span>
          </div>
        )}
        {pet?.breed && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">Raça</span>
            <span>{pet.breed}</span>
          </div>
        )}
        {guardian && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">Tutor</span>
            <span>{guardian.full_name}</span>
            {guardian.phone && (
              <a
                href={`tel:${guardian.phone}`}
                className="hub-clientes__muted"
                style={{ marginLeft: 4 }}
              >
                {guardian.phone}
              </a>
            )}
          </div>
        )}
        {notifyTutorHref && (
          <div className="hub-drawer-row">
            <a
              className="hub-clientes__btn hub-clientes__btn--primary"
              href={notifyTutorHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void logMessageAttempt({
                  clinic_id: clinicId ?? '',
                  guardian_id: item.guardian?.id ?? null,
                  pet_id: item.pet?.id ?? null,
                  channel: 'whatsapp_link',
                  template_key: 'pet_ready',
                });
              }}
            >
              Avisar retirada
            </a>
          </div>
        )}
        {reservation?.checked_in_at && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">Check-in real</span>
            <span>{formatDateTime(reservation.checked_in_at as string)}</span>
          </div>
        )}
        {reservation?.checked_out_at && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">Check-out real</span>
            <span>{formatDateTime(reservation.checked_out_at as string)}</span>
          </div>
        )}
        {nights != null && nights >= 0 && (
          <div className="hub-drawer-row">
            <span className="hub-clientes__muted">
              {item.mode === 'hotel' ? 'Diárias acumuladas' : 'Turno'}
            </span>
            <strong>
              {nights} {item.mode === 'hotel' ? (nights === 1 ? 'diária' : 'diárias') : 'bloco(s)'}
            </strong>
          </div>
        )}
      </div>

      {/* Flags clínicas */}
      {clinicalTags.length > 0 && (
        <div className="hub-drawer-section">
          <h4 className="hub-drawer-section__title">Alertas do pet</h4>
          <div className="hub-clinic-queue__card-tags">
            {clinicalTags.map((tag) => (
              <span key={tag.key} className="hub-clientes__pill hub-clientes__pill--alert">
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Observações do tutor */}
      {pet?.notes && (
        <div className="hub-drawer-section">
          <h4 className="hub-drawer-section__title">Observações do tutor</h4>
          <p className="hub-clientes__muted" style={{ whiteSpace: 'pre-wrap' }}>
            {pet.notes}
          </p>
        </div>
      )}

      {/* Relatório diário de hoje */}
      {item.reservation_id && (
        <div className="hub-drawer-section">
          <h4 className="hub-drawer-section__title">
            Relatório de hoje ({formatDate(todayYmd() + 'T00:00:00')})
            {todayLog && (
              <span className="hub-clientes__pill hub-clinic-queue__pill--done" style={{ marginLeft: 8, fontSize: 11 }}>
                Registrado
              </span>
            )}
          </h4>
          {drawerLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : (
            <>
              <div className="hub-drawer-checklist">
                <label className="hub-drawer-checklist__item">
                  <input
                    type="checkbox"
                    checked={logDraft.fed}
                    disabled={!canDailyReport || logBusy}
                    onChange={(e) => setLogDraft((p) => ({ ...p, fed: e.target.checked }))}
                  />
                  Alimentação
                </label>
                <label className="hub-drawer-checklist__item">
                  <input
                    type="checkbox"
                    checked={logDraft.medication}
                    disabled={!canDailyReport || logBusy}
                    onChange={(e) => setLogDraft((p) => ({ ...p, medication: e.target.checked }))}
                  />
                  Medicação
                </label>
                <label className="hub-drawer-checklist__item">
                  <input
                    type="checkbox"
                    checked={logDraft.walks}
                    disabled={!canDailyReport || logBusy}
                    onChange={(e) => setLogDraft((p) => ({ ...p, walks: e.target.checked }))}
                  />
                  Passeio
                </label>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  className="hub-input"
                  placeholder="Humor do pet (ex.: calmo, agitado)"
                  value={logDraft.mood}
                  disabled={!canDailyReport || logBusy}
                  onChange={(e) => setLogDraft((p) => ({ ...p, mood: e.target.value }))}
                />
                <textarea
                  className="hub-input"
                  placeholder="Observações do dia"
                  rows={2}
                  value={logDraft.notes}
                  disabled={!canDailyReport || logBusy}
                  onChange={(e) => setLogDraft((p) => ({ ...p, notes: e.target.value }))}
                />
                {canDailyReport && (
                  <button
                    type="button"
                    className="hub-btn hub-btn--primary hub-btn--sm"
                    disabled={logBusy}
                    onClick={() => void handleSaveLog()}
                  >
                    {logBusy ? 'Salvando…' : todayLog ? 'Atualizar relatório' : 'Salvar relatório'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Timeline de logs anteriores */}
      {dailyLogs.length > 0 && (
        <div className="hub-drawer-section">
          <h4 className="hub-drawer-section__title">Histórico da estadia</h4>
          <ul className="hub-drawer-timeline">
            {[...dailyLogs]
              .sort((a, b) => b.log_date.localeCompare(a.log_date))
              .map((log) => {
                const fed = (log.fed as Record<string, boolean> | null)?.done;
                const medication = (log.medication as Record<string, boolean> | null)?.done;
                const walks = (log.walks as Record<string, boolean> | null)?.done;
                const parts = [];
                if (fed) parts.push('Alimentação ✓');
                if (medication) parts.push('Medicação ✓');
                if (walks) parts.push('Passeio ✓');
                return (
                  <li key={log.id} className="hub-drawer-timeline__item">
                    <span className="hub-drawer-timeline__date">{formatDate(log.log_date)}</span>
                    <span className="hub-clientes__muted">
                      {parts.length ? parts.join(' · ') : '—'}
                      {log.mood ? ` · Humor: ${log.mood}` : ''}
                      {log.notes ? ` · ${log.notes}` : ''}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Sem reserva: modo Fase 1 (só agendamento) */}
      {!item.reservation_id && (
        <div className="hub-drawer-section">
          <p className="hub-clientes__muted" style={{ fontStyle: 'italic' }}>
            Registros detalhados disponíveis após confirmar a estadia via check-in.
          </p>
        </div>
      )}

      {/* Consumo de estoque (opcional) */}
      {canWriteInventory && item.reservation_id && stockItems.length > 0 && (
        <div className="hub-drawer-section">
          <h4 className="hub-drawer-section__title">Registrar consumo de estoque</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 160px' }}>
              <label className="hub-clientes__label" htmlFor="boarding-stock-item">Item</label>
              <select
                id="boarding-stock-item"
                className="hub-clientes__select"
                value={stockItemId}
                onChange={(e) => setStockItemId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {stockItems.map((si) => (
                  <option key={si.id} value={si.id}>{si.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '0 1 80px' }}>
              <label className="hub-clientes__label" htmlFor="boarding-stock-qty">Qtd</label>
              <input
                id="boarding-stock-qty"
                type="number"
                min="0.01"
                step="0.01"
                className="hub-clientes__input"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
              />
            </div>
            <div style={{ flex: '2 1 120px' }}>
              <label className="hub-clientes__label" htmlFor="boarding-stock-notes">Obs</label>
              <input
                id="boarding-stock-notes"
                type="text"
                className="hub-clientes__input"
                value={stockNotes}
                onChange={(e) => setStockNotes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={stockBusy || !stockItemId || !parseFloat(stockQty)}
              onClick={() => void handleStockMovement()}
            >
              {stockBusy ? '…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}
    </HubSidePanel>

    {/* Checkout centralizado no Caixa — removido daqui */}
  </>
  );
};

export default BoardingReservationDrawer;
