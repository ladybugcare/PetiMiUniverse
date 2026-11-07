import React, { useEffect, useMemo, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubCheckbox } from '../../components/HubCheckbox';
import { useAlert } from '../../components/AlertProvider';
import { hubBoardingApi, type BoardingOpsStay } from '../../api/hubBoardingApi';
import { boardingModeLabel } from './boardingCareUi';

type Kind = 'recreation' | 'walk' | 'custom';

const KIND_LABELS: Record<Kind, string> = { recreation: 'Recreação', walk: 'Passeio', custom: 'Outra atividade' };

type Props = {
  open: boolean;
  clinicId: string;
  stays: BoardingOpsStay[];
  /** Pré-seleção (ex.: tarefas marcadas na visão por tarefa). */
  initial?: { kind: Kind; title?: string; reservationIds: string[] } | null;
  onClose: () => void;
  onDone: () => void;
};

/** Registro em lote: só atividades coletivas. Alimentação e medicação são sempre individuais. */
const BoardingGroupActivityPanel: React.FC<Props> = ({ open, clinicId, stays, initial, onClose, onDone }) => {
  const { showError, showSuccess, showWarning } = useAlert();
  const present = useMemo(() => stays.filter((s) => s.stage === 'checked_in' && s.reservation_id), [stays]);
  const [kind, setKind] = useState<Kind>('recreation');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? 'recreation');
    setTitle(initial?.title ?? '');
    setNotes('');
    setSelected(new Set(initial?.reservationIds ?? []));
  }, [open, initial]);

  const blocked = (s: BoardingOpsStay) => kind === 'recreation' && !s.can_group_play;
  const eligible = present.filter((s) => !blocked(s));

  const toggle = (rid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  const ids = [...selected].filter((rid) => eligible.some((s) => s.reservation_id === rid));

  const submit = async () => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await hubBoardingApi.batchActivity({
        clinic_id: clinicId,
        reservation_ids: ids,
        kind,
        title: title.trim() || null,
        notes: notes.trim() || null,
      });
      const n = r.done.length;
      if (n) showSuccess(`${KIND_LABELS[kind]} registrada para ${n} ${n === 1 ? 'pet' : 'pets'}`);
      if (r.skipped.length) {
        showWarning(
          `Não registrado para: ${r.skipped.map((s) => `${s.pet_name ?? 'pet'} (${s.reason})`).join(', ')}`,
        );
      }
      onDone();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar a atividade');
    } finally {
      setBusy(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Atividade em grupo"
      subtitle="Registre uma vez para todos que participaram."
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={busy || !ids.length}
            onClick={() => void submit()}
          >
            {busy ? 'Registrando…' : `Registrar para ${ids.length} ${ids.length === 1 ? 'pet' : 'pets'}`}
          </button>
        </div>
      }
    >
      <div className="hub-grooming-drawer">
        <div className="hub-clientes__field">
          <span className="hub-clientes__label">Atividade</span>
          <div className="hub-clientes__btn-row">
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={`hub-clientes__btn hub-clientes__btn--sm ${kind === k ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                onClick={() => setKind(k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="group-activity-title">
            Descrição
          </label>
          <input
            id="group-activity-title"
            className="hub-clientes__input"
            value={title}
            placeholder={kind === 'recreation' ? 'Ex.: recreação no pátio' : kind === 'walk' ? 'Ex.: passeio da tarde' : 'Ex.: escovação'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <p className="hub-grooming-drawer__hint">
          Alimentação e medicação não entram em lote: cada pet tem seu registro individual.
        </p>

        <section className="hub-grooming-drawer__section">
          <div className="hub-grooming-drawer__heading-row">
            <h4 className="hub-grooming-drawer__heading">Participantes</h4>
            <button
              type="button"
              className="hub-clientes__link-btn"
              onClick={() =>
                setSelected(ids.length === eligible.length ? new Set() : new Set(eligible.map((s) => s.reservation_id!)))
              }
            >
              {ids.length === eligible.length && eligible.length ? 'Limpar' : 'Selecionar todos'}
            </button>
          </div>
          {present.length ? (
            <ul className="hub-grooming-drawer__checklist">
              {present.map((s) => {
                const rid = s.reservation_id!;
                const isBlocked = blocked(s);
                return (
                  <li key={rid}>
                    <div className={`hub-grooming-drawer__check-row${selected.has(rid) && !isBlocked ? ' hub-grooming-drawer__check-row--done' : ''}`}>
                      <HubCheckbox checked={selected.has(rid) && !isBlocked} disabled={isBlocked} onChange={() => toggle(rid)}>
                        {s.pet?.name ?? 'Pet'}
                        <span className="hub-grooming-drawer__muted">
                          {' '}
                          · {boardingModeLabel(s.mode)}
                          {s.space?.name ? ` · ${s.space.name}` : ''}
                          {isBlocked ? ' · Manejo não permite grupo' : ''}
                        </span>
                      </HubCheckbox>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hub-grooming-drawer__hint">Nenhum pet hospedado agora.</p>
          )}
        </section>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="group-activity-notes">
            Observação
          </label>
          <textarea
            id="group-activity-notes"
            className="hub-clientes__input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </HubSidePanel>
  );
};

export default BoardingGroupActivityPanel;
