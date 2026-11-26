import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Edit2, MoreVertical, Plus } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  formatPartnerClinicAddress,
  hubPartnerClinicsApi,
  type HubPartnerClinic,
} from '../../api/hubPartnerClinicsApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubBrPhoneInput } from '../../components/HubBrPhoneInput';
import { formatBrPhoneDisplay, formatBrPhoneFromApi } from '../../utils/formatBrPhone';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-partner-clinics.css';

type PartnerRowActionsProps = {
  onEdit: () => void;
  onRemove: () => void;
};

const PartnerRowActions: React.FC<PartnerRowActionsProps> = ({ onEdit, onRemove }) => {
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
    <div className="hub-pc__row-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="hub-clientes__icon-btn"
        title="Editar"
        aria-label="Editar"
        onClick={onEdit}
      >
        <Edit2 size={16} strokeWidth={2} />
      </button>
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
    </div>
  );
};

type FormState = {
  name: string;
  phone: string;
  notes: string;
  is_active: boolean;
  postal_code: string;
  state: string;
  city: string;
  district: string;
  street: string;
  street_number: string;
  complement: string;
};

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  notes: '',
  is_active: true,
  postal_code: '',
  state: '',
  city: '',
  district: '',
  street: '',
  street_number: '',
  complement: '',
});

function formFromRow(row: HubPartnerClinic): FormState {
  return {
    name: row.name,
    phone: formatBrPhoneFromApi(row.phone),
    notes: row.notes ?? '',
    is_active: row.is_active,
    postal_code: row.postal_code ?? '',
    state: row.state ?? '',
    city: row.city ?? '',
    district: row.district ?? '',
    street: row.street || row.address_line || '',
    street_number: row.street_number ?? '',
    complement: row.complement ?? '',
  };
}

const FORM_ID = 'hub-partner-clinic-form';

const HubPartnerClinicsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const { showSuccess, showError } = useAlert();

  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [rows, setRows] = useState<HubPartnerClinic[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<HubPartnerClinic | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      begin();
      try {
        const res = await hubPartnerClinicsApi.list(clinicId, { includeInactive });
        if (signal?.cancelled) return;
        setRows(res.partner_clinics ?? []);
        succeed();
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        showError((e as Error)?.message || 'Erro ao carregar clínicas parceiras');
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setPanelOpen(true);
  };

  const openEdit = (row: HubPartnerClinic) => {
    setEditing(row);
    setForm(formFromRow(row));
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    setEditing(null);
  };

  const onCepBlur = useCallback(async () => {
    const cep = form.postal_code.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await r.json()) as {
        erro?: boolean;
        localidade?: string;
        uf?: string;
        bairro?: string;
        logradouro?: string;
      };
      if (j.erro) return;
      setForm((f) => ({
        ...f,
        city: j.localidade || f.city,
        state: j.uf || f.state,
        district: j.bairro || f.district,
        street: j.logradouro || f.street,
      }));
    } catch {
      /* ignore */
    }
  }, [form.postal_code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const name = form.name.trim();
    if (!name) {
      showError('Informe o nome da clínica parceira');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clinic_id: clinicId,
        name,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        postal_code: form.postal_code.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        city: form.city.trim() || null,
        district: form.district.trim() || null,
        street: form.street.trim() || null,
        street_number: form.street_number.trim() || null,
        complement: form.complement.trim() || null,
      };
      if (editing) {
        await hubPartnerClinicsApi.patch(editing.id, payload);
        showSuccess('Clínica parceira atualizada');
      } else {
        await hubPartnerClinicsApi.create(payload);
        showSuccess('Clínica parceira cadastrada');
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

  const removeRow = async (row: HubPartnerClinic) => {
    if (!clinicId || !canWrite) return;
    if (!window.confirm(`Remover a clínica parceira “${row.name}”?`)) return;
    try {
      await hubPartnerClinicsApi.remove(row.id, clinicId);
      showSuccess('Clínica parceira removida');
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao remover');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted">Sem permissão para ver clínicas parceiras.</p>;
  }

  return (
    <div className="hub-pc">
      <div className="hub-pc__intro">
        <h2 className="hub-pc__intro-title">Clínicas parceiras</h2>
        <p className="hub-pc__intro-text">
          Cadastre locais onde você atende ou realiza exames fora da sua unidade. Os dados
          continuam na sua empresa; a parceira é só o local do atendimento.
        </p>
      </div>

      <div className="hub-pc__toolbar">
        <HubCheckbox checked={includeInactive} onChange={setIncludeInactive}>
          Mostrar inativas
        </HubCheckbox>
        {canWrite ? (
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={openCreate}>
            <Plus size={16} strokeWidth={2} />
            Nova parceira
          </button>
        ) : null}
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando clínicas…" />
      {loading && rows.length === 0 ? (
        <p className="hub-clientes__muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="hub-pc__empty">
          <Building2 size={28} strokeWidth={1.5} />
          <p>Nenhuma clínica parceira cadastrada.</p>
        </div>
      ) : (
        <div className="hub-clientes__table-wrap hub-clientes__table-wrap--desktop">
          <table className="hub-clientes__table">
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Contato</th>
                <th>Local</th>
                <th className="hub-clientes__th-status">Status</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const address = formatPartnerClinicAddress(row);
                const cityState =
                  row.city && row.state ? `${row.city} / ${row.state}` : row.city || row.state || '';
                return (
                  <tr
                    key={row.id}
                    className={!row.is_active ? 'hub-pc__row--inactive' : undefined}
                    onClick={() => {
                      if (canWrite) openEdit(row);
                    }}
                  >
                    <td>
                      <div className="hub-clientes__tutor-cell">
                        <span className="hub-clientes__avatar" aria-hidden>
                          <Building2 size={16} strokeWidth={2} />
                        </span>
                        <div>
                          <button
                            type="button"
                            className="hub-clientes__tutor-name"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canWrite) openEdit(row);
                            }}
                          >
                            {row.name}
                          </button>
                          {row.notes ? <span className="hub-pc__notes">{row.notes}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{formatBrPhoneDisplay(row.phone)}</div>
                    </td>
                    <td>
                      {cityState ? <div style={{ fontSize: 13 }}>{cityState}</div> : null}
                      {address ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {address}
                        </div>
                      ) : !cityState ? (
                        <span className="hub-clientes__muted">—</span>
                      ) : null}
                    </td>
                    <td className="hub-clientes__td-status">
                      <span
                        className={`hub-clientes__pill ${
                          row.is_active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'
                        }`}
                      >
                        {row.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="hub-clientes__td-actions">
                      {canWrite ? (
                        <div className="hub-clientes__td-actions-inner">
                          <PartnerRowActions
                            onEdit={() => openEdit(row)}
                            onRemove={() => void removeRow(row)}
                          />
                        </div>
                      ) : (
                        <span className="hub-clientes__muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <HubSidePanel
        open={panelOpen}
        onClose={closePanel}
        title={editing ? 'Editar clínica parceira' : 'Nova clínica parceira'}
        footer={
          canWrite ? (
            <button type="submit" form={FORM_ID} className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          ) : null
        }
      >
        <form id={FORM_ID} className="hub-pc__form" onSubmit={(e) => void submit(e)}>
          <label className="nam-label" htmlFor="pc-name">
            Nome *
          </label>
          <input
            id="pc-name"
            className="nam-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={200}
          />

          <label className="nam-label" htmlFor="pc-phone">
            Telefone
          </label>
          <HubBrPhoneInput
            id="pc-phone"
            className="nam-input"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          />

          <p className="hub-pc__section-title">Endereço</p>

          <div className="hub-pc__row2">
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-cep">
                CEP
              </label>
              <input
                id="pc-cep"
                className="nam-input"
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                onBlur={() => void onCepBlur()}
                placeholder="00000-000"
                maxLength={16}
              />
            </div>
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-state">
                Estado
              </label>
              <input
                id="pc-state"
                className="nam-input"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                placeholder="UF"
                maxLength={2}
              />
            </div>
          </div>

          <div className="hub-pc__row2">
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-city">
                Cidade
              </label>
              <input
                id="pc-city"
                className="nam-input"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-district">
                Bairro
              </label>
              <input
                id="pc-district"
                className="nam-input"
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                maxLength={120}
              />
            </div>
          </div>

          <label className="nam-label" htmlFor="pc-street">
            Endereço (logradouro)
          </label>
          <input
            id="pc-street"
            className="nam-input"
            value={form.street}
            onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            maxLength={200}
          />

          <div className="hub-pc__row2">
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-number">
                Número
              </label>
              <input
                id="pc-number"
                className="nam-input"
                value={form.street_number}
                onChange={(e) => setForm((f) => ({ ...f, street_number: e.target.value }))}
                maxLength={32}
              />
            </div>
            <div className="hub-pc__field">
              <label className="nam-label" htmlFor="pc-complement">
                Complemento
              </label>
              <input
                id="pc-complement"
                className="nam-input"
                value={form.complement}
                onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
                maxLength={120}
              />
            </div>
          </div>

          <label className="nam-label" htmlFor="pc-notes">
            Notas
          </label>
          <textarea
            id="pc-notes"
            className="nam-input"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            maxLength={2000}
          />

          {editing ? (
            <div className="hub-pc__inactive-toggle">
              <HubCheckbox
                checked={form.is_active}
                onChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
              >
                Clínica ativa
              </HubCheckbox>
            </div>
          ) : null}
        </form>
      </HubSidePanel>
    </div>
  );
};

export default HubPartnerClinicsPage;
