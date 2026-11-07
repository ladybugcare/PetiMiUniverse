import React, { useCallback, useEffect, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingHandoff,
  type BoardingHandoffSnapshot,
  type BoardingOpsBoardResponse,
} from '../../api/hubBoardingApi';
import { formatDateTimeShort, formatHm } from './boardingCareUi';

type Props = {
  open: boolean;
  clinicId: string;
  unitId?: string | null;
  board: BoardingOpsBoardResponse | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
};

function suggestedShift(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Manhã';
  if (h < 18) return 'Tarde';
  return 'Noite';
}

/** Resumo do turno montado no navegador a partir do painel (o servidor grava o definitivo). */
export function previewHandoff(board: BoardingOpsBoardResponse | null, nowMs = Date.now()): BoardingHandoffSnapshot {
  const stays = board?.stays ?? [];
  const horizon = nowMs + 8 * 3600_000;
  return {
    generated_at: new Date(nowMs).toISOString(),
    present_count: stays.filter((s) => s.stage === 'checked_in').length,
    attention: stays
      .filter((s) => (s.stage === 'checked_in' || s.stage === 'reserved') && s.attention.length)
      .map((s) => ({ pet_name: s.pet?.name ?? 'Pet', reasons: s.attention.map((a) => a.label) })),
    pending_tasks: (board?.tasks ?? [])
      .filter((t) => t.status === 'pending')
      .filter((t) => !t.scheduled_for || new Date(t.scheduled_for).getTime() <= horizon)
      .map((t) => ({ pet_name: t.pet_name ?? 'Pet', title: t.title, scheduled_for: t.scheduled_for, overdue: Boolean(t.overdue) })),
    open_incidents: stays.flatMap((s) =>
      s.open_incidents.map((i) => ({ pet_name: s.pet?.name ?? 'Pet', description: i.description, severity: i.severity })),
    ),
  };
}

const SnapshotView: React.FC<{ snapshot: BoardingHandoffSnapshot | null; notes?: string | null }> = ({ snapshot, notes }) => {
  if (!snapshot) return <p className="hub-grooming-drawer__hint">Sem resumo.</p>;
  return (
    <>
      <p className="hub-grooming-drawer__hint">
        {snapshot.present_count} {snapshot.present_count === 1 ? 'pet presente' : 'pets presentes'}
      </p>
      {snapshot.attention.length ? (
        <>
          <span className="hub-clientes__label">Precisam de atenção</span>
          <ul className="hub-grooming-drawer__request-list">
            {snapshot.attention.map((a) => (
              <li key={a.pet_name}>
                <span className="hub-grooming-drawer__request-dot" aria-hidden />
                {a.pet_name}: {a.reasons.join(', ')}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {snapshot.open_incidents.length ? (
        <>
          <span className="hub-clientes__label">Intercorrências abertas</span>
          <ul className="hub-grooming-drawer__service-list hub-boarding-handoff__list">
            {snapshot.open_incidents.map((i, idx) => (
              <li key={`${i.pet_name}-${idx}`}>
                <strong>{i.pet_name}:</strong> {i.description}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {snapshot.pending_tasks.length ? (
        <>
          <span className="hub-clientes__label">Tarefas das próximas horas</span>
          <ul className="hub-grooming-drawer__service-list hub-boarding-handoff__list">
            {snapshot.pending_tasks.slice(0, 30).map((t, idx) => (
              <li key={`${t.pet_name}-${t.title}-${idx}`}>
                {t.scheduled_for ? `${formatHm(t.scheduled_for)} · ` : ''}
                <strong>{t.pet_name}</strong> · {t.title}
                {t.overdue ? <span className="hub-grooming-drawer__flag hub-grooming-drawer__flag--late"> Atrasada</span> : null}
              </li>
            ))}
          </ul>
          {snapshot.pending_tasks.length > 30 ? (
            <p className="hub-grooming-drawer__hint">e mais {snapshot.pending_tasks.length - 30} tarefas.</p>
          ) : null}
        </>
      ) : null}
      {notes ? (
        <div className="hub-grooming-drawer__callout hub-grooming-drawer__callout--notes hub-boarding-stay__spaced">
          <p>{notes}</p>
        </div>
      ) : null}
    </>
  );
};

const BoardingHandoffPanel: React.FC<Props> = ({ open, clinicId, unitId, board, canWrite, onClose, onChanged }) => {
  const { showError, showSuccess } = useAlert();
  const [handoffs, setHandoffs] = useState<BoardingHandoff[]>([]);
  const [loading, setLoading] = useState(false);
  const [shiftLabel, setShiftLabel] = useState(suggestedShift());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await hubBoardingApi.handoffs(clinicId, { unitId: unitId ?? undefined, limit: 10 });
      setHandoffs(r.handoffs ?? []);
    } catch {
      setHandoffs([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId]);

  useEffect(() => {
    if (!open) return;
    setShiftLabel(suggestedShift());
    setNotes('');
    void load();
  }, [open, load]);

  const pendingAck = handoffs.find((h) => !h.acknowledged_at) ?? null;

  const acknowledge = async (h: BoardingHandoff) => {
    setBusy(true);
    try {
      await hubBoardingApi.acknowledgeHandoff(h.id, clinicId);
      showSuccess('Ciência registrada');
      await load();
      onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar ciência');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      await hubBoardingApi.createHandoff({
        clinic_id: clinicId,
        unit_id: unitId ?? null,
        shift_label: shiftLabel.trim() || null,
        notes: notes.trim() || null,
      });
      showSuccess('Passagem de turno registrada');
      setNotes('');
      await load();
      onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar a passagem');
    } finally {
      setBusy(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Passagem de turno"
      subtitle="O que o próximo turno precisa saber."
      footer={
        canWrite ? (
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={onClose} />
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" disabled={busy} onClick={() => void create()}>
              {busy ? 'Registrando…' : 'Registrar passagem'}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="hub-grooming-drawer">
        {loading ? <HubLoading variant="inline" size="sm" label="Carregando…" /> : null}

        {pendingAck ? (
          <section className="hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
            <h4 className="hub-grooming-drawer__heading">
              Recebida · {pendingAck.shift_label ?? 'Turno'} · {formatDateTimeShort(pendingAck.created_at)}
              {pendingAck.created_by_name ? ` · ${pendingAck.created_by_name}` : ''}
            </h4>
            <SnapshotView snapshot={pendingAck.snapshot} notes={pendingAck.notes} />
            {canWrite ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm hub-boarding-stay__spaced"
                disabled={busy}
                onClick={() => void acknowledge(pendingAck)}
              >
                Dar ciência
              </button>
            ) : null}
          </section>
        ) : null}

        {canWrite ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Nova passagem</h4>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="handoff-shift">
                Turno que está saindo
              </label>
              <input
                id="handoff-shift"
                className="hub-clientes__input"
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
              />
            </div>
            <SnapshotView snapshot={previewHandoff(board)} />
            <div className="hub-clientes__field hub-boarding-stay__spaced">
              <label className="hub-clientes__label" htmlFor="handoff-notes">
                Recados
              </label>
              <textarea
                id="handoff-notes"
                className="hub-clientes__input"
                rows={3}
                value={notes}
                placeholder="Ex.: Thor tomou o remédio atrasado às 15h, observar à noite"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>
        ) : null}

        {handoffs.filter((h) => h.id !== pendingAck?.id).length ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Anteriores</h4>
            <ul className="hub-grooming-drawer__timeline">
              {handoffs
                .filter((h) => h.id !== pendingAck?.id)
                .map((h) => (
                  <li key={h.id} className="hub-grooming-drawer__timeline-item">
                    <span className="hub-grooming-drawer__timeline-dot" aria-hidden />
                    <div>
                      <p className="hub-grooming-drawer__timeline-title">
                        {h.shift_label ?? 'Turno'} · {formatDateTimeShort(h.created_at)}
                      </p>
                      <p className="hub-grooming-drawer__timeline-meta">
                        {h.created_by_name ? `Por ${h.created_by_name}` : ''}
                        {h.acknowledged_at
                          ? ` · Ciência ${h.acknowledged_by_name ? `de ${h.acknowledged_by_name}` : ''} às ${formatHm(h.acknowledged_at)}`
                          : ' · Sem ciência'}
                      </p>
                      {h.notes ? <p className="hub-grooming-drawer__timeline-body">{h.notes}</p> : null}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>
    </HubSidePanel>
  );
};

export default BoardingHandoffPanel;
