import React, { useState, useEffect } from 'react';
import MultiSelect from './MultiSelect';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import { colors } from '../styles/colors';

interface Position {
  id: string;
  specialties: string[];
  slots: number;
  payment: number;
  description?: string;
}

interface DemandPositionsFormProps {
  positions: Position[];
  onChange: (positions: Position[]) => void;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  /** Quando true, não mostra o título geral (o cartão pai define o cabeçalho). */
  embedded?: boolean;
}

const DemandPositionsForm: React.FC<DemandPositionsFormProps> = ({
  positions,
  onChange,
  category,
  embedded = false,
}) => {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(true);

  // Load specialties filtered by category (com retry leve em 429)
  useEffect(() => {
    let cancelled = false;

    const loadSpecialties = async () => {
      try {
        setLoadingSpecialties(true);
        const fetchList = async () => {
          const result = await specialtiesApi.getByCategory(category);
          return result.specialties || [];
        };

        let list: Specialty[];
        try {
          list = await fetchList();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if ((msg.includes('429') || msg.includes('Too Many')) && !cancelled) {
            await new Promise((r) => setTimeout(r, 2500));
            list = await fetchList();
          } else {
            throw e;
          }
        }

        if (!cancelled) {
          setSpecialties(list);
        }
      } catch {
        if (!cancelled) {
          setSpecialties([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSpecialties(false);
        }
      }
    };

    void loadSpecialties();
    return () => {
      cancelled = true;
    };
  }, [category]);

  const addPosition = () => {
    onChange([
      ...positions,
      {
        id: crypto.randomUUID(),
        specialties: [],
        slots: 1,
        payment: 0,
      },
    ]);
  };

  const updatePosition = (id: string, field: keyof Position, value: any) => {
    onChange(positions.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removePosition = (id: string) => {
    if (positions.length > 1) {
      onChange(positions.filter((p) => p.id !== id));
    }
  };

  const totalSlots = positions.reduce((sum, p) => sum + (p.slots || 0), 0);
  const totalPayment = positions.reduce((sum, p) => sum + p.slots * p.payment, 0);

  return (
    <div style={styles.container}>
      {!embedded && (
        <>
          <h3 style={styles.title}>Profissionais Necessários</h3>
          <p style={styles.subtitle}>
            Adicione as posições profissionais necessárias para esta demanda
          </p>
        </>
      )}

      {positions.map((position, index) => (
        <div key={position.id} style={styles.positionCard}>
          <div style={styles.positionHeader}>
            <h4 style={styles.positionTitle}>Vaga {index + 1}</h4>
            {positions.length > 1 && (
              <button
                type="button"
                onClick={() => removePosition(position.id)}
                style={styles.removeButton}
                title="Remover vaga"
              >
                🗑️ Remover
              </button>
            )}
          </div>

          <div style={styles.row}>
            <div style={styles.fieldFull}>
              <label style={styles.label}>
                Especialidades <span style={styles.required}>*</span>
              </label>
              <MultiSelect
                options={specialties.map(s => ({ value: s.name, label: s.name }))}
                selectedValues={position.specialties}
                onChange={(values) => updatePosition(position.id, 'specialties', values)}
                placeholder={loadingSpecialties ? "Carregando especialidades..." : "Selecione uma ou mais especialidades..."}
                disabled={loadingSpecialties}
              />
              {(!position.specialties || position.specialties.length === 0) && (
                <small style={styles.errorText}>
                  É necessário selecionar pelo menos uma especialidade
                </small>
              )}
              {position.specialties && position.specialties.length > 0 && (
                <small style={styles.hint}>
                  Selecione todas as especialidades necessárias para esta vaga
                </small>
              )}
            </div>
          </div>

          <div style={styles.row}>

            <div style={styles.field}>
              <label style={styles.label}>
                Quantidade de Vagas <span style={styles.required}>*</span>
              </label>
              <input
                type="number"
                min="1"
                value={position.slots}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  if (value >= 1) {
                    updatePosition(position.id, 'slots', value);
                  }
                }}
                style={{
                  ...styles.input,
                  ...(position.slots < 1 ? styles.inputError : {}),
                }}
                required
              />
              {position.slots < 1 && (
                <small style={styles.errorText}>
                  O número de vagas deve ser maior que zero
                </small>
              )}
              {position.slots >= 1 && (
                <small style={styles.hint}>Quantos profissionais precisa?</small>
              )}
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Pagamento por Vaga (R$) <span style={styles.required}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={position.payment}
                onChange={(e) =>
                  updatePosition(position.id, 'payment', parseFloat(e.target.value) || 0)
                }
                style={styles.input}
                required
              />
              <small style={styles.hint}>Valor por vaga</small>
            </div>
          </div>

          <div style={styles.fieldFull}>
            <label style={styles.label}>Descrição Adicional (opcional)</label>
            <textarea
              value={position.description || ''}
              onChange={(e) => updatePosition(position.id, 'description', e.target.value)}
              style={styles.textarea}
              placeholder="Ex: Experiência mínima de 2 anos, disponibilidade para cobrir demandas..."
              rows={3}
            />
          </div>
        </div>
      ))}

      <button type="button" onClick={addPosition} style={styles.addButton}>
        + Adicionar mais uma vaga
      </button>

      {/* Summary */}
      <div style={styles.summary}>
        <h4 style={styles.summaryTitle}>Resumo</h4>
        <div style={styles.summaryContent}>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Total de Profissionais:</span>
            <span style={styles.summaryValue}>{positions.length}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Total de Vagas:</span>
            <span style={styles.summaryValueHighlight}>{totalSlots}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Investimento Total:</span>
            <span style={styles.summaryValueHighlight}>
              R$ {totalPayment.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '24px',
  },
  positionCard: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  },
  positionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  positionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  removeButton: {
    padding: '6px 12px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
  },
  required: {
    color: '#dc2626',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  textarea: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#ffffff',
    outline: 'none',
    resize: 'vertical',
  },
  hint: {
    fontSize: '12px',
    color: '#737373',
    marginTop: '2px',
  },
  addButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `2px dashed ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '8px',
  },
  summary: {
    marginTop: '24px',
    backgroundColor: colors.brand.primary[50],
    border: `1px solid ${colors.brand.primary[200]}`,
    borderRadius: '12px',
    padding: '20px',
  },
  summaryTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
    margin: 0,
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e5e5',
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '12px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#737373',
  },
  summaryValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
  },
  summaryValueHighlight: {
    fontSize: '18px',
    fontWeight: '700',
    color: colors.brand.primary[500],
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: '12px',
    color: '#dc2626',
    marginTop: '4px',
    fontWeight: '500',
  },
};

export default DemandPositionsForm;

