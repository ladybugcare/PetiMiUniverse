import React, { useCallback, useEffect, useState } from 'react';
import { BedDouble, ClipboardList } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingCareBlockKey,
  type BoardingCarePlanBlocks,
  type BoardingCareProfile,
} from '../../api/hubBoardingApi';
import BoardingCareEditor from './BoardingCareEditor';
import {
  CARE_BLOCK_LABELS,
  PROFILE_BLOCK_KEYS,
  boardingModeLabel,
  emptyPlanBlocks,
  formatDayMonth,
  stayStageLabel,
  summarizeBlock,
} from './boardingCareUi';
import '../grooming/grooming-page.css';
import './boarding-page.css';

type Props = {
  clinicId: string | null | undefined;
  petId: string;
  petName: string;
};

type RecentStay = {
  id: string;
  mode: string;
  status: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  expected_check_in?: string | null;
};

function toBlocks(p: BoardingCareProfile | null): BoardingCarePlanBlocks {
  return {
    ...emptyPlanBlocks(),
    feeding: p?.feeding ?? null,
    medications: p?.medications ?? null,
    walks: p?.walks ?? null,
    handling: p?.handling ?? null,
  };
}

/** Ficha permanente de hospedagem: a recepção preenche uma vez e cada reserva herda. */
const PetBoardingCareCard: React.FC<Props> = ({ clinicId, petId, petName }) => {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('boarding.reservations.read');
  const canEdit = hasPermission('boarding.reservations.manage');
  const { showError, showSuccess } = useAlert();

  const [profile, setProfile] = useState<BoardingCareProfile | null>(null);
  const [recent, setRecent] = useState<RecentStay[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BoardingCarePlanBlocks>(emptyPlanBlocks());
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId || !canRead) return;
    setLoading(true);
    try {
      const r = await hubBoardingApi.getCareProfile(petId, clinicId);
      setProfile(r.profile);
      setRecent(r.recent_stays ?? []);
    } catch {
      setProfile(null);
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, petId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canRead || !clinicId) return null;

  const blocks = toBlocks(profile);
  const filled = PROFILE_BLOCK_KEYS.filter((k) => summarizeBlock(k, blocks));

  const openEditor = () => {
    setDraft(toBlocks(profile));
    setNotes(profile?.notes ?? '');
    setDirty(new Set());
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Parameters<typeof hubBoardingApi.putCareProfile>[1] = { clinic_id: clinicId };
      if (dirty.has('feeding')) payload.feeding = draft.feeding;
      if (dirty.has('medications')) payload.medications = draft.medications;
      if (dirty.has('handling')) payload.handling = draft.handling;
      if ((notes.trim() || null) !== (profile?.notes ?? null)) payload.notes = notes.trim() || null;
      const r = await hubBoardingApi.putCareProfile(petId, payload);
      setProfile(r.profile);
      setEditing(false);
      showSuccess(
        r.plans_updated
          ? `Ficha salva. ${r.plans_updated} ${r.plans_updated === 1 ? 'reserva futura atualizada' : 'reservas futuras atualizadas'}.`
          : 'Ficha de hospedagem salva',
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar a ficha de hospedagem');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = dirty.size > 0 || (notes.trim() || null) !== (profile?.notes ?? null);

  return (
    <section className="hub-pet-care__card hub-pet-care__card--boarding">
      <header className="hub-pet-care__card-head">
        <span className="hub-pet-care__card-icon" aria-hidden>
          <BedDouble size={20} />
        </span>
        <div>
          <h3>Hospedagem</h3>
          <p>Rotina que cada reserva de Hotel & Creche herda</p>
        </div>
        {canEdit ? (
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={openEditor}>
            {filled.length ? 'Editar' : 'Preencher'}
          </button>
        ) : (
          <span className="hub-pet-care__count">{filled.length}</span>
        )}
      </header>

      {loading && !profile ? (
        <HubLoading variant="inline" size="sm" label="Carregando…" />
      ) : filled.length || profile?.notes ? (
        <dl className="hub-boarding-care__summary">
          {filled.map((k) => (
            <div key={k} className="hub-boarding-care__summary-row">
              <dt>{CARE_BLOCK_LABELS[k]}</dt>
              <dd>{summarizeBlock(k, blocks)}</dd>
            </div>
          ))}
          {profile?.notes ? (
            <div className="hub-boarding-care__summary-row">
              <dt>Observações</dt>
              <dd>{profile.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <div className="hub-pet-care__empty">
          <ClipboardList size={17} aria-hidden />
          <span>Sem rotina de hospedagem. Preencha uma vez e as próximas reservas já chegam prontas.</span>
        </div>
      )}

      {recent.length ? (
        <p className="hub-boarding-care__recent">
          Últimas estadias:{' '}
          {recent
            .slice(0, 3)
            .map(
              (s) =>
                `${boardingModeLabel(s.mode)} ${formatDayMonth(s.checked_in_at ?? s.expected_check_in ?? null)} (${stayStageLabel(s.status).toLowerCase()})`,
            )
            .join(' · ')}
        </p>
      ) : null}

      {canEdit ? (
        <HubSidePanel
          open={editing}
          onClose={() => setEditing(false)}
          title="Ficha de hospedagem"
          subtitle={petName}
          size="wide"
          footer={
            <div className="hub-clientes__panel-footer">
              <HubCancelButton onClick={() => setEditing(false)} />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={saving || !hasChanges}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : 'Salvar ficha'}
              </button>
            </div>
          }
        >
          <div className="hub-grooming-drawer">
            <p className="hub-grooming-drawer__hint">
              Reservas futuras que ainda herdam estes dados são atualizadas ao salvar. O que já foi ajustado em uma
              reserva continua como está.
            </p>
            <BoardingCareEditor
              idPrefix={`pet-care-${petId}`}
              blocks={[...PROFILE_BLOCK_KEYS]}
              value={draft}
              disabled={saving}
              dirtyBlocks={dirty}
              onChange={(next, changed) => {
                setDraft(next);
                setDirty((prev) => new Set(prev).add(changed));
              }}
            />
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`pet-care-${petId}-notes`}>
                Observações gerais
              </label>
              <textarea
                id={`pet-care-${petId}-notes`}
                className="hub-clientes__input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default PetBoardingCareCard;
