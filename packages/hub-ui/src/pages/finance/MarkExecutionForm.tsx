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
  lineIds: string[];
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
  /** Pré-seleciona o profissional (ex.: responsável do agendamento). */
  defaultStaffId?: string | null;
  /** Pré-seleciona só esta linha (ex.: "Alterar" numa linha específica). */
  focusLineId?: string | null;
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
  defaultStaffId,
  focusLineId,
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
    setSelectedIds(new Set(next.filter((l) => !l.executed_by_staff_id).map((l) => l.id)));
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
        const pending = next.filter((l) => !l.executed_by_staff_id);
        // Tudo já executado: pré-seleciona tudo para facilitar a troca de executor.
        if (focusLineId && next.some((l) => l.id === focusLineId)) {
          setSelectedIds(new Set([focusLineId]));
        } else {
          setSelectedIds(new Set((pending.length > 0 ? pending : next).map((l) => l.id)));
        }
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
  }, [open, item, clinicId, focusLineId]);

  const suggestedStaffId = useMemo(() => {
    const ids = new Set(
      lines.map((l) => l.suggested_staff_id).filter((id): id is string => Boolean(id)),
    );
    return ids.size === 1 ? [...ids][0]! : null;
  }, [lines]);

  useEffect(() => {
    if (!open) return;
    const isActiveStaff = (id: string | null | undefined): id is string =>
      Boolean(id) && staffList.some((s) => s.id === id && s.active !== false);
    const preferred = isActiveStaff(defaultStaffId)
      ? defaultStaffId
      : isActiveStaff(suggestedStaffId)
        ? suggestedStaffId
        : myStaffMember?.id;
    if (preferred) setStaffId(preferred);
  }, [open, myStaffMember?.id, defaultStaffId, suggestedStaffId, staffList]);

  const alreadyDone = lines.filter((l) => l.executed_by_staff_id);
  const allDone = lines.length > 0 && alreadyDone.length === lines.length;
  const staffNameById = useMemo(
    () => new Map(staffList.map((s) => [s.id, s.full_name || s.display_name || 'Profissional'] as const)),
    [staffList],
  );

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
        lineIds: [...selectedIds],
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
      {savedResult ? (
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
            <div style={{ fontWeight: 600 }}>Execução salva · {savedResult.staffLabel}</div>
            <div style={{ opacity: 0.9, marginTop: 2 }}>
              {savedResult.lineCount === 1
                ? '1 serviço marcado.'
                : `${savedResult.lineCount} serviços marcados.`}
            </div>
          </div>
        </div>
      ) : null}

      <label
        className="hub-clientes__label"
        htmlFor={`${idPrefix}-staff`}
        style={{ display: 'block', marginBottom: 6, fontSize: 13 }}
      >
        {allDone ? 'Trocar executor para' : 'Quem executou'}
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

      <div
        style={{
          marginTop: 12,
          marginBottom: 6,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--hub-text-muted, #8a7f76)',
        }}
      >
        {lines.length > 1 ? 'Serviços' : 'Serviço'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lines.map((line) => {
          const doneBy = line.executed_by_staff_id
            ? staffNameById.get(line.executed_by_staff_id) ?? 'Profissional'
            : null;
          const checked = selectedIds.has(line.id);
          return (
            <label
              key={line.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${checked ? 'var(--hub-primary, #e07a3f)' : 'var(--hub-border, #e5e7eb)'}`,
                background: 'var(--hub-surface, #fff)',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              <HubCheckbox
                checked={checked}
                onChange={() => toggleLine(line.id)}
                disabled={saving}
                ariaLabel={line.name}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{line.name}</span>
                {line.commission_requires_executor ? (
                  <span className="hub-clientes__muted" style={{ marginLeft: 6, fontSize: 11 }}>
                    · comissão
                  </span>
                ) : null}
              </span>
              {doneBy ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#047857',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <CheckCircle2 size={13} aria-hidden />
                  {doneBy}
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', whiteSpace: 'nowrap' }}>
                  Sem executor
                </span>
              )}
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
            {savedResult ? 'Fechar' : 'Cancelar'}
          </button>
        ) : null}
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
          onClick={() => void handleSave()}
          disabled={saving || selectedIds.size === 0 || !staffId}
        >
          {saving ? 'Salvando…' : allDone ? 'Salvar alteração' : 'Confirmar execução'}
        </button>
      </div>
    </div>
  );
};

export default MarkExecutionForm;
