import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubLoading } from '../../components/HubLoading';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import {
  hubFinancialApi,
  type HubServiceExecutionLine,
} from '../../api/hubFinancialApi';

/** Alvo mínimo para marcar execução (day board, agenda, comanda ou painel). */
export type MarkExecutionTarget = {
  origin_type: string;
  origin_id: string;
  pet?: { name?: string } | null;
  guardian?: { full_name?: string } | null;
};

export type MarkExecutionSavedResult = {
  staffId: string;
  staffLabel: string;
  lineCount: number;
};

export type MarkExecutionFormProps = {
  open: boolean;
  item: MarkExecutionTarget | null;
  onDone: (result?: MarkExecutionSavedResult) => void;
  onCancel?: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** Prefixo de ids de formulário (evitar colisão com o modal). */
  idPrefix?: string;
  /** compact = embutido no painel de conferência. */
  variant?: 'panel' | 'compact';
  /**
   * Se true (padrão no compact), após salvar mantém o formulário com
   * confirmação visual em vez de só disparar onDone e sumir.
   */
  keepOpenAfterSave?: boolean;
};

/**
 * Formulário de marcar execução (linhas + profissional).
 * Usado no MarkExecutionModal e embutido no CaixaConferencePanel.
 */
export const MarkExecutionForm: React.FC<MarkExecutionFormProps> = ({
  open,
  item,
  onDone,
  onCancel,
  showError,
  showSuccess,
  idPrefix = 'mark-execution',
  variant = 'panel',
  keepOpenAfterSave,
}) => {
  const clinicId = getStoredClinicId();
  const { myStaffMember, staffList, loading: staffLoading } = useMyStaffMember();
  const [lines, setLines] = useState<HubServiceExecutionLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [staffId, setStaffId] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<MarkExecutionSavedResult | null>(null);

  const retainAfterSave = keepOpenAfterSave ?? variant === 'compact';

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

  const reloadLines = async () => {
    if (!clinicId || !item) return;
    const res = await hubFinancialApi.getServiceExecutionLines(
      clinicId,
      item.origin_type,
      item.origin_id,
    );
    const next = res.lines ?? [];
    setLines(next);
    setSelectedIds(new Set(next.filter((l) => l.commission_requires_executor && !l.executed_by_staff_id).map((l) => l.id)));
  };

  useEffect(() => {
    if (!open || !item || !clinicId) {
      setLines([]);
      setSelectedIds(new Set());
      setLoadError(null);
      setSavedResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSavedResult(null);
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

  const pendingRequired = lines.filter((l) => l.commission_requires_executor && !l.executed_by_staff_id);
  const alreadyDone = lines.filter((l) => l.executed_by_staff_id);
  const allDone = lines.length > 0 && alreadyDone.length === lines.length;

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
    const staffLabel =
      staffOptions.find((o) => o.value === staffId)?.label || staffId;
    setSaving(true);
    try {
      for (const lineId of selectedIds) {
        await hubFinancialApi.patchAppointmentServiceLine(lineId, {
          clinic_id: clinicId,
          executed: true,
          executed_by_staff_id: staffId,
        });
      }
      const result: MarkExecutionSavedResult = {
        staffId,
        staffLabel,
        lineCount: selectedIds.size,
      };
      showSuccess(
        selectedIds.size === 1
          ? 'Execução marcada.'
          : `${selectedIds.size} execuções marcadas.`,
      );
      if (retainAfterSave) {
        await reloadLines();
        setSavedResult(result);
        onDone(result);
      } else {
        onDone(result);
      }
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao marcar execução.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || staffLoading) {
    return <HubLoading variant="block" label="Carregando serviços…" />;
  }
  if (loadError) {
    return (
      <div className="hub-clientes__muted" role="alert">
        {loadError}
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="hub-clientes__muted">
        Nenhuma linha de serviço encontrada para este atendimento.
      </div>
    );
  }

  const pad = variant === 'compact' ? 12 : 0;

  return (
    <div
      style={
        variant === 'compact'
          ? {
              marginTop: 10,
              padding: pad,
              borderRadius: 10,
              border: '1px solid var(--hub-border, #e5e7eb)',
              background: 'var(--hub-surface-muted, #f9fafb)',
            }
          : undefined
      }
    >
      {savedResult || allDone ? (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: 13,
            lineHeight: 1.4,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <CheckCircle2 size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
          <div>
            <div style={{ fontWeight: 600 }}>
              {savedResult
                ? `Execução salva · ${savedResult.staffLabel}`
                : 'Execução já registrada'}
            </div>
            <div style={{ opacity: 0.9, marginTop: 2 }}>
              {savedResult
                ? `${savedResult.lineCount} serviço(s) marcado(s).`
                : `${alreadyDone.length} linha(s) com executor.`}
            </div>
          </div>
        </div>
      ) : null}

      {pendingRequired.length === 0 && !savedResult ? (
        <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}>
          {allDone
            ? 'Todas as linhas já têm execução marcada.'
            : 'Nenhuma linha exige executor para comissão agora. Você ainda pode marcar execução para registro operacional.'}
        </p>
      ) : null}

      {!allDone ? (
        <>
          <label className="hub-clientes__label" style={{ display: 'block', marginBottom: 8 }}>
            Profissional executor
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-staff`}
            value={staffId}
            options={staffOptions}
            onChange={setStaffId}
            placeholder="Selecione o profissional"
            disabled={saving}
            ariaLabel="Profissional executor"
          />
        </>
      ) : null}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                opacity: done ? 0.75 : 1,
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
                  <div className="hub-clientes__muted" style={{ fontSize: 12, color: '#065f46' }}>
                    ✓ Já executado
                  </div>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'flex-end',
          marginTop: 14,
        }}
      >
        {onCancel ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={onCancel}
            disabled={saving}
          >
            {savedResult || allDone ? 'Fechar' : 'Cancelar'}
          </button>
        ) : null}
        {!allDone ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            onClick={() => void handleSave()}
            disabled={saving || selectedIds.size === 0}
          >
            {saving ? 'Salvando…' : savedResult ? 'Salvar mais' : 'Confirmar execução'}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default MarkExecutionForm;
