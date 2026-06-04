import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vet, CompletedDemand } from '../services/vetsApi';
import { vetsApi } from '../services/vetsApi';
import { messagesApi } from '../services/messagesApi';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../AuthContext';
import { getUserRole } from '../utils/authHelpers';
import VerificationBadge from './VerificationBadge';
import DemandHistoryTimeline from './DemandHistoryTimeline';
import { colors } from '../styles/colors';
import { MessageCircle, Calendar, MapPin, Stethoscope, Award, Star, UserPlus, RotateCcw } from 'lucide-react';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';

interface VetProfileClinicViewProps {
  vet: Vet;
  clinicId?: string;
}

const VetProfileClinicView: React.FC<VetProfileClinicViewProps> = ({ vet, clinicId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const [completedDemands, setCompletedDemands] = useState<CompletedDemand[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasCollaborated, setHasCollaborated] = useState(false);
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Verificar se já colaborou com esta clínica
  useEffect(() => {
    if (clinicId && completedDemands.length > 0) {
      const collaborated = completedDemands.some(
        demand => demand.clinicName && completedDemands.length > 0
      );
      setHasCollaborated(collaborated);
    }
  }, [clinicId, completedDemands]);

  // Carregar histórico de demandas
  const loadHistory = useCallback(async () => {
    if (!vet.id) return;
    try {
      setLoadingHistory(true);
      const { completedDemands: demands } = await vetsApi.getCompletedDemands(vet.id, clinicId);
      setCompletedDemands(demands);
      setHasCollaborated(demands.length > 0);
    } catch (error: any) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [vet.id, clinicId]);

  // Carregar nomes das especialidades
  const loadSpecialties = useCallback(async () => {
    if (!vet.specialties || vet.specialties.length === 0) return;
    try {
      const { specialties } = await specialtiesApi.getAll();
      const map = new Map<string, string>();
      specialties.forEach((spec: Specialty) => {
        map.set(spec.id, spec.name);
      });
      setSpecialtiesMap(map);
    } catch (error) {
      console.error('Erro ao carregar especialidades:', error);
    }
  }, [vet.specialties]);

  useEffect(() => {
    loadHistory();
    loadSpecialties();
  }, [loadHistory, loadSpecialties]);

  const handleSendMessage = async () => {
    if (!user?.id || !vet.id) {
      showError('Erro ao identificar usuário ou veterinário');
      return;
    }

    try {
      const result = await messagesApi.createConversation({
        participant1_id: user.id,
        participant1_type: 'clinic',
        participant2_id: vet.id,
        participant2_type: 'vet',
      });

      navigate(`/messages?conversation=${result.conversation.id}`);
    } catch (error: any) {
      showError('Erro ao criar conversa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const handleInviteToDemand = () => {
    navigate('/clinic-demands?action=create');
  };

  const getSpecialtyName = (spec: string): string => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(spec)) {
      return specialtiesMap.get(spec) || spec;
    }
    return spec;
  };

  // Extrair cidade/UF do endereço (formato simples)
  const getLocationFromAddress = (address?: string): string => {
    if (!address) return 'Não informado';
    // Tentar extrair cidade e estado do endereço
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
    return address;
  };

  const isVerified = vet.status === 'active';

  return (
    <div style={styles.twoColumnContainer}>
      {/* Lado Esquerdo Fixo */}
      <aside style={styles.leftSidebar}>
        {/* Foto de Perfil */}
        <div style={styles.photoSection}>
          {vet.photo_url ? (
            <img src={vet.photo_url} alt={vet.name} style={styles.photoImage} />
          ) : (
            <div style={styles.photoPlaceholder}>
              <Stethoscope size={48} color="#9ca3af" />
            </div>
          )}
        </div>

        {/* Nome e CRMV */}
        <div style={styles.profileHeader}>
          <h2 style={styles.profileName}>{vet.name}</h2>
          <p style={styles.crmv}>CRMV: {vet.crmv || 'Não informado'}</p>
          {isVerified && (
            <div style={{ marginTop: '8px' }}>
              <VerificationBadge />
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={styles.actionsSection}>
          {hasCollaborated ? (
            <button onClick={handleInviteToDemand} style={styles.primaryButton}>
              <RotateCcw size={18} />
              <span>Recontratar</span>
            </button>
          ) : (
            <button onClick={handleInviteToDemand} style={styles.primaryButton}>
              <UserPlus size={18} />
              <span>Convidar para Demanda</span>
            </button>
          )}
          <button onClick={handleSendMessage} style={styles.secondaryButton}>
            <MessageCircle size={18} />
            <span>Enviar Mensagem</span>
          </button>
        </div>
      </aside>

      {/* Lado Direito Scrollável */}
      <main style={styles.rightContent}>
        {/* Informações Profissionais */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Informações Profissionais</h2>
          
          {/* Especialidades */}
          {vet.specialties && vet.specialties.length > 0 && (
            <div style={styles.infoGroup}>
              <label style={styles.label}>
                <Stethoscope size={16} style={{ marginRight: '8px' }} />
                Especialidades
              </label>
              <div style={styles.tagContainer}>
                {vet.specialties.map((spec) => (
                  <span key={spec} style={styles.tag}>
                    {getSpecialtyName(spec)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experiência */}
          {vet.experience && (
            <div style={styles.infoGroup}>
              <label style={styles.label}>
                <Award size={16} style={{ marginRight: '8px' }} />
                Experiência
              </label>
              <p style={styles.value}>{vet.experience}</p>
            </div>
          )}

          {/* Região de Atendimento */}
          {vet.address && (
            <div style={styles.infoGroup}>
              <label style={styles.label}>
                <MapPin size={16} style={{ marginRight: '8px' }} />
                Região de Atendimento
              </label>
              <p style={styles.value}>{getLocationFromAddress(vet.address)}</p>
            </div>
          )}

          {/* Biografia */}
          {vet.bio && (
            <div style={styles.infoGroup}>
              <label style={styles.label}>Biografia</label>
              <p style={styles.value}>{vet.bio}</p>
            </div>
          )}
        </div>

        {/* Certificações */}
        {vet.certificates && vet.certificates.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Certificações</h2>
            <div style={styles.tagContainer}>
              {vet.certificates.map((cert, index) => (
                <span key={index} style={styles.certTag}>
                  <Award size={14} style={{ marginRight: '6px' }} />
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Avaliações (placeholder - quando sistema implementado) */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Avaliações</h2>
          <div style={styles.ratingSection}>
            <div style={styles.ratingDisplay}>
              <Star size={24} color="#fbbf24" fill="#fbbf24" />
              <span style={styles.ratingValue}>4.8</span>
              <span style={styles.ratingCount}>(12 avaliações)</span>
            </div>
            <p style={styles.ratingNote}>Sistema de avaliações em desenvolvimento</p>
          </div>
        </div>

        {/* Histórico de Demandas */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Histórico de Trabalhos</h2>
          {loadingHistory ? (
            <p style={styles.loadingText}>Carregando histórico...</p>
          ) : (
            <DemandHistoryTimeline
              items={completedDemands}
              limit={3}
              showMore={showFullHistory}
              onShowMore={() => setShowFullHistory(true)}
            />
          )}
        </div>
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  twoColumnContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    padding: '24px',
    minHeight: 'calc(100vh - 120px)',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '33%',
    minWidth: '300px',
    maxWidth: '400px',
    position: 'sticky',
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    flex: '0 0 auto',
  },
  rightContent: {
    flex: 1,
    minWidth: '400px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '32px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 120px)',
  },
  photoSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  photoImage: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '4px solid #e5e5e5',
  },
  photoPlaceholder: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid #e5e5e5',
  },
  profileHeader: {
    textAlign: 'center',
  },
  profileName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  crmv: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  actionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: 'auto',
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  section: {
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '20px',
    marginTop: 0,
  },
  infoGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  value: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    margin: 0,
    lineHeight: '1.6',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    padding: '6px 12px',
    backgroundColor: '#e5e7eb',
    color: '#262626',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
  },
  certTag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 14px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #fbbf24',
  },
  ratingSection: {
    textAlign: 'center',
    padding: '20px',
  },
  ratingDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  ratingValue: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
  },
  ratingCount: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  ratingNote: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#9ca3af',
    fontStyle: 'italic',
    margin: 0,
  },
  loadingText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    textAlign: 'center',
    padding: '20px',
  },
};

export default VetProfileClinicView;

