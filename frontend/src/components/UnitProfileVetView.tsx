import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Unit } from '../types/units';
import { demandsApi, Demand } from '../services/demandsApi';
import { messagesApi } from '../services/messagesApi';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../AuthContext';
import VerificationBadge from './VerificationBadge';
import {
  Building2,
  MapPin,
  Phone,
  User,
  FileText,
  MessageCircle,
  CheckCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import colors from '../styles/colors';

interface UnitProfileVetViewProps {
  unit: Unit;
}

const UnitProfileVetView: React.FC<UnitProfileVetViewProps> = ({ unit }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const [openDemands, setOpenDemands] = useState<Demand[]>([]);
  const [loadingDemands, setLoadingDemands] = useState(false);

  const loadOpenDemands = useCallback(async () => {
    if (!unit.id) return;
    try {
      setLoadingDemands(true);
      const { demands } = await demandsApi.getDemandsByUnit(unit.id);
      // Filtrar apenas demandas abertas
      const open = demands.filter((d: Demand) => d.status === 'open' || d.status === 'in_progress');
      setOpenDemands(open);
    } catch (error: any) {
      console.error('Erro ao carregar demandas abertas:', error);
      showError('Erro ao carregar demandas disponíveis.');
    } finally {
      setLoadingDemands(false);
    }
  }, [unit.id, showError]);

  useEffect(() => {
    loadOpenDemands();
  }, [loadOpenDemands]);

  const handleSendMessage = async () => {
    if (!user?.id || !unit.clinic_id) {
      showError('Erro ao identificar usuário ou clínica');
      return;
    }

    try {
      const result = await messagesApi.createConversation({
        participant1_id: user.id,
        participant1_type: 'vet',
        participant2_id: unit.clinic_id,
        participant2_type: 'clinic',
      });

      navigate(`/messages?conversation=${result.conversation.id}`);
    } catch (error: any) {
      showError('Erro ao criar conversa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const formatCNPJ = (cnpj?: string) => {
    if (!cnpj) return 'N/A';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  // Ocultar telefone completo (LGPD) - mostrar apenas indicativo
  const maskPhone = (phone?: string): string => {
    if (!phone) return 'Não informado';
    // Mostrar apenas indicativo de que existe telefone, mas não o número completo
    return 'Telefone disponível (contato via mensagem)';
  };

  // Mostrar apenas cidade/estado do endereço (LGPD)
  const getLocationDisplay = (): string => {
    if (unit.city && unit.state) {
      return `${unit.city}/${unit.state}`;
    }
    return unit.address ? 'Endereço disponível' : 'Não informado';
  };

  const isApproved = unit.status === 'approved' || unit.status === 'active';

  return (
    <div style={styles.container}>
      <div style={styles.twoColumnContainer}>
        {/* Lado Esquerdo Fixo */}
        <aside style={styles.leftSidebar}>
          {/* Nome e Status */}
          <div style={styles.profileHeader}>
            <h1 style={styles.name}>
              {unit.name}
              {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
            </h1>
            {unit.nickname && <p style={styles.subtitle}>{unit.nickname}</p>}
            {isApproved && (
              <div style={{ marginTop: '8px' }}>
                <VerificationBadge />
              </div>
            )}
          </div>

          {/* Informações de Contato (Parciais) */}
          <div style={styles.contactSection}>
            <h3 style={styles.sectionTitle}>Informações de Contato</h3>
            <div style={styles.contactItem}>
              <MapPin size={16} color="#737373" />
              <span style={styles.contactText}>{getLocationDisplay()}</span>
            </div>
            <div style={styles.contactItem}>
              <Phone size={16} color="#737373" />
              <span style={styles.contactText}>{maskPhone(unit.phone)}</span>
            </div>
            {unit.technical_manager && (
              <div style={styles.contactItem}>
                <User size={16} color="#737373" />
                <span style={styles.contactText}>Responsável: {unit.technical_manager}</span>
              </div>
            )}
          </div>

          {/* Ações */}
          <div style={styles.actionsSection}>
            <button onClick={() => navigate(`/demands?unit_id=${unit.id}`)} style={styles.actionButtonPrimary}>
              <FileText size={18} />
              <span>Ver Demandas Disponíveis</span>
            </button>
            <button onClick={handleSendMessage} style={styles.actionButtonSecondary}>
              <MessageCircle size={18} />
              <span>Enviar Mensagem</span>
            </button>
          </div>
        </aside>

        {/* Lado Direito Scrollável */}
        <main style={styles.rightContent}>
          {/* Informações da Unidade */}
          <div style={styles.sectionCard}>
            <h2 style={styles.sectionTitle}>
              <Building2 size={20} /> Informações da Unidade
            </h2>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>Nome</label>
                <p style={styles.infoValue}>{unit.name}</p>
              </div>
              {unit.nickname && (
                <div style={styles.infoItem}>
                  <label style={styles.infoLabel}>Apelido</label>
                  <p style={styles.infoValue}>{unit.nickname}</p>
                </div>
              )}
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>CNPJ</label>
                <p style={styles.infoValue}>{formatCNPJ(unit.cnpj)}</p>
              </div>
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>Localização</label>
                <p style={styles.infoValue}>{getLocationDisplay()}</p>
              </div>
              {unit.technical_manager && (
                <div style={styles.infoItem}>
                  <label style={styles.infoLabel}>Responsável Técnico</label>
                  <p style={styles.infoValue}>{unit.technical_manager}</p>
                </div>
              )}
            </div>
          </div>

          {/* Demandas Disponíveis */}
          <div style={styles.sectionCard}>
            <h2 style={styles.sectionTitle}>
              <FileText size={20} /> Demandas Disponíveis
            </h2>
            {loadingDemands ? (
              <p style={styles.emptyText}>Carregando demandas...</p>
            ) : openDemands.length === 0 ? (
              <p style={styles.emptyText}>Nenhuma demanda aberta no momento.</p>
            ) : (
              <div style={styles.demandsList}>
                {openDemands.map((demand) => (
                  <div key={demand.id} style={styles.demandCard}>
                    <div style={styles.demandHeader}>
                      <h3 style={styles.demandTitle}>{demand.title}</h3>
                      <span style={styles.demandStatus}>
                        {demand.status === 'open' ? (
                          <>
                            <Clock size={14} color="#3b82f6" /> Aberta
                          </>
                        ) : (
                          <>
                            <CheckCircle size={14} color="#f59e0b" /> Em Andamento
                          </>
                        )}
                      </span>
                    </div>
                    {demand.description && (
                      <p style={styles.demandDescription}>{demand.description.substring(0, 150)}...</p>
                    )}
                    <div style={styles.demandFooter}>
                      <span style={styles.demandDate}>
                        {new Date(demand.demand_date).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                      <button
                        onClick={() => navigate(`/demands/${demand.id}`)}
                        style={styles.viewDemandButton}
                      >
                        Ver Detalhes
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    fontFamily: 'Inter, sans-serif',
  },
  twoColumnContainer: {
    display: 'flex',
    gap: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '320px',
    flexShrink: 0,
    position: 'sticky' as const,
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  profileHeader: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  name: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  subtitle: {
    fontSize: '14px',
    color: '#737373',
    margin: '0 0 8px 0',
    fontStyle: 'italic',
  },
  mainBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  contactSection: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  contactItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  contactText: {
    fontSize: '14px',
    color: '#4b5563',
  },
  actionsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  actionButtonPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  actionButtonSecondary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  rightContent: {
    flex: 1,
    minWidth: 0,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid #e5e7eb',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  infoLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '14px',
    color: '#262626',
    margin: 0,
  },
  demandsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  demandCard: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  demandHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    flex: 1,
  },
  demandStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#3b82f6',
    padding: '4px 8px',
    backgroundColor: '#dbeafe',
    borderRadius: '6px',
  },
  demandDescription: {
    fontSize: '14px',
    color: '#4b5563',
    margin: '0 0 12px 0',
    lineHeight: '1.5',
  },
  demandFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  demandDate: {
    fontSize: '12px',
    color: '#737373',
  },
  viewDemandButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  },
};

export default UnitProfileVetView;

