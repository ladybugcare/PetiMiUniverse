import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, Calendar, ClipboardList, Home, Loader, Moon } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubTabs } from '../../components/HubTabs';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingCareProfile,
  type BoardingDrawerResponse,
  type BoardingOpsStay,
} from '../../api/hubBoardingApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import { digitsOnlyBrPhone, formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import { PetOperationalAddAlert } from '../pets/PetOperationalAddAlert';
import { shouldShowBoardingBillingButton } from './boardingBillingUi';
import BoardingStayRoutineTab from './BoardingStayRoutineTab';
import BoardingStayCareTab from './BoardingStayCareTab';
import BoardingStayDetailsTab from './BoardingStayDetailsTab';
import BoardingStayHistoryTab from './BoardingStayHistoryTab';
import {
  CARE_BLOCK_LABELS,
  PROFILE_BLOCK_KEYS,
  boardingModeLabel,
  daycarePeriodLabel,
  formatDateTimeShort,
  formatDayMonth,
  petInitials,
  stayStageLabel,
  stayStageVariant,
  summarizeBlock,
} from './boardingCareUi';

export type StayPanelTab = 'routine' | 'care' | 'stay' | 'history';

export type BoardingStayTarget = {
  reservationId: string | null;
  /** Item do painel (agendamento sem reserva ainda, ou para cabeçalho imediato). */
  stay?: BoardingOpsStay | null;
  initialTab?: StayPanelTab;
};

type Props = {
  open: boolean;
  target: BoardingStayTarget | null;
  canManage: boolean;
  canDailyReport: boolean;
  canManageFinance?: boolean;
  canWriteInventory?: boolean;
  unitId?: string | null;
  onClose: () => void;
  onUpdated?: () => void;
  onRequestCheckIn?: (stay: { reservationId: string | null; appointmentId?: string | null; stay?: BoardingOpsStay | null }) => void;
  onRequestCheckOut?: (reservationId: string) => void;
};

const BoardingStayPanel: React.FC<Props> = ({
  open,
  target,
  canManage,
  canDailyReport,
  canManageFinance,
  canWriteInventory,
  unitId,
  onClose,
  onUpdated,
  onRequestCheckIn,
  onRequestCheckOut,
}) => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canAddPetAlert = hasPermission('boarding.reservations.manage');
  const { showError, showSuccess, showConfirm } = useAlert();
  const reservationId = target?.reservationId ?? null;
  const stay = target?.stay ?? null;

  const [drawer, setDrawer] = useState<BoardingDrawerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadSeq, setLoadSeq] = useState(0);
  const [tab, setTab] = useState<StayPanelTab>('routine');
  const [busy, setBusy] = useState(false);
  const [slotProfile, setSlotProfile] = useState<BoardingCareProfile | null>(null);

  const load = useCallback(async () => {
    if (!clinicId || !reservationId) return;
    setLoading(true);
    try {
      const d = await hubBoardingApi.reservationDrawer(reservationId, clinicId);
      setDrawer(d);
      setLoadSeq((n) => n + 1);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar a estadia');
    } finally {
      setLoading(false);
    }
  }, [clinicId, reservationId, showError]);

  const initialTab = target?.initialTab;
  const stayStage = stay?.stage;
  const slotPetId = stay?.pet_id ?? null;

  useEffect(() => {
    if (!open) {
      setDrawer(null);
      setSlotProfile(null);
      return;
    }
    setTab(initialTab ?? (stayStage === 'reserved' ? 'care' : 'routine'));
  }, [open, reservationId, initialTab, stayStage]);

  useEffect(() => {
    if (!open) return;
    if (reservationId) {
      void load();
      return;
    }
    if (!clinicId || !slotPetId) return;
    void hubBoardingApi
      .getCareProfile(slotPetId, clinicId)
      .then((r) => setSlotProfile(r.profile))
      .catch(() => setSlotProfile(null));
  }, [open, reservationId, load, clinicId, slotPetId]);

  const refresh = async () => {
    await load();
    onUpdated?.();
  };

  if (!open || !target) return null;

  const rsv = drawer?.reservation ?? null;
  const stage = String(rsv?.status ?? stay?.stage ?? 'reserved');
  const mode = String(rsv?.mode ?? stay?.mode ?? 'hotel');
  const pet = drawer?.pet ?? stay?.pet ?? null;
  const guardian = drawer?.guardian ?? stay?.guardian ?? null;
  const petName = pet?.name || 'Pet';
  const tags = drawer?.clinical_tags ?? stay?.clinical_tags ?? [];
  const attention = drawer?.attention ?? stay?.attention ?? [];
  const pendencies = drawer?.plan_pendencies ?? stay?.plan_pendencies ?? [];
  const porte = pet?.size_tier ? PORTE_LABELS[pet.size_tier as PetBodyPorteValue] ?? pet.size_tier : null;
  const heroMeta = [pet?.breed, porte, boardingModeLabel(mode)].filter(Boolean).join(' · ');
  const startIso = (rsv?.checked_in_at ?? rsv?.expected_check_in ?? stay?.starts_at ?? null) as string | null;
  const endIso = (rsv?.checked_out_at ?? rsv?.expected_check_out ?? stay?.ends_at ?? null) as string | null;
  const nights = drawer?.nights_count ?? stay?.nights_count ?? 0;
  const spaceName = drawer?.space?.name ?? stay?.space?.name ?? null;
  const period = daycarePeriodLabel(rsv?.daycare_period ?? stay?.daycare_period);
  const shiftLabel =
    stay?.daycare_shift?.label ??
    drawer?.unit_settings?.daycare_shifts?.find((s) => s.key === rsv?.daycare_shift_key)?.label ??
    null;
  const isLate = Boolean(stay?.is_late) || attention.some((a) => a.key === 'late_checkout');
  const subtitle = `${formatDayMonth(startIso)} → ${formatDayMonth(endIso)}`;

  const handleBilling = async () => {
    if (!clinicId || !reservationId) return;
    setBusy(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'boarding_reservation',
        origin_id: reservationId,
        unit_id: unitId ?? undefined,
      });
      const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
      showSuccess('Comanda aberta.');
      if (comandaId) navigate(`/hub/caixa/comanda/${comandaId}`);
      onUpdated?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar cobrança');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: 'cancelled' | 'no_show', label: string) => {
    if (!clinicId || !reservationId) return;
    showConfirm(
      `${label} a reserva de ${petName}? As tarefas pendentes serão removidas.`,
      () => {
        setBusy(true);
        void hubBoardingApi
          .patchReservation(reservationId, { clinic_id: clinicId, status })
          .then(() => {
            showSuccess(status === 'cancelled' ? 'Reserva cancelada' : 'Registrado como não compareceu');
            onUpdated?.();
            onClose();
          })
          .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao atualizar a reserva'))
          .finally(() => setBusy(false));
      },
      label,
    );
  };

  const showBilling = shouldShowBoardingBillingButton({ stage, canManageFinance, reservationId });
  const primary =
    canManage && stage === 'reserved' && onRequestCheckIn ? (
      <button
        type="button"
        className="hub-grooming-drawer__advance-btn"
        disabled={busy}
        onClick={() => onRequestCheckIn({ reservationId, appointmentId: stay?.appointment_id ?? null, stay })}
      >
        Fazer check-in
      </button>
    ) : canManage && stage === 'checked_in' && reservationId && onRequestCheckOut ? (
      <button
        type="button"
        className="hub-grooming-drawer__advance-btn"
        disabled={busy}
        onClick={() => onRequestCheckOut(reservationId)}
      >
        Fazer check-out
      </button>
    ) : showBilling ? (
      <button type="button" className="hub-grooming-drawer__advance-btn" disabled={busy} onClick={() => void handleBilling()}>
        {busy ? <Loader size={16} className="spin" aria-hidden /> : null}
        Gerar cobrança
      </button>
    ) : null;

  const footer =
    primary || (canManage && stage === 'reserved' && reservationId) ? (
      <div className="hub-grooming-drawer__footer">
        {primary}
        {canManage && stage === 'reserved' && reservationId ? (
          <div className="hub-grooming-drawer__footer-secondary">
            <button
              type="button"
              className="hub-grooming-drawer__secondary-btn"
              disabled={busy}
              onClick={() => setStatus('no_show', 'Não compareceu')}
            >
              Não compareceu
            </button>
            <button
              type="button"
              className="hub-grooming-drawer__secondary-btn"
              disabled={busy}
              onClick={() => setStatus('cancelled', 'Cancelar')}
            >
              Cancelar reserva
            </button>
          </div>
        ) : null}
      </div>
    ) : undefined;

  const taskCount = (drawer?.tasks ?? []).filter((t) => t.status === 'pending').length;
  const tabs = [
    { id: 'routine', label: 'Rotina', badge: stage === 'checked_in' ? taskCount : null },
    { id: 'care', label: 'Cuidados', badge: pendencies.length || null },
    { id: 'stay', label: 'Hospedagem' },
    { id: 'history', label: 'Histórico' },
  ];

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={petName}
      titleIcon={mode === 'hotel' ? <BedDouble size={16} aria-hidden /> : <Home size={16} aria-hidden />}
      subtitle={subtitle}
      contentKey={`${reservationId ?? stay?.key ?? ''}-${tab}`}
      size="wide"
      footer={footer}
    >
      <div className="hub-grooming-drawer hub-boarding-stay">
        <HubRefreshingBanner show={Boolean(drawer && loading)} label="Atualizando…" />

        <div className="hub-grooming-drawer__hero">
          {pet?.avatar_url ? (
            <img src={pet.avatar_url} alt="" className="hub-grooming-drawer__avatar" />
          ) : (
            <div className="hub-grooming-drawer__avatar hub-grooming-drawer__avatar--fallback" aria-hidden>
              {petInitials(petName)}
            </div>
          )}
          <div className="hub-grooming-drawer__hero-info">
            {heroMeta ? <p className="hub-grooming-drawer__hero-meta">{heroMeta}</p> : null}
            <p className="hub-grooming-drawer__hero-tutor">
              <span className="hub-grooming-drawer__hero-kicker">Tutor</span>
              {guardian?.full_name ?? '—'}
            </p>
            {guardian?.phone ? (
              <a className="hub-grooming-drawer__hero-phone" href={`tel:${digitsOnlyBrPhone(guardian.phone)}`}>
                {formatBrPhoneDisplay(guardian.phone)}
              </a>
            ) : (
              <p className="hub-grooming-drawer__hero-phone hub-grooming-drawer__hero-phone--empty">Sem telefone</p>
            )}
            <div className="hub-grooming-drawer__badges">
              <span className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${stayStageVariant(stage)}`}>
                {stayStageLabel(stage)}
              </span>
              {isLate ? <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--late">Saída atrasada</span> : null}
              {stay?.is_walk_in ? <span className="hub-grooming-drawer__flag">Avulso</span> : null}
            </div>
          </div>
        </div>

        <div className="hub-grooming-drawer__facts">
          <div className="hub-grooming-drawer__fact">
            <span className="hub-grooming-drawer__fact-label">
              <Calendar size={13} className="hub-grooming-drawer__fact-icon" aria-hidden />
              {rsv?.checked_in_at ? 'Entrou' : 'Entrada'}
            </span>
            <span className="hub-grooming-drawer__fact-value">{formatDateTimeShort(startIso)}</span>
          </div>
          <div className="hub-grooming-drawer__fact">
            <span className="hub-grooming-drawer__fact-label">
              <Calendar size={13} className="hub-grooming-drawer__fact-icon" aria-hidden />
              {rsv?.checked_out_at ? 'Saiu' : 'Saída prevista'}
            </span>
            <span className="hub-grooming-drawer__fact-value">{endIso ? formatDateTimeShort(endIso) : 'Sem previsão'}</span>
          </div>
          <div className="hub-grooming-drawer__fact">
            <span className="hub-grooming-drawer__fact-label">
              <Moon size={13} className="hub-grooming-drawer__fact-icon" aria-hidden />
              {mode === 'hotel' ? 'Diárias' : 'Período'}
            </span>
            <span className="hub-grooming-drawer__fact-value">
              {mode === 'hotel'
                ? `${drawer?.pricing?.quantity ?? nights} ${(drawer?.pricing?.quantity ?? nights) === 1 ? 'diária' : 'diárias'}`
                : [period ?? 'Período integral', shiftLabel].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="hub-grooming-drawer__fact">
            <span className="hub-grooming-drawer__fact-label">
              <ClipboardList size={13} className="hub-grooming-drawer__fact-icon" aria-hidden />
              Acomodação
            </span>
            <span className="hub-grooming-drawer__fact-value">{spaceName ?? 'Não definida'}</span>
          </div>
        </div>

        {attention.length ? (
          <section className="hub-grooming-drawer__section hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
            <h4 className="hub-grooming-drawer__heading">Precisa de atenção</h4>
            <ul className="hub-grooming-drawer__request-list">
              {attention.map((a) => (
                <li key={a.key} className={a.severity === 'high' ? 'hub-boarding-attention--high' : undefined}>
                  <span className="hub-grooming-drawer__request-dot" aria-hidden />
                  {a.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tags.length > 0 || (canAddPetAlert && clinicId && pet?.id) ? (
          <section className="hub-grooming-drawer__section" aria-label="Alertas do pet">
            <h4 className="hub-grooming-drawer__heading">Alertas</h4>
            {tags.length ? (
              <div className="hub-grooming-tags hub-grooming-tags--drawer">
                {tags.map((t) => (
                  <span key={t.key} className="hub-grooming-tags__pill">
                    {t.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="hub-grooming-drawer__hint">Nenhum alerta na ficha deste pet.</p>
            )}
            {canAddPetAlert && clinicId && pet?.id ? (
              <PetOperationalAddAlert
                clinicId={clinicId}
                petId={pet.id}
                source="boarding"
                existingFlagKeys={tags.map((t) => t.key).filter((k) => !k.startsWith('behavior:') && k !== 'no_dryer')}
                onAdded={() => void refresh()}
              />
            ) : null}
          </section>
        ) : null}

        {!reservationId ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Ficha de cuidados</h4>
            <p className="hub-grooming-drawer__hint">
              No check-in, o plano da estadia é criado a partir desta ficha. A recepção confirma o que vale para esta vez.
            </p>
            <ul className="hub-grooming-drawer__service-list">
              {PROFILE_BLOCK_KEYS.map((k) => (
                <li key={k}>
                  <strong>{CARE_BLOCK_LABELS[k]}:</strong>{' '}
                  {(slotProfile && summarizeBlock(k, slotProfile)) || <span className="hub-grooming-drawer__muted">Não informado</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : !drawer ? (
          <HubLoading variant="block" label="Carregando estadia…" className="hub-grooming-drawer__loading" />
        ) : (
          <>
            <HubTabs
              ariaLabel="Seções da estadia"
              variant="detail"
              items={tabs}
              activeId={tab}
              onTabChange={(id) => setTab(id as StayPanelTab)}
              className="hub-boarding-stay__tabs"
            />
            {drawer.migrations_ready === false ? (
              <div className="hub-clinic-banner hub-clinic-banner--warning">
                <p>Rode as migrações 123 a 130 do Hub para habilitar rotina, cuidados e registros desta estadia.</p>
              </div>
            ) : null}
            {tab === 'routine' && clinicId ? (
              <BoardingStayRoutineTab
                key={`routine-${reservationId}`}
                clinicId={clinicId}
                reservationId={drawer.reservation.id}
                stage={stage}
                tasks={drawer.tasks ?? []}
                incidents={drawer.incidents ?? []}
                handling={drawer.care_plan?.handling ?? drawer.care_profile?.handling ?? null}
                canDailyReport={canDailyReport}
                onChanged={refresh}
              />
            ) : null}
            {tab === 'care' && clinicId ? (
              <BoardingStayCareTab
                key={`care-${drawer.care_plan?.updated_at ?? 'none'}`}
                clinicId={clinicId}
                reservationId={drawer.reservation.id}
                mode={mode}
                stage={stage}
                petName={petName}
                guardianName={guardian?.full_name}
                guardianPhone={guardian?.phone}
                plan={drawer.care_plan ?? null}
                profile={drawer.care_profile ?? null}
                pendencies={drawer.plan_pendencies ?? []}
                canManage={canManage}
                onSaved={refresh}
              />
            ) : null}
            {tab === 'stay' && clinicId ? (
              <BoardingStayDetailsTab
                key={`stay-${drawer.reservation.updated_at}`}
                clinicId={clinicId}
                drawer={drawer}
                canManage={canManage}
                canWriteInventory={canWriteInventory}
                onChanged={refresh}
              />
            ) : null}
            {tab === 'history' && clinicId ? (
              <BoardingStayHistoryTab
                clinicId={clinicId}
                reservationId={drawer.reservation.id}
                media={drawer.media ?? []}
                canUpload={canDailyReport && stage !== 'cancelled'}
                refreshKey={loadSeq}
                onChanged={refresh}
              />
            ) : null}
          </>
        )}
      </div>
    </HubSidePanel>
  );
};

export default BoardingStayPanel;
