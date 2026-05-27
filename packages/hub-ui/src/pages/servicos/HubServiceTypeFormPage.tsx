import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Layers, ListChecks, Receipt } from 'lucide-react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { hubServiceGroupsApi, type HubServiceGroupRow } from '../../api/hubServiceGroupsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { ServicePricingMatrixEditor } from '../../components/ServicePricingMatrixEditor';
import { useAlert } from '../../components/AlertProvider';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import {
  computeReferenceFromMatrix,
  supportsPricingMatrixGroup,
  validatePricingMatrixClient,
} from '../../utils/hubServiceTypesPricingMatrix';
import {
  hexToSoftFill,
  normalizeServiceGroupInput,
  resolveServiceAccentColor,
  serviceGroupLabel,
  slugifyServiceNameToCode,
} from '../../utils/serviceTypeSlug';
import {
  CUSTOM_GROUP_HINT,
  DESC_MAX,
  SERVICE_NAME_MAX,
  SERVICE_GROUP_HINTS,
  applySvcGroupChange,
  changeDurationUnit,
  emptyForm,
  formatMoneyCurrencyBrl,
  formatMoneyNumberBrl,
  fromRow,
  groupComboOptionsFromGroups,
  marginOverSalePct,
  parseDurationInputToMinutes,
  parseMoneyInput,
  pricingCategoryOptionsForGroup,
  setPricingCategory,
  suggestedDuplicateServiceName,
  type FormState,
  type PricingCategoryKind,
} from './serviceTypeFormUtils';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import './servicos-page.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;
const steps = ['Informações gerais', 'Precificação', 'Revisão'] as const;

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const HubServiceTypeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const duplicateSourceId = useMemo(() => {
    const raw = searchParams.get('duplicar')?.trim();
    if (!raw || !looksLikeUuid(raw)) return null;
    return raw;
  }, [searchParams]);
  const isEdit = Boolean(id);
  const isDuplicateFlow = !isEdit && duplicateSourceId != null;
  const { showError, showSuccess } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.service_types.write');

  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [serviceGroups, setServiceGroups] = useState<HubServiceGroupRow[]>([]);
  const [editingRow, setEditingRow] = useState<HubServiceType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const needServiceList = isEdit || isDuplicateFlow;
      const [groupsRes, typesRes] = await Promise.all([
        hubServiceGroupsApi.list(clinicId, true).catch(() => ({ service_groups: [] as HubServiceGroupRow[] })),
        needServiceList ? hubServiceTypesApi.list(clinicId, true, true) : Promise.resolve({ service_types: [] as HubServiceType[] }),
      ]);
      setServiceGroups(groupsRes.service_groups || []);
      if (isEdit && id) {
        const row = (typesRes.service_types || []).find((x) => x.id === id) ?? null;
        if (!row) {
          showError('Serviço não encontrado.');
          navigate('/hub/servicos/servicos', { replace: true });
          return;
        }
        setEditingRow(row);
        setForm(fromRow(row));
      } else if (isDuplicateFlow && duplicateSourceId) {
        const row = (typesRes.service_types || []).find((x) => x.id === duplicateSourceId) ?? null;
        setEditingRow(null);
        if (!row) {
          showError('Serviço a duplicar não foi encontrado.');
          setForm(emptyForm());
        } else {
          const base = fromRow(row);
          setForm({
            ...base,
            name: suggestedDuplicateServiceName(row.name),
            code_locked: false,
          });
        }
      } else {
        setEditingRow(null);
        setForm(emptyForm());
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar serviço');
    } finally {
      setLoading(false);
    }
  }, [clinicId, id, isEdit, isDuplicateFlow, duplicateSourceId, navigate, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const groupComboOptions = useMemo(() => groupComboOptionsFromGroups(serviceGroups), [serviceGroups]);
  const groupColorBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of serviceGroups) if (g.slug && g.color) m.set(g.slug, g.color);
    return m;
  }, [serviceGroups]);
  const accent = useMemo(() => {
    const slug = (form.service_group || 'outros').trim();
    const fromGroup = groupColorBySlug.get(slug);
    return fromGroup && /^#[0-9A-Fa-f]{6}$/.test(fromGroup) ? fromGroup : resolveServiceAccentColor(null, slug);
  }, [form.service_group, groupColorBySlug]);
  const codePreview = slugifyServiceNameToCode(form.name);

  const pricingOptions = useMemo(() => pricingCategoryOptionsForGroup(form.service_group), [form.service_group]);
  const activePricingKind: PricingCategoryKind = form.pricing_mode === 'simple' ? 'simple' : (form.pricing_matrix?.kind as PricingCategoryKind) || 'simple';

  const parseDurationForPayload = (): number | null =>
    parseDurationInputToMinutes(form.default_duration_minutes, form.duration_input_unit);

  const durationSummaryLabel = useMemo(() => {
    if (!form.default_duration_minutes.trim()) return '—';
    const m = parseDurationInputToMinutes(form.default_duration_minutes, form.duration_input_unit);
    if (m == null) return 'Inválida';
    return `${m} min`;
  }, [form.default_duration_minutes, form.duration_input_unit]);

  const pricingPreview = useMemo(() => {
    if (form.pricing_mode === 'matrix' && form.pricing_matrix) {
      const err = validatePricingMatrixClient(form.service_group, form.pricing_matrix);
      if (err) return null;
      const ref = computeReferenceFromMatrix(form.pricing_matrix);
      const m = marginOverSalePct(ref.cost, ref.sale);
      const marginStr =
        m != null ? `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %` : '—';
      return `Referência: lucro ${formatMoneyCurrencyBrl(ref.sale - ref.cost)} · margem ${marginStr}`;
    }
    const cost = parseMoneyInput(form.cost_amount);
    const sale = parseMoneyInput(form.sale_amount);
    if (cost == null || sale == null) return null;
    const m = marginOverSalePct(cost, sale);
    const marginStr =
      m != null ? `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %` : '—';
    return `Lucro: ${formatMoneyCurrencyBrl(sale - cost)} · margem ${marginStr}`;
  }, [form]);

  const validateStep = (step: number): string | null => {
    if (step === 0) {
      if (!form.service_group) return 'Selecione o grupo.';
      if (!form.name.trim()) return 'Indique o nome do serviço.';
      if (form.default_duration_minutes.trim() && parseDurationForPayload() == null) {
        return 'Duração inválida: em minutos use um inteiro ≥ 1; em horas use um valor > 0 (ex.: 1,5). Ou deixe vazio.';
      }
    }
    if (step === 1) {
      if (form.pricing_mode === 'matrix' && form.pricing_matrix) {
        return validatePricingMatrixClient(form.service_group, form.pricing_matrix);
      }
      if (parseMoneyInput(form.cost_amount) == null) return 'Indique o valor de custo.';
      if (parseMoneyInput(form.sale_amount) == null) return 'Indique o valor de venda.';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(activeStep);
    if (err) {
      showError(err);
      return;
    }
    setActiveStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const buildPayload = () => {
    const dur = parseDurationForPayload();
    let costVal = parseMoneyInput(form.cost_amount);
    let saleVal = parseMoneyInput(form.sale_amount);
    let pricingMatrixPayload = null as FormState['pricing_matrix'];
    const useMatrix = supportsPricingMatrixGroup(form.service_group) && form.pricing_mode === 'matrix' && form.pricing_matrix;
    if (useMatrix && form.pricing_matrix) {
      const ref = computeReferenceFromMatrix(form.pricing_matrix);
      costVal = ref.cost;
      saleVal = ref.sale;
      pricingMatrixPayload = form.pricing_matrix;
    }
    if (costVal == null || saleVal == null) throw new Error('Valores de custo e venda são obrigatórios.');
    return {
      clinic_id: clinicId!,
      name: form.name.trim(),
      service_group: form.service_group,
      cost_amount: costVal,
      sale_amount: saleVal,
      pricing_matrix: pricingMatrixPayload,
      default_duration_minutes: dur,
      description: form.description.trim() || null,
      allow_scheduling: form.allow_scheduling,
      internal_notes: form.internal_notes.trim() || null,
    };
  };

  const handleSave = async () => {
    const err = validateStep(0) || validateStep(1);
    if (err) {
      showError(err);
      return;
    }
    if (!clinicId || !canWrite) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit && id) {
        await hubServiceTypesApi.update(id, { ...payload, code_locked: form.code_locked });
        showSuccess('Serviço atualizado');
      } else {
        await hubServiceTypesApi.create(payload);
        showSuccess('Serviço criado');
      }
      navigate('/hub/servicos/servicos');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) return <Navigate to="/hub/servicos/servicos" replace />;
  if (permLoading || !accessAllowed || loading) {
    return <div className="hub-clientes hub-servicos-page hub-pets-page" style={{ padding: 24 }}>Carregando…</div>;
  }
  if (!canWrite) return <Navigate to="/hub/servicos/servicos" replace />;

  return (
    <div className="hub-clientes hub-servicos-page hub-pets-page pet-wizard hub-service-type-form-page">
      <div className="pet-wizard__stepper">
        {steps.map((label, idx) => (
          <button
            key={label}
            type="button"
            className={`pet-wizard__step ${activeStep === idx ? 'pet-wizard__step--active' : ''}`}
            onClick={() => setActiveStep(idx)}
          >
            <span className="pet-wizard__step-index">{idx + 1}</span>
            <span className="pet-wizard__step-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="pet-wizard__middle">
        <div className="pet-wizard__grid">
          <main className="pet-wizard__main">
            <section className="pet-wizard__step-card">
              <div className="pet-wizard__block-head">
                <span className="pet-wizard__block-head-icon pet-wizard__block-head-icon--brand" aria-hidden>
                  {activeStep === 0 ? <Layers size={22} /> : activeStep === 1 ? <Receipt size={22} /> : <ListChecks size={22} />}
                </span>
                <div>
                  <h2 className="pet-wizard__block-title">
                    {isEdit ? 'Editar serviço' : isDuplicateFlow ? 'Duplicar serviço' : 'Novo serviço'}
                  </h2>
                  <p className="pet-wizard__block-sub">
                    {isDuplicateFlow && activeStep === 0
                      ? 'Valores copiados do serviço original — altere o nome e o que precisar antes de salvar.'
                      : steps[activeStep]}
                  </p>
                </div>
              </div>

              {activeStep === 0 ? (
                <div className="pet-wizard__fields">
                  <div>
                    <label className="pet-wizard__label">Grupo *</label>
                    <HubSearchableCombobox
                      id="service-type-group"
                      className="pet-wizard__combobox"
                      options={groupComboOptions}
                      value={form.service_group}
                      onChange={(raw) => setForm((f) => applySvcGroupChange(f, normalizeServiceGroupInput(raw)))}
                      placeholder="Selecionar grupo"
                      searchPlaceholder="Buscar grupo…"
                      clearable={false}
                      allowCreate
                      createEntityLabel="grupo"
                    />
                    <p className="hub-servicos__margin-info">{SERVICE_GROUP_HINTS[form.service_group] ?? CUSTOM_GROUP_HINT}</p>
                  </div>
                  <div>
                    <label className="pet-wizard__label">Nome do serviço *</label>
                    <input
                      className="pet-wizard__input"
                      maxLength={SERVICE_NAME_MAX}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="pet-wizard__label">Código</label>
                    <div className="hub-servicos__code-box">{isEdit && editingRow ? editingRow.code : codePreview || '…'}</div>
                  </div>
                  <div className="pet-wizard__field--full hub-service-type-form-page__duration-block">
                    <div className="hub-service-type-form-page__duration-head">
                      <label className="pet-wizard__label" htmlFor="svc-duration-value" style={{ marginBottom: 0 }}>
                        Duração padrão (opcional)
                      </label>
                      <div className="hub-servicos__seg" role="group" aria-label="Unidade da duração">
                        <button
                          type="button"
                          className={form.duration_input_unit === 'min' ? 'hub-servicos__seg--active' : ''}
                          onClick={() => setForm((f) => changeDurationUnit(f, 'min'))}
                        >
                          Minutos
                        </button>
                        <button
                          type="button"
                          className={form.duration_input_unit === 'h' ? 'hub-servicos__seg--active' : ''}
                          onClick={() => setForm((f) => changeDurationUnit(f, 'h'))}
                        >
                          Horas
                        </button>
                      </div>
                    </div>
                    <input
                      id="svc-duration-value"
                      className="pet-wizard__input"
                      type={form.duration_input_unit === 'h' ? 'text' : 'number'}
                      min={form.duration_input_unit === 'min' ? 1 : undefined}
                      step={form.duration_input_unit === 'min' ? 1 : undefined}
                      inputMode={form.duration_input_unit === 'h' ? 'decimal' : 'numeric'}
                      value={form.default_duration_minutes}
                      onChange={(e) => setForm((f) => ({ ...f, default_duration_minutes: e.target.value }))}
                      placeholder={form.duration_input_unit === 'h' ? 'Ex.: 1 ou 1,5' : 'Ex.: 60'}
                    />
                    <p className="hub-servicos__margin-info" style={{ marginTop: 6 }}>
                      Na agenda o valor é guardado sempre em <strong>minutos inteiros</strong> (as horas são convertidas ao gravar).
                    </p>
                  </div>
                  <div className="pet-wizard__field--full">
                    <span className="pet-wizard__label">Permite agendamento?</span>
                    <div className="hub-servicos__seg" role="group">
                      <button type="button" className={form.allow_scheduling ? 'hub-servicos__seg--active' : ''} onClick={() => setForm((f) => ({ ...f, allow_scheduling: true }))}>Sim</button>
                      <button type="button" className={!form.allow_scheduling ? 'hub-servicos__seg--active' : ''} onClick={() => setForm((f) => ({ ...f, allow_scheduling: false }))}>Não</button>
                    </div>
                  </div>
                  <div className="pet-wizard__field--full">
                    <label className="pet-wizard__label">Descrição</label>
                    <textarea
                      className="pet-wizard__textarea"
                      value={form.description}
                      maxLength={DESC_MAX}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={4}
                    />
                    <div className="hub-servicos__char-count">{form.description.length}/{DESC_MAX}</div>
                  </div>
                </div>
              ) : null}

              {activeStep === 1 ? (
                <div className="pet-wizard__fields">
                  <div className="pet-wizard__field--full">
                    <span className="pet-wizard__label">Modelo de preço</span>
                    <div className="hub-servicos__seg hub-servicos__seg--wrap" role="group">
                      {pricingOptions.map((opt) => (
                        <button
                          key={opt.kind}
                          type="button"
                          className={activePricingKind === opt.kind ? 'hub-servicos__seg--active' : ''}
                          onClick={() => setForm((f) => setPricingCategory(f, opt.kind))}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.pricing_mode === 'matrix' && form.pricing_matrix ? (
                    <div className="pet-wizard__field--full">
                      <ServicePricingMatrixEditor
                        serviceGroup={form.service_group}
                        matrix={form.pricing_matrix}
                        formatMoneyNumber={formatMoneyNumberBrl}
                        parseMoney={parseMoneyInput}
                        onChange={(next) =>
                          setForm((f) => {
                            const ref = computeReferenceFromMatrix(next);
                            return { ...f, pricing_matrix: next, cost_amount: formatMoneyNumberBrl(ref.cost), sale_amount: formatMoneyNumberBrl(ref.sale) };
                          })
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="pet-wizard__label">Valor de custo *</label>
                        <input className="pet-wizard__input" value={form.cost_amount} onChange={(e) => setForm((f) => ({ ...f, cost_amount: e.target.value }))} placeholder="0,00" />
                      </div>
                      <div>
                        <label className="pet-wizard__label">Valor de venda *</label>
                        <input className="pet-wizard__input" value={form.sale_amount} onChange={(e) => setForm((f) => ({ ...f, sale_amount: e.target.value }))} placeholder="0,00" />
                      </div>
                    </>
                  )}
                  <div className="pet-wizard__field--full">
                    <p className="hub-servicos__margin-info">{pricingPreview ?? 'Preencha os valores para ver lucro e margem.'}</p>
                  </div>
                  <div className="pet-wizard__field--full">
                    <label className="pet-wizard__label">Notas internas</label>
                    <textarea className="pet-wizard__textarea" value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} />
                  </div>
                  {isEdit ? (
                    <label className="pet-wizard__field--full hub-servicos__check-row">
                      <input type="checkbox" checked={form.code_locked} onChange={(e) => setForm((f) => ({ ...f, code_locked: e.target.checked }))} />
                      Fixar código interno
                    </label>
                  ) : null}
                </div>
              ) : null}

              {activeStep === 2 ? (
                <div className="hub-servicos__review-card">
                  <CheckCircle2 size={28} color={accent} />
                  <h3>{form.name || 'Serviço sem nome'}</h3>
                  <p>{serviceGroupLabel(form.service_group)} · {form.allow_scheduling ? 'Permite agendamento' : 'Não permite agendamento'}</p>
                  <p>Duração: {durationSummaryLabel}</p>
                  <p>{form.pricing_mode === 'matrix' ? `Preço por categorias (${activePricingKind})` : 'Preço único'}</p>
                  <p>{pricingPreview ?? 'Sem prévia financeira'}</p>
                </div>
              ) : null}
            </section>
          </main>

          <aside className="pet-wizard__aside">
            <div className="pet-wizard__summary">
              <div className="hub-servicos__group-color-preview" style={{ marginTop: 0 }}>
                <span className="hub-servicos__group-color-preview-dot" style={{ backgroundColor: accent, boxShadow: `0 0 0 2px ${hexToSoftFill(accent, 0.4)}` }} />
                <p className="hub-servicos__margin-info hub-servicos__group-color-preview-text">
                  Cor do grupo: {serviceGroupLabel(form.service_group)}
                </p>
              </div>
              <h3 className="pet-wizard__summary-title">Resumo</h3>
              <ul className="pet-wizard__summary-list hub-service-type-form-page__summary-list">
                <li>
                  <span className="pet-wizard__summary-k">Grupo</span>
                  <span className="pet-wizard__summary-v">{serviceGroupLabel(form.service_group)}</span>
                </li>
                <li>
                  <span className="pet-wizard__summary-k">Nome</span>
                  <span className="pet-wizard__summary-v">{form.name.trim() || '—'}</span>
                </li>
                <li>
                  <span className="pet-wizard__summary-k">Duração</span>
                  <span className="pet-wizard__summary-v">{durationSummaryLabel}</span>
                </li>
                <li>
                  <span className="pet-wizard__summary-k">Agendamento</span>
                  <span className="pet-wizard__summary-v">
                    {form.allow_scheduling ? (
                      <span className="hub-service-type-form-page__summary-pill hub-service-type-form-page__summary-pill--yes">Sim</span>
                    ) : (
                      <span className="hub-service-type-form-page__summary-pill hub-service-type-form-page__summary-pill--no">Não</span>
                    )}
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <footer className="pet-wizard__footer">
        <button type="button" className="pet-wizard__btn pet-wizard__btn--outline" onClick={() => navigate('/hub/servicos/servicos')}>
          <ChevronLeft size={18} /> Cancelar
        </button>
        <div className="pet-wizard__footer-right">
          {activeStep > 0 ? (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--outline" onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
              <ChevronLeft size={18} /> Anterior
            </button>
          ) : null}
          {activeStep < steps.length - 1 ? (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--primary" onClick={goNext}>
              Próximo <ChevronRight size={18} />
            </button>
          ) : (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Salvando…' : 'Salvar serviço'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default HubServiceTypeFormPage;
