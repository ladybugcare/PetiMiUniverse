import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MultiSelect from './MultiSelect';
import DemandPositionsForm from './DemandPositionsForm';
import InlineCalendar from './InlineCalendar';
import { demandsApi } from '../services/demandsApi';
import { demandPositionsApi } from '../services/demandPositionsApi';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import { useAlert } from '../hooks/useAlert';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';

interface DemandFormStepProps {
  category: CategoryType;
  onBack: () => void;
}

const getCategoryInfo = (category: CategoryType) => {
  switch (category) {
    case 'vet':
      return {
        title: 'Nova Demanda para Veterinário',
        subtitle: 'Descreva a vaga ou serviço veterinário necessário',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      };
    case 'freelancer':
      return {
        title: 'Nova Demanda para Freelancer',
        subtitle: 'Descreva o serviço de cuidado pet necessário',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      };
    case 'clinic':
      return {
        title: 'Nova Demanda para Clínica Parceira',
        subtitle: 'Descreva a parceria ou serviço clínico necessário',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      };
    case 'other':
      return {
        title: 'Nova Demanda Profissional',
        subtitle: 'Descreva o serviço profissional necessário',
        gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      };
  }
};

const DemandFormStep: React.FC<DemandFormStepProps> = ({ category, onBack }) => {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();
  const [loading, setLoading] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    required_specialties: [] as string[],
    demand_date: '',
    start_time: '09:00',
    end_time: '17:00',
  });

  const [positions, setPositions] = useState<Array<{
    id: string;
    specialties: string[];
    slots: number;
    payment: number;
    description?: string;
  }>>([
    {
      id: crypto.randomUUID(),
      specialties: [],
      slots: 1,
      payment: 0,
    },
  ]);

  const categoryInfo = getCategoryInfo(category);

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSpecialtiesChange = (values: string[]) => {
    setFormData({
      ...formData,
      required_specialties: values,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações básicas
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

    // Validar horários
    if (formData.end_time <= formData.start_time) {
      showWarning('O horário final deve ser posterior ao horário inicial.');
      return;
    }

    // Validar posições
    const invalidPosition = positions.find(
      (p) => !p.specialties || p.specialties.length === 0 || p.slots < 1 || p.payment < 0
    );
    if (invalidPosition) {
      showWarning('Por favor, preencha corretamente todas as posições profissionais (incluindo pelo menos uma especialidade).');
      return;
    }

    try {
      setLoading(true);

      const user = JSON.parse(localStorage.getItem('user') || '');
      const clinicId = user.id;

      // Usar nova API de demandas compostas
      await demandPositionsApi.createCompositeDemand({
        title: formData.title,
        description: formData.description,
        clinic_id: clinicId,
        demand_date: formData.demand_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        category,
        positions: positions.map((p) => ({
          specialties: p.specialties,
          slots: p.slots,
          payment: p.payment,
          description: p.description,
        })),
      });

      showSuccess('Demanda criada com sucesso!');
      navigate('/clinic-dashboard');
    } catch (error: any) {
      console.error('Error creating demand:', error);
      showError('Erro ao criar demanda: ' + (error.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Colored Header */}
      <div
        style={{
          ...styles.header,
          background: categoryInfo.gradient,
        }}
      >
        <h1 style={styles.headerTitle}>{categoryInfo.title}</h1>
        <p style={styles.headerSubtitle}>{categoryInfo.subtitle}</p>
      </div>

      {/* Form */}
      <div style={styles.formCard}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Título da Demanda *</label>
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
            <label style={styles.label}>Descrição Detalhada *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Descreva as atividades, requisitos e o que espera do profissional..."
              style={styles.textarea}
              required
            />
          </div>

          {/* Calendar and Time Selection */}
          <div style={styles.dateTimeContainer}>
            <div style={styles.calendarSection}>
              <label style={styles.label}>Data da Demanda *</label>
              <InlineCalendar
                selectedDate={formData.demand_date}
                onChange={(date) => setFormData({ ...formData, demand_date: date })}
                minDate={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div style={styles.timeSection}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Horário Inicial *</label>
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
                <label style={styles.label}>Horário Final *</label>
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
          </div>

          {/* Novo componente de posições */}
          <div style={styles.inputGroup}>
            <DemandPositionsForm 
              positions={positions} 
              onChange={setPositions}
              category={category}
            />
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={onBack}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
            >
              ← Voltar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Criando...' : 'Criar Demanda →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    padding: '40px 32px',
    borderRadius: '16px 16px 0 0',
    marginBottom: '0',
  },
  headerTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '8px',
    textShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  headerSubtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: '0 0 16px 16px',
    padding: '32px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
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
    borderRadius: '8px',
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
    borderRadius: '8px',
    resize: 'vertical',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  dateTimeContainer: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
  },
  calendarSection: {
    flex: '0 0 35%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  timeSection: {
    flex: '0 0 calc(65% - 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    paddingTop: '16px',
  },
  button: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
  },
  helperText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    marginTop: '8px',
    fontStyle: 'italic',
  },
};

export default DemandFormStep;

