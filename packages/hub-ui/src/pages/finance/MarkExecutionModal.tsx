import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubLoading } from '../../components/HubLoading';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import {
  hubFinancialApi,
  type HubFinanceDayBoardItem,
  type HubServiceExecutionLine,
} from '../../api/hubFinancialApi';

export type MarkExecutionModalProps = {
  open: boolean;
  item: HubFinanceDayBoardItem | null;
  onClose: () => void;
  onDone: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
};

export const MarkExecutionModal: React.FC<MarkExecutionModalProps> = ({
  open,
  item,
  onClose,
  onDone,
  showError,
  showSuccess,
}) => {
  const clinicId = getStoredClinicId();
  const { myStaffMember, staffList, loading: staffLoading } = useMyStaffMember();
  const [lines, setLines] = useState<HubServiceExecutionLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [staffId, setStaffId] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const staffOptions: HubComboboxOption[] = useMemo(
    () =>
      staffList
        .filter((s) => s.active !== false)
        .map((s) => ({
          value: s.id,
          label: s.full_name || s.display_name || s.id,
        })),
    [staffList],
  );

  useEffect(() => {
    if (!open || !item || !clinicId) {
      setLines([]);
      setSelectedIds(new Set());
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const res = await hubFinancialApi.getServiceExecutionLines(
          clinicId,
          item.origin_type,
          item.origin_id,
        );
        if (cancelled) return;
        const next = res.lines ?? [];
        setLines(next);
        setSelectedIds(
          new Set(next.filter((l) => l.commission_requires_executor).map((l) => l.id)),
        );
      } catch (e) {
        if (cancelled) return;
        setLines([]);
        setLoadError((e as Error)?.message || 'Não foi possível carregar as linhas de serviço.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item, clinicId]);

  useEffect(() => {
    if (!open) return;
    if (myStaffMember?.id) setStaffId(myStaffMember.id);
  }, [open, myStaffMember?.id]);

  const pendingRequired = lines.filter((l) => l.commission_requires_executor);
  const alreadyDone = lines.filter((l) => l.executed_by_staff_id);

  const toggleLine = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!clinicId || !item) return;
    if (selectedIds.size === 0) {
      showError('Selecione ao menos um serviço para marcar.');
      return;
    }
    if (!staffId) {
      showError('Selecione o profissional que executou o serviço.');
      return;
    }
    setSaving(true);
    try {
      for (const lineId of selectedIds) {
        await hubFinancialApi.patchAppointmentServiceLine(lineId, {
          clinic_id: clinicId,
          executed: true,
          executed_by_staff_id: staffId,
        });
      }
      showSuccess(
        selectedIds.size === 1
          ? 'Execução marcada.'
          : `${selectedIds.size} execuções marcadas.`,
      );
      onDone();
      onClose();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao marcar execução.');
    } finally {
      setSaving(false);
    }
  };

  const subtitle = item
    ? [item.pet?.name, item.guardian?.full_name].filter(Boolean).join(' · ') || undefined
    : undefined;

  return (
    <HubSidePanel
      open={open && Boolean(item)}
      onClose={onClose}
      title="Marcar execução"
      titleIcon={<CheckCircle2 size={20} strokeWidth={1.75} aria-hidden />}
      subtitle={subtitle}
      contentKey={item ? `${item.origin_type}:${item.origin_id}` : 'closed'}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => void handleSave()}
            disabled={saving || loading || Boolean(loadError) || selectedIds.size === 0}
          >
            {saving ? 'Salvando…' : 'Confirmar execução'}
          </button>
        </div>
      }
    >
      {loading || staffLoading ? (
        <HubLoading variant="block" label="Carregando serviços…" />
      ) : loadError ? (
        <div className="hub-clientes__muted" role="alert">
          {loadError}
        </div>
      ) : lines.length === 0 ? (
        <div className="hub-clientes__muted">
          Nenhuma linha de serviço encontrada para este atendimento.
        </div>
      ) : (
        <>
          {pendingRequired.length === 0 ? (
            <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 12 }}>
              {alreadyDone.length === lines.length
                ? 'Todas as linhas já têm execução marcada.'
                : 'Nenhuma linha exige executor para comissão agora. Você ainda pode marcar execução para registro operacional.'}
            </p>
          ) : null}

          <label className="hub-clientes__label" style={{ display: 'block', marginBottom: 8 }}>
            Profissional executor
          </label>
          <HubSearchableCombobox
            id="mark-execution-staff"
            value={staffId}
            options={staffOptions}
            onChange={setStaffId}
            placeholder="Selecione o profissional"
            disabled={saving}
            ariaLabel="Profissional executor"
          />

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lines.map((line) => {
              const done = Boolean(line.executed_by_staff_id);
              const selectable = !done;
              return (
                <label
                  key={line.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    opacity: done ? 0.65 : 1,
                    cursor: selectable ? 'pointer' : 'default',
                  }}
                >
                  <HubCheckbox
                    checked={done || selectedIds.has(line.id)}
                    onChange={() => {
                      if (selectable) toggleLine(line.id);
                    }}
                    disabled={done || saving}
                    ariaLabel={line.name}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{line.name}</span>
                    {line.commission_requires_executor ? (
                      <span className="hub-clientes__pill" style={{ marginLeft: 8 }}>
                        Exige para comissão
                      </span>
                    ) : null}
                    {done ? (
                      <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                        Já executado
                      </div>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </HubSidePanel>
  );
};

export default MarkExecutionModal;
