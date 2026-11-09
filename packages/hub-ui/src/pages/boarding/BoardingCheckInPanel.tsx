import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingBlockStatus,
  type BoardingCareBlockKey,
  type BoardingCarePlan,
  type BoardingCarePlanBlocks,
  type BoardingCareProfile,
  type BoardingOpsStay,
  type BoardingPlanPendency,
  type BoardingSpace,
} from '../../api/hubBoardingApi';
import { BelongingAddRow, type BelongingDraft } from './BoardingBelongingsSection';
import BoardingCareEditor from './BoardingCareEditor';
import {
  BELONGING_CATEGORY_LABELS,
  boardingModeLabel,
  emptyPlanBlocks,
  isCapacityBlockedError,
  isCapacityWarningError,
  stayCarePlanBlocks,
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
};

function blocksFromPlan(plan: BoardingCarePlan | null): BoardingCarePlanBlocks {
  if (!plan) return emptyPlanBlocks();
  return {
    feeding: plan.feeding ?? null,
    medications: plan.medications ?? null,
    walks: plan.walks ?? null,
    handling: plan.handling ?? null,
    recreation: plan.recreation ?? null,
  };
}

function blocksFromProfile(profile: BoardingCareProfile | null): BoardingCarePlanBlocks {
  if (!profile) return emptyPlanBlocks();
  return {
    feeding: profile.feeding ?? null,
    medications: profile.medications ?? null,
    walks: profile.walks ?? null,
    handling: profile.handling ?? null,
    recreation: null,
  };
}

const BoardingCheckInPanel: React.FC<Props> = ({ open, clinicId, unitId, request, onClose, onDone }) => {
  const { showError, showSuccess } = useAlert();
  const stay = request?.stay ?? null;
  const reservationId = request?.reservationId ?? stay?.reservation_id ?? null;
  const petId = stay?.pet_id ?? stay?.pet?.id ?? null;
  const mode = String(stay?.mode ?? 'hotel');
  const petName = stay?.pet?.name ?? 'Pet';
  const careSectionRef = useRef<HTMLElement | null>(null);
  const [spaces, setSpaces] = useState<BoardingSpace[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [belongings, setBelongings] = useState<BelongingDraft[]>([]);
  const [pendencies, setPendencies] = useState<BoardingPlanPendency[]>([]);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [careOpen, setCareOpen] = useState(true);
  const [careLoading, setCareLoading] = useState(false);
  const [plan, setPlan] = useState<BoardingCarePlan | null>(null);
  const [draft, setDraft] = useState<BoardingCarePlanBlocks>(emptyPlanBlocks());
  const [localStatus, setLocalStatus] = useState<Partial<Record<BoardingCareBlockKey, BoardingBlockStatus>>>({});
  const [dirty, setDirty] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [confirmBlocks, setConfirmBlocks] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [saveToProfile, setSaveToProfile] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [savingCare, setSavingCare] = useState(false);

  const requestKey = request ? `${reservationId ?? ''}:${request.appointmentId ?? ''}` : '';
  const planBlocks = useMemo(() => stayCarePlanBlocks(mode), [mode]);
  const confirmable = useMemo(
    () => planBlocks.filter((k) => localStatus[k] === 'inherited'),
    [localStatus, planBlocks],
  );
  const careHasChanges = dirty.size > 0 || confirmBlocks.size > 0;

  const resetCare = (
    p: BoardingCarePlan | null,
    pend: BoardingPlanPendency[],
    blocks?: BoardingCarePlanBlocks,
    status?: Partial<Record<BoardingCareBlockKey, BoardingBlockStatus>>,
  ) => {
    setPlan(p);
    setPendencies(pend);
    setDraft(blocks ?? blocksFromPlan(p));
    setLocalStatus(status ?? p?.block_status ?? {});
    setDirty(new Set());
    setConfirmBlocks(new Set());
    setSaveToProfile(new Set());
  };

  // Reinicia o formulário só quando abre para outra estadia (o painel do dia atualiza a cada 30 s).
  useEffect(() => {
    if (!open || !requestKey) return;
    const initialPendencies = stay?.plan_pendencies ?? [];
    setSpaceId(stay?.space?.id ?? '');
    setBelongings([]);
    setCapacityMessage(null);
    setCareOpen(true);
    setPendencies(initialPendencies);
    resetCare(null, initialPendencies);
    void hubBoardingApi
      .spaces(clinicId, { unitId: unitId ?? undefined })
      .then((r) => setSpaces((r.spaces ?? []).filter((s) => s.active && (s.mode === 'shared' || s.mode === mode))))
      .catch(() => setSpaces([]));

    let cancelled = false;
    setCareLoading(true);
    const load = async () => {
      try {
        if (reservationId) {
          const r = await hubBoardingApi.getCarePlan(reservationId, clinicId);
          if (cancelled) return;
          resetCare(r.care_plan, r.plan_pendencies ?? []);
          return;
        }
        if (petId) {
          const r = await hubBoardingApi.getCareProfile(petId, clinicId);
          if (cancelled) return;
          resetCare(null, initialPendencies, blocksFromProfile(r.profile), {
            feeding: 'pending',
            medications: 'pending',
            handling: 'pending',
            recreation: 'pending',
          });
        }
      } catch {
        /* mantém pendências do painel */
      } finally {
        if (!cancelled) setCareLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, requestKey, clinicId, unitId, mode, reservationId, petId]);

  const handleCareChange = (next: BoardingCarePlanBlocks, key: BoardingCareBlockKey) => {
    setDraft(next);
    setDirty((prev) => new Set(prev).add(key));
    setLocalStatus((prev) => ({ ...prev, [key]: 'overridden' }));
  };

  const handleConfirmBlock = (key: BoardingCareBlockKey) => {
    setConfirmBlocks((prev) => new Set(prev).add(key));
    setLocalStatus((prev) => ({ ...prev, [key]: 'confirmed' }));
  };

  const saveCare = async (rid: string): Promise<boolean> => {
    if (!careHasChanges) return true;
    setSavingCare(true);
    try {
      const blocksPatch: Partial<BoardingCarePlanBlocks> = {};
      for (const key of dirty) (blocksPatch as Record<string, unknown>)[key] = draft[key];
      const r = await hubBoardingApi.putCarePlan(rid, {
        clinic_id: clinicId,
        ...blocksPatch,
        confirm_blocks: [...confirmBlocks],
        save_to_profile: [...saveToProfile].filter(
          (k): k is Exclude<BoardingCareBlockKey, 'recreation'> => k !== 'recreation' && dirty.has(k),
        ),
      });
      resetCare(r.care_plan, r.plan_pendencies ?? []);
      return true;
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar o plano de cuidados');
      return false;
    } finally {
      setSavingCare(false);
    }
  };

  const confirm = async (force: boolean) => {
    if (!request) return;
    setBusy(true);
    try {
      let rid = reservationId;
      if (rid && careHasChanges) {
        const ok = await saveCare(rid);
        if (!ok) return;
      }
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
        if (careHasChanges) {
          const ok = await saveCare(rid);
          if (!ok) {
            showError('Check-in feito, mas o plano de cuidados não foi salvo.');
          }
        }
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
            disabled={busy || savingCare}
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
              Dá para fazer o check-in assim mesmo. Preencha o plano abaixo ou deixe as pendências para a equipe.
            </p>
            <div className="hub-clientes__btn-row">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                aria-expanded={careOpen}
                onClick={() => setCareOpen((v) => !v)}
              >
                {careOpen ? 'Ocultar cuidados' : 'Revisar cuidados agora'}
              </button>
              {careOpen && confirmable.length ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => confirmable.forEach(handleConfirmBlock)}
                >
                  Confirmar o que veio da ficha
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            <div className="hub-grooming-drawer__ready-banner" role="status">
              Cuidados confirmados. A rotina começa assim que o check-in for feito.
            </div>
            <div className="hub-clientes__btn-row hub-boarding-checkin__care-toggle">
              <button
                type="button"
                className="hub-clientes__link-btn"
                aria-expanded={careOpen}
                onClick={() => setCareOpen((v) => !v)}
              >
                {careOpen ? 'Ocultar plano de cuidados' : 'Ver ou editar plano de cuidados'}
              </button>
            </div>
          </>
        )}

        {careOpen ? (
          <section ref={careSectionRef} className="hub-grooming-drawer__section hub-boarding-checkin__care">
            <div className="hub-grooming-drawer__heading-row">
              <h4 className="hub-grooming-drawer__heading">Plano de cuidados</h4>
            </div>
            {careLoading ? (
              <HubLoading variant="block" label="Carregando plano…" className="hub-grooming-drawer__loading" />
            ) : (
              <>
                <BoardingCareEditor
                  idPrefix={`checkin-care-${reservationId ?? request.appointmentId ?? 'new'}`}
                  blocks={planBlocks}
                  value={draft}
                  onChange={handleCareChange}
                  statusByBlock={localStatus}
                  onConfirmBlock={handleConfirmBlock}
                  dirtyBlocks={dirty}
                  saveToProfile={{
                    selected: saveToProfile,
                    onToggle: (k) =>
                      setSaveToProfile((prev) => {
                        const next = new Set(prev);
                        if (next.has(k)) next.delete(k);
                        else next.add(k);
                        return next;
                      }),
                  }}
                />
                {careHasChanges || (reservationId && plan) ? (
                  <div className="hub-boarding-checkin__care-savebar">
                    <span className="hub-grooming-drawer__muted">
                      {careHasChanges
                        ? reservationId
                          ? 'Alterações serão salvas ao confirmar o check-in, ou agora.'
                          : 'As alterações serão salvas ao confirmar o check-in.'
                        : 'Sem alterações'}
                    </span>
                    {reservationId ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        disabled={savingCare || !careHasChanges}
                        onClick={() =>
                          void saveCare(reservationId).then((ok) => {
                            if (ok) showSuccess('Plano de cuidados salvo');
                          })
                        }
                      >
                        {savingCare ? 'Salvando…' : 'Salvar cuidados'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

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
