import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingOpsStay,
  type BoardingPlanPendency,
  type BoardingSpace,
} from '../../api/hubBoardingApi';
import { BelongingAddRow, type BelongingDraft } from './BoardingBelongingsSection';
import {
  BELONGING_CATEGORY_LABELS,
  boardingModeLabel,
  isCapacityBlockedError,
  isCapacityWarningError,
} from './boardingCareUi';

export type CheckInRequest = {
  reservationId: string | null;
  appointmentId?: string | null;
  stay?: BoardingOpsStay | null;
};

type Props = {
  open: boolean;
  clinicId: string;
  unitId?: string | null;
  request: CheckInRequest | null;
  onClose: () => void;
  onDone: (reservationId: string | null) => void;
  /** Abre o painel da estadia na aba Cuidados para revisar pendências. */
  onReviewCare?: (reservationId: string) => void;
};

const BoardingCheckInPanel: React.FC<Props> = ({ open, clinicId, unitId, request, onClose, onDone, onReviewCare }) => {
  const { showError, showSuccess } = useAlert();
  const stay = request?.stay ?? null;
  const mode = String(stay?.mode ?? 'hotel');
  const petName = stay?.pet?.name ?? 'Pet';
  const [spaces, setSpaces] = useState<BoardingSpace[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [belongings, setBelongings] = useState<BelongingDraft[]>([]);
  const [pendencies, setPendencies] = useState<BoardingPlanPendency[]>([]);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestKey = request ? `${request.reservationId ?? ''}:${request.appointmentId ?? ''}` : '';

  // Reinicia o formulário só quando abre para outra estadia (o painel do dia atualiza a cada 30 s).
  useEffect(() => {
    if (!open || !requestKey) return;
    setSpaceId(stay?.space?.id ?? '');
    setBelongings([]);
    setCapacityMessage(null);
    setPendencies(stay?.plan_pendencies ?? []);
    void hubBoardingApi
      .spaces(clinicId, { unitId: unitId ?? undefined })
      .then((r) => setSpaces((r.spaces ?? []).filter((s) => s.active && (s.mode === 'shared' || s.mode === mode))))
      .catch(() => setSpaces([]));
    if (request?.reservationId) {
      void hubBoardingApi
        .getCarePlan(request.reservationId, clinicId)
        .then((r) => setPendencies(r.plan_pendencies ?? []))
        .catch(() => {});
    }
  }, [open, requestKey, clinicId, unitId, mode]);

  const confirm = async (force: boolean) => {
    if (!request) return;
    setBusy(true);
    try {
      let rid = request.reservationId;
      const nowIso = new Date().toISOString();
      if (rid) {
        await hubBoardingApi.patchReservation(rid, {
          clinic_id: clinicId,
          status: 'checked_in',
          checked_in_at: nowIso,
          ...(spaceId ? { space_id: spaceId } : {}),
          ...(force ? { force_capacity: true } : {}),
        });
      } else if (request.appointmentId) {
        const r = await hubBoardingApi.openFromAppointment(clinicId, request.appointmentId, { forceCapacity: force });
        rid = r.reservation.id;
        // Mesma regra do ramo com reserva: só força capacidade se o usuário confirmou o aviso.
        if (spaceId) {
          await hubBoardingApi.patchReservation(rid, {
            clinic_id: clinicId,
            space_id: spaceId,
            ...(force ? { force_capacity: true } : {}),
          });
        }
      }
      if (rid && belongings.length) {
        await Promise.all(
          belongings.map((b) =>
            hubBoardingApi.createBelonging(rid!, {
              clinic_id: clinicId,
              category: b.category,
              description: b.description,
              quantity: b.quantity,
            }),
          ),
        ).catch(() => showError('Check-in feito, mas alguns pertences não foram salvos.'));
      }
      showSuccess(`Check-in de ${petName} feito`);
      onDone(rid ?? null);
    } catch (e: unknown) {
      if (isCapacityWarningError(e)) setCapacityMessage((e as Error).message);
      else if (isCapacityBlockedError(e)) {
        setCapacityMessage(null);
        showError((e as Error).message || 'Check-in bloqueado: capacidade da unidade atingida.');
      } else showError((e as Error)?.message || 'Erro ao fazer check-in');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !request) return null;

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={`Check-in · ${petName}`}
      subtitle={`${boardingModeLabel(mode)}${stay?.guardian?.full_name ? ` · ${stay.guardian.full_name}` : ''}`}
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={busy}
            onClick={() => void confirm(Boolean(capacityMessage))}
          >
            {busy ? 'Registrando…' : capacityMessage ? 'Confirmar acima da capacidade' : 'Confirmar check-in'}
          </button>
        </div>
      }
    >
      <div className="hub-grooming-drawer">
        {capacityMessage ? (
          <div className="hub-clinic-banner hub-clinic-banner--warning" role="alert">
            <p>{capacityMessage}</p>
          </div>
        ) : null}

        {pendencies.length ? (
          <section className="hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
            <h4 className="hub-grooming-drawer__heading">Cuidados ainda não confirmados</h4>
            <ul className="hub-grooming-drawer__request-list">
              {pendencies.map((p) => (
                <li key={p.label}>
                  <span className="hub-grooming-drawer__request-dot" aria-hidden />
                  {p.label}
                </li>
              ))}
            </ul>
            <p className="hub-grooming-drawer__hint">
              Dá para fazer o check-in assim mesmo. As pendências ficam visíveis para a equipe até alguém confirmar.
            </p>
            {request.reservationId && onReviewCare ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                onClick={() => onReviewCare(request.reservationId!)}
              >
                Revisar cuidados agora
              </button>
            ) : null}
          </section>
        ) : (
          <div className="hub-grooming-drawer__ready-banner" role="status">
            Cuidados confirmados. A rotina começa assim que o check-in for feito.
          </div>
        )}

        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Acomodação</h4>
          {spaces.length ? (
            <HubSearchableCombobox
              id="boarding-checkin-space"
              ariaLabel="Acomodação"
              options={spaces.map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.current ?? 0}/${s.capacity}${(s.current ?? 0) >= s.capacity ? ' (lotada)' : ''}`,
              }))}
              value={spaceId}
              placeholder="Definir depois"
              searchPlaceholder="Buscar acomodação…"
              clearable
              onChange={(val) => {
                setSpaceId(val);
                setCapacityMessage(null);
              }}
            />
          ) : (
            <p className="hub-grooming-drawer__hint">Nenhuma acomodação cadastrada para {boardingModeLabel(mode).toLowerCase()}.</p>
          )}
        </section>

        <section className="hub-grooming-drawer__section">
          <div className="hub-grooming-drawer__heading-row">
            <h4 className="hub-grooming-drawer__heading">Pertences na entrada</h4>
            {belongings.length ? <span className="hub-grooming-drawer__count">{belongings.length}</span> : null}
          </div>
          {belongings.length ? (
            <ul className="hub-grooming-drawer__lines">
              {belongings.map((b, idx) => (
                <li key={`${b.description}-${idx}`} className="hub-grooming-drawer__line">
                  <span className="hub-grooming-drawer__line-name">
                    {b.quantity > 1 ? `${b.quantity}× ` : ''}
                    {b.description}
                    <span className="hub-grooming-drawer__line-state"> · {BELONGING_CATEGORY_LABELS[b.category]}</span>
                  </span>
                  <button
                    type="button"
                    className="hub-clientes__icon-btn"
                    aria-label={`Remover ${b.description}`}
                    onClick={() => setBelongings((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hub-grooming-drawer__hint">Ração, medicamentos, caminha, guia… o que o tutor deixar.</p>
          )}
          <BelongingAddRow idPrefix="checkin-belonging" onAdd={(d) => setBelongings((prev) => [...prev, d])} />
        </section>
      </div>
    </HubSidePanel>
  );
};

export default BoardingCheckInPanel;
