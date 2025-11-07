import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAZILIAN_STATES } from '../utils/locationData';
import { API_BASE_URL } from '../services/api';
import colors from '../styles/colors';
import { AlertTriangle, Lightbulb, Info, Building2 } from 'lucide-react';

const CreateUnitPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    cnpj: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
    technical_manager: '',
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || '{}');
  const session = JSON.parse(localStorage.getItem('session') || '{}');
  const accessToken: string | undefined = session?.access_token;
  const clinicId = clinicUser.clinic_id || user.user_metadata?.clinic_id || user.id;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validações
    if (!formData.name || !formData.nickname || !formData.address || !formData.city || !formData.state) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    
    if (formData.nickname.length > 100) {
      setError('O apelido deve ter no máximo 100 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${API_BASE_URL}/units/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clinic_id: clinicId,
          ...formData,
        }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Erro ${response.status}: ${text || 'Resposta inválida do servidor'}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Erro ${response.status}: Erro ao criar unidade`);
      }

      // Sucesso
      alert('Unidade criada com sucesso!');
      navigate('/units');
    } catch (err: any) {
      console.error('Error creating unit:', err);
      setError(err.message || 'Erro ao criar unidade. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={32} color={colors.primary} />
              <span>Nova Unidade</span>
            </div>
          </h1>
          <p style={styles.subtitle}>
            Adicione uma nova unidade à sua clínica.
            <br />
            Preencha os dados abaixo para cadastrar.
          </p>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <span style={styles.errorIcon}>
              // @ts-ignore - Type incompatibility between React 18 and lucide-react
              <AlertTriangle size={20} />
            </span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Nome da Unidade <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Clínica VetCare Cotia"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Apelido da Unidade <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleChange}
              placeholder="Ex: Granja Viana, Centro, Unidade 1"
              style={styles.input}
              required
              maxLength={100}
            />
            <div style={styles.tooltip}>
              <span style={styles.tooltipIcon}>
                // @ts-ignore - Type incompatibility between React 18 and lucide-react
                <Lightbulb size={18} color={colors.primary} />
              </span>
              <span style={styles.tooltipText}>
                Use o bairro ou ponto de referência para diferenciar se tiver mais de uma unidade na mesma cidade
              </span>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>CNPJ (opcional)</label>
            <input
              type="text"
              name="cnpj"
              value={formData.cnpj}
              onChange={handleChange}
              placeholder="00.000.000/0000-00"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Endereço <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Rua, número, bairro"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formRow}>
            <div style={{ ...styles.formGroup, flex: 2 }}>
              <label style={styles.label}>
                Cidade <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Ex: São Paulo"
                style={styles.input}
                required
              />
            </div>

            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>
                Estado <span style={styles.required}>*</span>
              </label>
              <select
                name="state"
                value={formData.state}
                onChange={handleChange}
                style={styles.select}
                required
              >
                {BRAZILIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Telefone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="(00) 00000-0000"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Responsável Técnico</label>
            <input
              type="text"
              name="technical_manager"
              value={formData.technical_manager}
              onChange={handleChange}
              placeholder="Nome do médico veterinário responsável"
              style={styles.input}
            />
          </div>

          <div style={styles.infoBox}>
            <span style={styles.infoIcon}>
              // @ts-ignore - Type incompatibility between React 18 and lucide-react
              <Info size={20} color={colors.primary} />
            </span>
            <div>
              <strong>Sobre a nova unidade</strong>
              <ul style={styles.infoList}>
                <li>A unidade será criada e ficará ativa imediatamente</li>
                <li>Você poderá gerenciar usuários e demandas desta unidade</li>
                <li>O apelido deve ser único dentro da sua clínica</li>
              </ul>
            </div>
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate('/units')}
              style={styles.cancelButton}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Criando...' : 'Criar Unidade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '700px',
    width: '100%',
    padding: '40px',
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderLeft: '4px solid #ef4444',
    padding: '16px',
    marginBottom: '24px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: '#991b1b',
  },
  errorIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  select: {
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  tooltip: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '6px',
    padding: '8px',
    backgroundColor: '#f0f9ff',
    borderLeft: '3px solid #3b82f6',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#1e40af',
  },
  tooltipIcon: {
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  },
  tooltipText: {
    lineHeight: '1.5',
  },
  infoBox: {
    backgroundColor: '#dbeafe',
    borderLeft: '4px solid #3b82f6',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#1e40af',
    marginTop: '8px',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default CreateUnitPage;
