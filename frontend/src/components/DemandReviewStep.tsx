import React from 'react';
import colors from '../styles/colors';
import CreateDemandHero from './CreateDemandHero';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';

interface Position {
  id: string;
  specialties: string[];
  slots: number;
  payment: number;
  description?: string;
}

interface FormData {
  title: string;
  description: string;
  demand_date: string;
  start_time: string;
  end_time: string;
  isOvernight: boolean;
  selectedUnitId: string;
}

interface DemandReviewStepProps {
  formData: FormData;
  positions: Position[];
  category: CategoryType;
  unitName?: string;
  onBack: () => void;
  onSubmit: () => void;
}

const DemandReviewStep: React.FC<DemandReviewStepProps> = ({
  formData,
  positions,
  category,
  unitName,
  onBack,
  onSubmit,
}) => {
  // Calcular totais
  const totalVacancies = positions.reduce((sum, pos) => sum + (pos.slots || 0), 0);
  const totalInvestment = positions.reduce((sum, pos) => sum + pos.slots * pos.payment, 0);

  const getReviewBadge = (cat: CategoryType): string => {
    switch (cat) {
      case 'vet':
        return 'Veterinário';
      case 'freelancer':
        return 'Freelancer';
      case 'clinic':
        return 'Clínica parceira';
      case 'other':
        return 'Outros profissionais';
    }
  };

  const reviewBadge = getReviewBadge(category);

  // Formatar data
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Não especificada';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div style={styles.pageShell}>
      <CreateDemandHero
        category={category}
        title="Revisar demanda"
        subtitle="Confira os dados abaixo antes de publicar a vaga."
        eyebrow="Revisão"
        badge={reviewBadge.toUpperCase()}
      />

      {/* Review Card */}
      <div style={styles.reviewCard}>
        {/* Título e Descrição */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Informações Gerais</h3>
          <div style={styles.infoRow}>
            <strong style={styles.infoLabel}>Título:</strong>
            <span style={styles.infoValue}>{formData.title}</span>
          </div>
          <div style={styles.infoRow}>
            <strong style={styles.infoLabel}>Descrição:</strong>
            <p style={styles.infoValue}>{formData.description}</p>
          </div>
        </div>

        {/* Unidade */}
        {unitName && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Unidade</h3>
            <div style={styles.infoRow}>
              <span style={styles.infoValue}>{unitName}</span>
            </div>
          </div>
        )}

        {/* Data e Horários */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Data e Horários</h3>
          <div style={styles.infoRow}>
            <strong style={styles.infoLabel}>Data:</strong>
            <span style={styles.infoValue}>{formatDate(formData.demand_date)}</span>
          </div>
          <div style={styles.infoRow}>
            <strong style={styles.infoLabel}>Horário:</strong>
            <span style={styles.infoValue}>
              {formData.start_time} - {formData.end_time}
            </span>
          </div>
          {formData.isOvernight && (
            <div style={styles.infoRow}>
              <span style={styles.overnightBadge}>🌙 Demanda Noturna</span>
            </div>
          )}
        </div>

        {/* Posições */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Vagas e Especialidades</h3>
          {positions.map((position, index) => (
            <div key={position.id} style={styles.positionCard}>
              <div style={styles.positionHeader}>
                <strong style={styles.positionTitle}>Vaga {index + 1}</strong>
              </div>
              <div style={styles.positionDetails}>
                <div style={styles.infoRow}>
                  <strong style={styles.infoLabel}>Especialidades:</strong>
                  <span style={styles.infoValue}>
                    {position.specialties.join(', ') || 'Nenhuma especificada'}
                  </span>
                </div>
                <div style={styles.infoRow}>
                  <strong style={styles.infoLabel}>Vagas:</strong>
                  <span style={styles.infoValue}>{position.slots}</span>
                </div>
                <div style={styles.infoRow}>
                  <strong style={styles.infoLabel}>Valor por vaga:</strong>
                  <span style={styles.infoValue}>
                    R$ {position.payment.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div style={styles.infoRow}>
                  <strong style={styles.infoLabel}>Subtotal:</strong>
                  <span style={styles.infoValue}>
                    R$ {(position.slots * position.payment).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totais */}
        <div style={styles.totalsSection}>
          <div style={styles.totalRow}>
            <strong style={styles.totalLabel}>Total de Vagas:</strong>
            <span style={styles.totalValue}>{totalVacancies}</span>
          </div>
          <div style={styles.totalRow}>
            <strong style={styles.totalLabel}>Investimento Total:</strong>
            <span style={styles.totalValue}>
              R$ {totalInvestment.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        {/* Botões */}
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
            type="button"
            onClick={onSubmit}
            style={{
              ...styles.button,
              ...styles.primaryButton,
            }}
          >
            Criar Demanda →
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  pageShell: {
    maxWidth: '1180px',
    marginLeft: 'auto',
    marginRight: 'auto',
    marginTop: '36px',
    marginBottom: '24px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 10px 40px rgba(15, 23, 42, 0.1)',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: '0 0 16px 16px',
    padding: '32px',
    boxShadow: 'none',
    borderTop: '1px solid rgba(15, 23, 42, 0.06)',
  },
  section: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '16px',
  },
  infoRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '12px',
  },
  infoLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: '4px',
  },
  infoValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.text,
    lineHeight: '1.5',
  },
  overnightBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: colors.info[100],
    color: colors.info[500],
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    marginTop: '8px',
  },
  positionCard: {
    backgroundColor: colors.lightGray,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  positionHeader: {
    marginBottom: '12px',
  },
  positionTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
  },
  positionDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  totalsSection: {
    backgroundColor: colors.brand.primary[500],
    borderRadius: '8px',
    padding: '20px',
    marginTop: '24px',
    marginBottom: '24px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  totalLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
  },
  totalValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    fontWeight: '700',
    color: colors.brand.primary[500],
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
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: colors.lightGray,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  },
};

export default DemandReviewStep;

