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
}

const DemandPositionsForm: React.FC<DemandPositionsFormProps> = ({ positions, onChange, category }) => {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(true);

  // Load specialties filtered by category
  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        setLoadingSpecialties(true);
        console.log(`[DemandPositionsForm] Carregando especialidades para categoria: ${category}`);
        
        // Buscar especialidades filtradas por categoria
        const result = await specialtiesApi.getByCategory(category);
        console.log(`[DemandPositionsForm] Resultado da API por categoria:`, result);
        console.log(`[DemandPositionsForm] Total de especialidades retornadas: ${result.specialties?.length || 0}`);
        
        // O backend já filtra por categoria e exclui freelancer
        // Usar diretamente o resultado do backend sem filtro adicional
        const specialtiesList = result.specialties || [];
        
        console.log(`[DemandPositionsForm] ${specialtiesList.length} especialidades retornadas do backend para categoria "${category}"`);
        console.log(`[DemandPositionsForm] Especialidades:`, specialtiesList.map(s => ({ name: s.name, category: s.category })));
        
        setSpecialties(specialtiesList);
      } catch (error) {
        console.error('[DemandPositionsForm] Error loading specialties:', error);
        console.error('[DemandPositionsForm] Error details:', error);
        // Em caso de erro, não buscar todas as especialidades - apenas deixar vazio
        setSpecialties([]);
      } finally {
        setLoadingSpecialties(false);
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
              placeholder="Ex: Experiência mínima de 2 anos, disponibilidade para plantão..."
              rows={3}
            />
          </div>
        </div>
      ))}

      <button type="button" onClick={addPosition} style={styles.addButton}>
        ➕ Adicionar Outra Vaga
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
    backgroundColor: '#ffffff',
    border: '2px solid colors.brand.primary[500]',
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

