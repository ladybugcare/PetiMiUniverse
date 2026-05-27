import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DemandPositionsForm from './DemandPositionsForm';
import DemandReviewStep from './DemandReviewStep';
import InlineCalendar from './InlineCalendar';
import { demandsApi } from '../services/demandsApi';
import { useAlert } from '../hooks/useAlert';
import { useUnit } from '../contexts/UnitContext';
import { colors } from '../styles/colors';
import { getStoredClinicId } from '../utils/authHelpers';
import { isUnitApprovedForClinicOperations } from '../utils/unitEligibility';
import CreateDemandHero from './CreateDemandHero';
import { FileText, Briefcase, Lightbulb, ChevronRight, Save } from 'lucide-react';

const ACCENT = colors.brand.primary[500];
const PAGE_BG = '#eeeceb';
const DESC_MAX_LEN = 2000;

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';

interface DemandFormStepProps {
  category: CategoryType;
  onBack: () => void;
  onReview?: () => void;
}

interface CategoryHeaderInfo {
  title: string;
  subtitle: string;
  badge: string;
}

const getCategoryInfo = (category: CategoryType): CategoryHeaderInfo => {
  switch (category) {
    case 'vet':
      return {
        title: 'Criar demanda para veterinário',
        subtitle: 'Preencha os detalhes da vaga para receber candidaturas de veterinários qualificados.',
        badge: 'Veterinário',
      };
    case 'freelancer':
      return {
        title: 'Criar demanda para freelancer',
        subtitle: 'Preencha os detalhes da vaga para receber candidaturas de freelancers qualificados.',
        badge: 'Freelancer',
      };
    case 'clinic':
      return {
        title: 'Criar demanda para clínica parceira',
        subtitle: 'Preencha os detalhes da demanda para receber propostas de clínicas parceiras.',
        badge: 'Clínica parceira',
      };
    case 'other':
      return {
        title: 'Criar demanda para outros profissionais',
        subtitle: 'Preencha os detalhes da vaga para receber candidaturas de profissionais especializados.',
        badge: 'Outros profissionais',
      };
  }
};

const STEPPER_STEPS = [
  { id: 1, label: 'Informações gerais' },
  { id: 2, label: 'Posições e vagas' },
  { id: 3, label: 'Requisitos e preferências' },
  { id: 4, label: 'Resumo e publicação' },
] as const;

const stepperStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '8px 4px',
    marginBottom: '28px',
    padding: '0 4px',
  },
  stepWrap: {
    flex: '1 1 120px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    position: 'relative',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'Inter, sans-serif',
    zIndex: 1,
  },
  label: {
    marginTop: '10px',
    fontSize: '11px',
    lineHeight: 1.25,
    fontFamily: 'Inter, sans-serif',
    maxWidth: '112px',
  },
};

function DemandFormStepper({ activeStep }: { activeStep: number }) {
  return (
    <div style={stepperStyles.row} role="list" aria-label="Etapas da demanda">
      {STEPPER_STEPS.map((step) => {
        const active = step.id === activeStep;
        const done = step.id < activeStep;
        return (
          <div key={step.id} style={stepperStyles.stepWrap}>
            <div
              style={{
                ...stepperStyles.circle,
                backgroundColor: active || done ? ACCENT : '#d6d3d1',
                color: '#fff',
                boxShadow: active ? `0 0 0 3px ${colors.brand.primary[100]}` : undefined,
              }}
            >
              {step.id}
            </div>
            <span
              style={{
                ...stepperStyles.label,
                color: active ? ACCENT : '#78716c',
                fontWeight: active ? 600 : 500,
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const DemandFormStep: React.FC<DemandFormStepProps> = ({ category, onBack, onReview }) => {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();
  const { units: allUnits, selectedUnit, loading: unitsLoading } = useUnit();

  const units = useMemo(
    () => allUnits.filter((u) => isUnitApprovedForClinicOperations(u.status)),
    [allUnits]
  );
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'form' | 'review'>('form');

  const getInitialUnitId = (availableUnits: typeof units, currentSelectedUnit: typeof selectedUnit) => {
    if (currentSelectedUnit) return currentSelectedUnit.id;
    const mainUnit = availableUnits.find((u) => u.is_main);
    if (mainUnit) return mainUnit.id;
    if (availableUnits.length > 0) return availableUnits[0].id;
    return '';
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    demand_date: '',
    start_time: '09:00',
    end_time: '17:00',
    isOvernight: false,
    selectedUnitId: '',
  });

  const [positions, setPositions] = useState<
    Array<{
      id: string;
      specialties: string[];
      slots: number;
      payment: number;
      description?: string;
    }>
  >([
    {
      id: crypto.randomUUID(),
      specialties: [],
      slots: 1,
      payment: 0,
    },
  ]);

  const categoryInfo = getCategoryInfo(category);

  useEffect(() => {
    if (!unitsLoading && units.length > 0) {
      setFormData((prev) => {
        const currentUnitId = prev.selectedUnitId;
        const unitExists = units.some((u) => u.id === currentUnitId);
        if (!currentUnitId || !unitExists) {
          const newUnitId = getInitialUnitId(units, selectedUnit);
          if (newUnitId) {
            return { ...prev, selectedUnitId: newUnitId };
          }
        }
        return prev;
      });
    }
  }, [units, selectedUnit, unitsLoading]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    let value: string | boolean =
      target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    if (typeof value === 'string' && target.name === 'description' && value.length > DESC_MAX_LEN) {
      value = value.slice(0, DESC_MAX_LEN);
    }
    setFormData({
      ...formData,
      [target.name]: value,
    });
  };

  const validateDate = (dateString: string): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date >= today;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.title ||
      !formData.description ||
      !formData.demand_date ||
      !formData.start_time ||
      !formData.end_time
    ) {
      showWarning('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!validateDate(formData.demand_date)) {
      showWarning('A data não pode ser no passado.');
      return;
    }

    if (!formData.isOvernight) {
      if (formData.end_time <= formData.start_time) {
        showWarning('O horário final deve ser posterior ao horário inicial.');
        return;
      }
    }

    const invalidPosition = positions.find(
      (p) => !p.specialties || p.specialties.length === 0 || p.slots < 1 || p.payment < 0
    );
    if (invalidPosition) {
      showWarning(
        'Por favor, preencha corretamente todas as posições profissionais (incluindo pelo menos uma especialidade).'
      );
      return;
    }

    if (units.length > 1 && !formData.selectedUnitId) {
      showWarning('Por favor, selecione a unidade que abrirá esta demanda.');
      return;
    }

    if (onReview) {
      onReview();
    } else {
      setCurrentStep('review');
    }
  };

  const saveDraft = () => {
    try {
      const key = `demand_draft_${category}_${getStoredClinicId() || 'anon'}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          formData,
          positions,
          savedAt: new Date().toISOString(),
        })
      );
      showSuccess('Rascunho guardado neste dispositivo.');
    } catch {
      showError('Não foi possível salvar o rascunho.');
    }
  };

  const handleReviewSubmit = async () => {
    try {
      setLoading(true);

      const clinicId = getStoredClinicId();
      if (!clinicId) {
        showError('Não foi possível identificar a clínica. Faça login novamente.');
        return;
      }

      const averagePayment =
        positions.length > 0 ? positions.reduce((sum, p) => sum + p.payment, 0) / positions.length : 0;

      await demandsApi.createV2({
        clinic_id: clinicId,
        unit_id: formData.selectedUnitId || undefined,
        category,
        title: formData.title,
        description: formData.description,
        demand_date: formData.demand_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        is_overnight: formData.isOvernight,
        payment: averagePayment,
        positions: positions.map((p) => ({
          slots: p.slots,
          specialties: p.specialties,
          payment: p.payment,
        })),
      });

      showSuccess('Demanda criada com sucesso!');
      navigate('/clinic-dashboard');
    } catch (error: unknown) {
      console.error('Error creating demand:', error);
      const errorMessage = error instanceof Error ? error.message : 'Tente novamente.';
      showError('Erro ao criar demanda: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackFromReview = () => {
    setCurrentStep('form');
  };

  if (currentStep === 'review') {
    const selectedUnitRow = units.find((u) => u.id === formData.selectedUnitId);
    const unitName = selectedUnitRow
      ? `${selectedUnitRow.name}${selectedUnitRow.nickname ? ` (${selectedUnitRow.nickname})` : ''}`
      : undefined;

    return (
      <DemandReviewStep
        formData={formData}
        positions={positions}
        category={category}
        unitName={unitName}
        onBack={handleBackFromReview}
        onSubmit={handleReviewSubmit}
      />
    );
  }

  if (!unitsLoading && units.length === 0) {
    return (
      <div style={styles.pageOuter}>
        <CreateDemandHero
          contained
          category={category}
          title={categoryInfo.title}
          subtitle={categoryInfo.subtitle}
          badge={categoryInfo.badge.toUpperCase()}
        />
        <div style={styles.pageInner}>
          <div style={styles.panelCard}>
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: '18px', color: colors.text, marginBottom: '16px' }}>
                Você não possui unidades aprovadas para criar demandas.
              </p>
              <p style={{ fontSize: '14px', color: colors.darkGray, marginBottom: '24px' }}>
                Apenas unidades aprovadas pelo administrador podem criar demandas.
                {allUnits.some((u) => u.status === 'pending_review') && (
                  <span> Você tem unidades aguardando aprovação.</span>
                )}
              </p>
              <button
                onClick={onBack}
                style={{
                  padding: '12px 24px',
                  backgroundColor: ACCENT,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                }}
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const soleUnit = units.length === 1 ? units[0] : null;

  return (
    <div style={styles.pageOuter}>
      <CreateDemandHero
        contained
        category={category}
        title={categoryInfo.title}
        subtitle={categoryInfo.subtitle}
        badge={categoryInfo.badge.toUpperCase()}
      />

      <div style={styles.pageInner}>
        <DemandFormStepper activeStep={1} />

        <form onSubmit={handleFormSubmit} style={styles.formOuter}>
          <div style={styles.panelsGrid}>
            <section style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <div style={styles.panelIconWrap}>
                  <FileText size={18} color={ACCENT} strokeWidth={2} aria-hidden />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.panelTitle}>Informações gerais</div>
                  <div style={styles.panelSubtitle}>Dados básicos sobre a sua demanda.</div>
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  Título da demanda <span style={{ color: ACCENT }}>*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ex: Veterinário para cirurgia ortopédica"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <div style={styles.labelRow}>
                  <label style={styles.label}>
                    Descrição da demanda <span style={{ color: ACCENT }}>*</span>
                  </label>
                  <span style={styles.charCount}>
                    {formData.description.length}/{DESC_MAX_LEN}
                  </span>
                </div>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Descreva as atividades, requisitos e o que espera do profissional. Esta descrição será visível para os candidatos."
                  style={styles.textarea}
                  maxLength={DESC_MAX_LEN}
                  required
                />
              </div>

              {!unitsLoading && units.length > 1 && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    Unidade <span style={{ color: ACCENT }}>*</span>
                  </label>
                  <select
                    name="selectedUnitId"
                    value={formData.selectedUnitId}
                    onChange={handleChange}
                    style={styles.select}
                    required
                  >
                    <option value="">Selecione uma unidade</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.is_main && '⭐ '}
                        {unit.name}
                        {unit.nickname && ` (${unit.nickname})`}
                      </option>
                    ))}
                  </select>
                  <small style={styles.hint}>Selecione qual unidade abrirá esta demanda.</small>
                </div>
              )}

              {!unitsLoading && soleUnit && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Unidade</label>
                  <div style={styles.readOnlyUnit}>
                    {soleUnit.is_main && '⭐ '}
                    {soleUnit.name}
                    {soleUnit.nickname && ` (${soleUnit.nickname})`}
                  </div>
                </div>
              )}

              <div style={styles.dateTimeStack}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    Data da demanda <span style={{ color: ACCENT }}>*</span>
                  </label>
                  <InlineCalendar
                    selectedDate={formData.demand_date}
                    onChange={(date) => setFormData({ ...formData, demand_date: date })}
                    minDate={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div style={styles.timeRow}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>
                      Horário inicial <span style={{ color: ACCENT }}>*</span>
                    </label>
                    <input
                      type="time"
                      name="start_time"
                      value={formData.start_time}
                      onChange={handleChange}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>
                      Horário final <span style={{ color: ACCENT }}>*</span>
                    </label>
                    <input
                      type="time"
                      name="end_time"
                      value={formData.end_time}
                      onChange={handleChange}
                      style={styles.input}
                      required
                    />
                  </div>
                </div>

                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      name="isOvernight"
                      checked={formData.isOvernight}
                      onChange={handleChange}
                      style={styles.checkbox}
                    />
                    <span style={styles.checkboxText}>Demanda noturna</span>
                  </label>
                  <small style={styles.hint}>
                    Marque se a demanda começa num dia e termina no dia seguinte.
                  </small>
                </div>
              </div>

              <div style={styles.tipBox} role="note">
                <Lightbulb size={20} color="#c2410c" style={{ flexShrink: 0 }} aria-hidden />
                <p style={styles.tipText}>
                  Seja específico na descrição: tipo de atos clínicos, software ou equipamento, e o
                  que torna a oportunidade clara para quem se candidata.
                </p>
              </div>
            </section>

            <section style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <div style={styles.panelIconWrap}>
                  <Briefcase size={18} color={ACCENT} strokeWidth={2} aria-hidden />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.panelTitle}>Posições e vagas</div>
                  <div style={styles.panelSubtitle}>Defina as posições profissionais necessárias.</div>
                </div>
              </div>

              <DemandPositionsForm
                embedded
                positions={positions}
                onChange={setPositions}
                category={category}
              />
            </section>
          </div>

          <div style={styles.footerBar}>
            <button type="button" onClick={saveDraft} style={styles.draftButton}>
              <Save size={16} strokeWidth={2} aria-hidden />
              Salvar como rascunho
            </button>
            <div style={styles.footerRight}>
              <button type="button" onClick={onBack} style={styles.cancelButton}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.ctaButton,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Processando…' : 'Continuar para revisão'}
                {!loading && <ChevronRight size={18} strokeWidth={2} aria-hidden />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  pageOuter: {
    minHeight: '100vh',
    backgroundColor: PAGE_BG,
    paddingBottom: '48px',
  },
  pageInner: {
    maxWidth: '1180px',
    marginLeft: 'auto',
    marginRight: 'auto',
    padding: '0 20px 32px',
  },
  formOuter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  panelsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
    alignItems: 'start',
  },
  panelCard: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '22px 22px 24px',
    boxShadow: '0 2px 14px rgba(15, 23, 42, 0.06)',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '20px',
  },
  panelIconWrap: {
    width: 40,
    height: 40,
    borderRadius: '10px',
    backgroundColor: colors.brand.primary[50],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  panelTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '17px',
    fontWeight: 600,
    color: '#292524',
    letterSpacing: '-0.01em',
  },
  panelSubtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#78716c',
    marginTop: '4px',
    lineHeight: 1.4,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '12px',
  },
  charCount: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a8a29e',
    flexShrink: 0,
  },
  readOnlyUnit: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#292524',
    padding: '12px 14px',
    backgroundColor: '#fafaf9',
    border: '1px solid #e7e5e4',
    borderRadius: '10px',
  },
  tipBox: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    padding: '14px 16px',
    borderRadius: '12px',
    backgroundColor: '#fff7ed',
    border: '1px solid #ffedd5',
    marginTop: '4px',
  },
  tipText: {
    margin: 0,
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#9a3412',
  },
  footerBar: {
    position: 'sticky',
    bottom: 0,
    zIndex: 2,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    marginTop: '20px',
    padding: '16px 18px',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    boxShadow: '0 -4px 24px rgba(15, 23, 42, 0.06)',
  },
  footerRight: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px',
    marginLeft: 'auto',
  },
  draftButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    color: '#44403c',
    backgroundColor: '#ffffff',
    border: '1px solid #d6d3d1',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '10px 14px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    color: '#57534e',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  ctaButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '12px 20px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: ACCENT,
    border: 'none',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(193, 92, 92, 0.25)',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    resize: 'vertical',
  },
  dateTimeStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '20px',
    padding: '16px',
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    border: '1px solid #e5e5e5',
  },
  timeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  hint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
    marginTop: '2px',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: colors.brand.primary[500],
  },
  checkboxText: {
    userSelect: 'none',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
};

export default DemandFormStep;
