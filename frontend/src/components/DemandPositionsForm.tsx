import React, { useState, useEffect } from 'react';
import MultiSelect from './MultiSelect';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';

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
}

const DemandPositionsForm: React.FC<DemandPositionsFormProps> = ({ positions, onChange, category }) => {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  // Load specialties filtered by category
  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const result = await specialtiesApi.getByCategory(category);
        setSpecialties(result.specialties);
      } catch (error) {
        console.error('Error loading specialties:', error);
      }
    };
    loadSpecialties();
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
      <h3 style={styles.title}>Profissionais Necessários</h3>
      <p style={styles.subtitle}>
        Adicione as posições profissionais necessárias para esta demanda
      </p>

      {positions.map((position, index) => (
        <div key={position.id} style={styles.positionCard}>
          <div style={styles.positionHeader}>
            <h4 style={styles.positionTitle}>Profissional {index + 1}</h4>
            {positions.length > 1 && (
              <button
                type="button"
                onClick={() => removePosition(position.id)}
                style={styles.removeButton}
                title="Remover profissional"
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
                placeholder="Selecione uma ou mais especialidades..."
              />
              <small style={styles.hint}>
                Selecione todas as especialidades necessárias para este profissional
              </small>
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
                onChange={(e) =>
                  updatePosition(position.id, 'slots', parseInt(e.target.value) || 1)
                }
                style={styles.input}
                required
              />
              <small style={styles.hint}>Quantos profissionais precisa?</small>
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
              <small style={styles.hint}>Valor por profissional</small>
            </div>
          </div>

          <div style={styles.fieldFull}>
            <label style={styles.label}>Descrição Adicional (opcional)</label>
            <textarea
              value={position.description || ''}
              onChange={(e) => updatePosition(position.id, 'description', e.target.value)}
              style={styles.textarea}
              placeholder="Ex: Experiência mínima de 2 anos, disponibilidade para plantão..."
              rows={3}
            />
          </div>
        </div>
      ))}

      <button type="button" onClick={addPosition} style={styles.addButton}>
        ➕ Adicionar Outro Profissional
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
            <span style={styles.summaryValue}>{totalSlots}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Investimento Total:</span>
            <span style={styles.summaryValueHighlight}>
              R$ {totalPayment.toFixed(2)}
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
    color: '#7c3aed',
    border: '2px dashed #7c3aed',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '8px',
  },
  summary: {
    marginTop: '24px',
    backgroundColor: '#ffffff',
    border: '2px solid #7c3aed',
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
    color: '#7c3aed',
  },
};

export default DemandPositionsForm;

