import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FileText, MoreVertical, Plus, Upload } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  formatTermFileSize,
  HUB_TERM_CATEGORIES,
  HUB_TERM_CATEGORY_LABELS,
  hubClinicalTermTemplatesApi,
  type HubClinicalTermTemplate,
  type HubTermCategory,
} from '../../api/hubClinicalTermTemplatesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubRefreshingBanner } from '../../components/HubLoading';
import {
  HubSearchableCombobox,
  type HubComboboxOption,
} from '../../components/HubSearchableCombobox';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubSidePanel } from '../../components/HubSidePanel';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-clinical-terms.css';

type FormState = {
  title: string;
  category: HubTermCategory;
  description: string;
  is_active: boolean;
  file: File | null;
};

const CATEGORY_OPTIONS: HubComboboxOption[] = HUB_TERM_CATEGORIES.map((c) => ({
  value: c,
  label: HUB_TERM_CATEGORY_LABELS[c],
}));

const emptyForm = (): FormState => ({
  title: '',
  category: 'outro',
  description: '',
  is_active: true,
  file: null,
});

function formFromRow(row: HubClinicalTermTemplate): FormState {
  return {
    title: row.title,
    category: row.category,
    description: row.description ?? '',
    is_active: row.is_active,
    file: null,
  };
}

const FORM_ID = 'hub-clinical-term-form';

type TermRowActionsProps = {
  row: HubClinicalTermTemplate;
  canWrite: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
};

/** Ações compactas no padrão Clientes: ícones na linha + menu «…». */
const TermRowActions: React.FC<TermRowActionsProps> = ({
  row,
  canWrite,
  onOpen,
  onDownload,
  onEdit,
  onToggleActive,
  onRemove,
}) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuFixedStyle, setMenuFixedStyle] = useState<React.CSSProperties | null>(null);

  const updateMenuPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setMenuFixedStyle({
      position: 'fixed',
      top: r.bottom + 4,
      right: window.innerWidth - r.right,
      left: 'auto',
      zIndex: 10_000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuFixedStyle(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="hub-ct__row-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="hub-clientes__icon-btn"
        title="Abrir"
        aria-label="Abrir"
        onClick={onOpen}
      >
        <Eye size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="hub-clientes__icon-btn"
        title="Baixar"
        aria-label="Baixar"
        onClick={onDownload}
      >
        <Download size={16} strokeWidth={2} />
      </button>
      {canWrite ? (
        <div className="hub-clientes__dropdown-wrap" ref={anchorRef}>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            style={{ padding: 6, minWidth: 0 }}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Mais opções"
            onClick={() => setOpen((o) => !o)}
          >
            <MoreVertical size={18} />
          </button>
          {open &&
            menuFixedStyle &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={menuRef}
                className="hub-clientes__dropdown-menu hub-clientes__dropdown-menu--portal"
                style={menuFixedStyle}
                role="menu"
              >
                <button
                  type="button"
                  className="hub-clientes__dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="hub-clientes__dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onToggleActive();
                  }}
                >
                  {row.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="hub-clientes__dropdown-item hub-clientes__dropdown-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onRemove();
                  }}
                >
                  Remover
                </button>
              </div>,
              document.body,
            )}
        </div>
      ) : null}
    </div>
  );
};

const HubClinicalTermsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [rows, setRows] = useState<HubClinicalTermTemplate[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<HubTermCategory | ''>('');
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<HubClinicalTermTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      begin();
      try {
        const res = await hubClinicalTermTemplatesApi.list(clinicId, { includeInactive });
        if (signal?.cancelled) return;
        setRows(res.term_templates ?? []);
        setSchemaHint(res.schema_ready === false ? res.migration_hint ?? null : null);
        succeed();
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        showError((e as Error)?.message || 'Erro ao carregar termos clínicos');
      } finally {
        if (!signal?.cancelled) finish();
      }
    },
    [clinicId, canRead, includeInactive, showError, begin, succeed, finish],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!categoryFilter) return rows;
    return rows.filter((r) => r.category === categoryFilter);
  }, [rows, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(true);
  };

  const openEdit = (row: HubClinicalTermTemplate) => {
    setEditing(row);
    setForm(formFromRow(row));
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    setEditing(null);
  };

  const openFile = (row: HubClinicalTermTemplate) => {
    window.open(row.storage_path, '_blank', 'noopener,noreferrer');
  };

  const downloadFile = (row: HubClinicalTermTemplate) => {
    const a = document.createElement('a');
    a.href = row.storage_path;
    a.download = row.file_name || `${row.title}.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const title = form.title.trim();
    if (!title) {
      showError('Informe o título do termo');
      return;
    }
    if (!editing && !form.file) {
      showError('Selecione um arquivo PDF');
      return;
    }
    if (form.file && form.file.type !== 'application/pdf') {
      showError('Apenas arquivos PDF são permitidos');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await hubClinicalTermTemplatesApi.patch(editing.id, {
          clinic_id: clinicId,
          title,
          category: form.category,
          description: form.description.trim() || null,
          is_active: form.is_active,
        });
        showSuccess('Termo atualizado');
      } else if (form.file) {
        await hubClinicalTermTemplatesApi.upload({
          clinicId,
          file: form.file,
          title,
          category: form.category,
          description: form.description.trim() || null,
          is_active: form.is_active,
        });
        showSuccess('Termo cadastrado');
      }
      setPanelOpen(false);
      setEditing(null);
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: HubClinicalTermTemplate) => {
    if (!clinicId || !canWrite) return;
    try {
      await hubClinicalTermTemplatesApi.patch(row.id, {
        clinic_id: clinicId,
        is_active: !row.is_active,
      });
      showSuccess(row.is_active ? 'Termo desativado' : 'Termo ativado');
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao atualizar status');
    }
  };

  const removeRow = async (row: HubClinicalTermTemplate) => {
    if (!clinicId || !canWrite) return;
    if (!window.confirm(`Remover o termo “${row.title}”?`)) return;
    try {
      await hubClinicalTermTemplatesApi.remove(row.id, clinicId);
      showSuccess('Termo removido');
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao remover');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted">Sem permissão para ver termos clínicos.</p>;
  }

  return (
    <div className="hub-ct">
      <div className="hub-ct__intro">
        <h2 className="hub-ct__intro-title">Termos clínicos</h2>
        <p className="hub-ct__intro-text">
          Biblioteca de modelos em PDF da clínica. Use estes modelos na cirurgia, internação e óbito
          (abrir/imprimir/mostrar ao tutor). A assinatura em papel fica fora do sistema; o PDF
          assinado vai em Anexos do atendimento.
        </p>
      </div>

      {schemaHint ? (
        <p className="hub-clientes__muted" role="status">
          {schemaHint}
        </p>
      ) : null}

      <div className="hub-ct__toolbar">
        <div className="hub-ct__toolbar-filters">
          <HubSearchableCombobox
            id="ct-filter-category"
            className="hub-combobox--clientes hub-ct__filter-category"
            options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORY_OPTIONS]}
            value={categoryFilter}
            onChange={(v) =>
              setCategoryFilter(
                HUB_TERM_CATEGORIES.includes(v as HubTermCategory) ? (v as HubTermCategory) : '',
              )
            }
            placeholder="Categoria"
            searchPlaceholder="Filtrar categoria…"
            clearable
            ariaLabel="Filtrar por categoria"
          />
          <HubCheckbox checked={includeInactive} onChange={setIncludeInactive}>
            Mostrar inativos
          </HubCheckbox>
        </div>
        {canWrite ? (
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={openCreate}>
            <Plus size={16} strokeWidth={2} />
            Novo termo
          </button>
        ) : null}
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando termos…" />
      {loading && rows.length === 0 ? (
        <p className="hub-clientes__muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="hub-ct__empty">
          <FileText size={28} strokeWidth={1.5} />
          <p>Nenhum termo clínico cadastrado.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="hub-ct__empty">
          <FileText size={28} strokeWidth={1.5} />
          <p>Nenhum termo nesta categoria.</p>
        </div>
      ) : (
        <div className="hub-clientes__table-wrap hub-clientes__table-wrap--desktop">
          <table className="hub-clientes__table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Categoria</th>
                <th>Arquivo</th>
                <th className="hub-clientes__th-status">Status</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={!row.is_active ? 'hub-ct__row--inactive' : undefined}
                  onClick={() => {
                    if (canWrite) openEdit(row);
                  }}
                >
                  <td>
                    <div className="hub-clientes__tutor-cell">
                      <span className="hub-clientes__avatar" aria-hidden>
                        <FileText size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <button
                          type="button"
                          className="hub-clientes__tutor-name"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canWrite) openEdit(row);
                            else openFile(row);
                          }}
                        >
                          {row.title}
                        </button>
                        {row.description ? (
                          <span className="hub-ct__desc">{row.description}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="hub-clientes__tag hub-clientes__tag--primary">
                      {HUB_TERM_CATEGORY_LABELS[row.category] ?? row.category}
                    </span>
                  </td>
                  <td>
                    <div className="hub-ct__file-cell" title={row.file_name}>
                      <span className="hub-ct__file-name-text">{row.file_name}</span>
                      <span className="hub-clientes__muted">{formatTermFileSize(row.file_size_bytes)}</span>
                    </div>
                  </td>
                  <td className="hub-clientes__td-status">
                    <span
                      className={`hub-clientes__pill ${
                        row.is_active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'
                      }`}
                    >
                      {row.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="hub-clientes__td-actions">
                    <div className="hub-clientes__td-actions-inner">
                      <TermRowActions
                        row={row}
                        canWrite={canWrite}
                        onOpen={() => openFile(row)}
                        onDownload={() => downloadFile(row)}
                        onEdit={() => openEdit(row)}
                        onToggleActive={() => void toggleActive(row)}
                        onRemove={() => void removeRow(row)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HubSidePanel
        open={panelOpen}
        onClose={closePanel}
        title={editing ? 'Editar termo clínico' : 'Novo termo clínico'}
        footer={
          canWrite ? (
            <button type="submit" form={FORM_ID} className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          ) : null
        }
      >
        <form id={FORM_ID} className="hub-ct__form" onSubmit={(e) => void submit(e)}>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="ct-title">
              Título *
            </label>
            <input
              id="ct-title"
              className="hub-clientes__input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              maxLength={200}
              placeholder="Ex.: Termo de castração"
            />
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="ct-category">
              Categoria *
            </label>
            <HubSearchableCombobox
              id="ct-category"
              className="hub-combobox--clientes"
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  category: (HUB_TERM_CATEGORIES.includes(v as HubTermCategory)
                    ? v
                    : 'outro') as HubTermCategory,
                }))
              }
              placeholder="Selecionar categoria"
              searchPlaceholder="Buscar categoria…"
              clearable={false}
              ariaLabel="Categoria do termo"
            />
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="ct-description">
              Descrição
            </label>
            <textarea
              id="ct-description"
              className="hub-clientes__textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              maxLength={2000}
              placeholder="Observações internas (opcional)"
            />
          </div>

          {!editing ? (
            <div className="hub-clientes__field">
              <span className="hub-clientes__label" id="ct-file-label">
                Arquivo PDF *
              </span>
              <input
                ref={fileInputRef}
                id="ct-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hub-ct__sr-only"
                aria-labelledby="ct-file-label"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setForm((f) => ({ ...f, file: next }));
                }}
              />
              <div className="hub-ct__file-row">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} strokeWidth={2} />
                  {form.file ? 'Trocar PDF' : 'Selecionar PDF'}
                </button>
                {form.file ? (
                  <button
                    type="button"
                    className="hub-clientes__link-btn"
                    onClick={() => {
                      setForm((f) => ({ ...f, file: null }));
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              {form.file ? (
                <p className="hub-ct__file-name">
                  <FileText size={14} strokeWidth={2} aria-hidden />
                  {form.file.name} · {formatTermFileSize(form.file.size)}
                </p>
              ) : (
                <p className="hub-ct__hint">Máximo 15 MB. Apenas PDF.</p>
              )}
            </div>
          ) : (
            <div className="hub-clientes__field">
              <span className="hub-clientes__label">Arquivo atual</span>
              <p className="hub-ct__file-name">
                <FileText size={14} strokeWidth={2} aria-hidden />
                {editing.file_name} · {formatTermFileSize(editing.file_size_bytes)}
              </p>
              <p className="hub-ct__hint">
                Para trocar o PDF, remova este termo e cadastre outro.
              </p>
            </div>
          )}

          <div className="hub-ct__active-row">
            <HubCheckbox
              id="ct-active"
              checked={form.is_active}
              onChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
            >
              Termo ativo
            </HubCheckbox>
            <p className="hub-ct__hint hub-ct__hint--inline">
              Inativos ficam ocultos na lista padrão.
            </p>
          </div>
        </form>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicalTermsPage;
