import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { demandPositionsApi } from '../services/demandPositionsApi';
import { messagesApi } from '../services/messagesApi';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../AuthContext';
import { MessageCircle, CheckCircle, XCircle, User } from 'lucide-react';
import colors from '../styles/colors';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';

interface PositionApplicationsManagerProps {
  positionId: string;
  positionDetails?: {
    specialty: string;
    total_slots: number;
    filled_slots: number;
  };
  onApplicationAccepted?: () => void;
}

const PositionApplicationsManager: React.FC<PositionApplicationsManagerProps> = ({
  positionId,
  positionDetails,
  onApplicationAccepted,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());

  // Função para verificar se uma string é um UUID
  const isUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Carregar nomes das especialidades
  const loadSpecialtiesNames = useCallback(async () => {
    try {
      const { specialties } = await specialtiesApi.getAll();
      const map = new Map<string, string>();
      specialties.forEach((spec: Specialty) => {
        map.set(spec.id, spec.name);
      });
      setSpecialtiesMap(map);
    } catch (error: any) {
      console.error('Erro ao carregar nomes das especialidades:', error);
    }
  }, []);

  // Função para obter o nome da especialidade
  const getSpecialtyName = (spec: string): string => {
    if (isUUID(spec)) {
      return specialtiesMap.get(spec) || spec;
    }
    return spec;
  };

  useEffect(() => {
    loadApplications();
    loadSpecialtiesNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionId]);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const result = await demandPositionsApi.getPositionApplications(positionId);
      setApplications(result.applications);
    } catch (error: any) {
      console.error('Error loading applications:', error);
      showError('Erro ao carregar candidaturas: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (applicationId: string) => {
    showConfirm('Tem certeza que deseja aceitar este candidato?', async () => {
      try {
        setProcessingId(applicationId);
        await demandPositionsApi.acceptApplication(applicationId);
        showSuccess('Candidato aceito com sucesso!');
        await loadApplications();
        if (onApplicationAccepted) {
          onApplicationAccepted();
        }
      } catch (error: any) {
        console.error('Error accepting application:', error);
        showError('Erro ao aceitar candidato: ' + (error.message || ''));
      } finally {
        setProcessingId(null);
      }
    });
  };

  const handleReject = async (applicationId: string) => {
    showConfirm('Tem certeza que deseja rejeitar este candidato?', async () => {
      try {
        setProcessingId(applicationId);
        await demandPositionsApi.rejectApplication(applicationId, 'Candidatura rejeitada');
        showSuccess('Candidatura rejeitada');
        await loadApplications();
      } catch (error: any) {
        console.error('Error rejecting application:', error);
        showError('Erro ao rejeitar candidato: ' + (error.message || ''));
      } finally {
        setProcessingId(null);
      }
    });
  };

  const handleSendMessage = async (vetId: string) => {
    if (!vetId || !user?.id) {
      showError('Erro ao identificar usuário ou veterinário');
      return;
    }

    try {
      // Criar ou buscar conversa existente
      const result = await messagesApi.createConversation({
        participant1_id: user.id,
        participant1_type: 'clinic',
        participant2_id: vetId,
        participant2_type: 'vet',
      });

      // Navegar para página de mensagens com a conversa selecionada
      navigate(`/messages?conversation=${result.conversation.id}`);
    } catch (error: any) {
      showError('Erro ao criar conversa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; style: React.CSSProperties } } = {
      pending: {
        label: '⏳ Pendente',
        style: { backgroundColor: '#fef3c7', color: '#92400e' },
      },
      accepted: {
        label: '✅ Aceito',
        style: { backgroundColor: '#d1fae5', color: '#065f46' },
      },
      rejected: {
        label: '❌ Rejeitado',
        style: { backgroundColor: '#fee2e2', color: '#991b1b' },
      },
      inactive_accepted_other_position: {
        label: 'ℹ️ Aceito em outra posição',
        style: { backgroundColor: colors.neutral[100], color: colors.neutral[600] },
      },
      inactive_time_conflict: {
        label: '⚠️ Conflito de horário',
        style: { backgroundColor: '#fef3c7', color: '#92400e' },
      },
      cancelled_by_vet: {
        label: '🚫 Cancelada pelo vet',
        style: { backgroundColor: colors.brand.primary[50], color: colors.brand.primary[800] },
      },
    };

    const statusInfo = statusMap[status] || {
      label: status,
      style: { backgroundColor: '#f3f4f6', color: '#6b7280' },
    };

    return <span style={{ ...styles.badge, ...statusInfo.style }}>{statusInfo.label}</span>;
  };

  const pendingApplications = applications.filter((app) => app.status === 'pending');
  const acceptedApplications = applications.filter((app) => app.status === 'accepted');
  const otherApplications = applications.filter(
    (app) => app.status !== 'pending' && app.status !== 'accepted'
  );

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p>Carregando candidaturas...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Candidatos para esta Posição</h3>
        {positionDetails && (
          <div style={styles.positionInfo}>
            <span style={styles.positionBadge}>{positionDetails.specialty}</span>
            <span style={styles.slotsInfo}>
              {positionDetails.filled_slots}/{positionDetails.total_slots} vagas preenchidas
            </span>
          </div>
        )}
      </div>

      {applications.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>👥</div>
          <p style={styles.emptyText}>Nenhuma candidatura recebida ainda</p>
        </div>
      )}

      {/* Candidaturas Pendentes */}
      {pendingApplications.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Pendentes ({pendingApplications.length})</h4>
          {pendingApplications.map((app) => (
            <div key={app.id} style={styles.applicationCard}>
              <div style={styles.vetInfo}>
                <div style={styles.vetHeader}>
                  <h4 style={styles.vetName}>{app.vets?.name}</h4>
                  {getStatusBadge(app.status)}
                </div>
                <p style={styles.vetDetail}>
                  <strong>CRMV:</strong> {app.vets?.crmv}
                </p>
                <p style={styles.vetDetail}>
                  <strong>Email:</strong> {app.vets?.email}
                </p>
                {app.vets?.specialties && app.vets.specialties.length > 0 && (
                  <div style={styles.specialtiesContainer}>
                    <strong style={styles.vetDetailLabel}>Especialidades:</strong>
                    <div style={styles.specialtiesList}>
                      {app.vets.specialties.map((spec: string, idx: number) => (
                        <span key={idx} style={styles.specialtyBadge}>
                          {getSpecialtyName(spec)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {app.vets?.experience && (
                  <p style={styles.vetDetail}>
                    <strong>Experiência:</strong> {app.vets.experience}
                  </p>
                )}
                {app.message && (
                  <div style={styles.message}>
                    <strong>Mensagem:</strong>
                    <p>{app.message}</p>
                  </div>
                )}
              </div>
              <div style={styles.actions}>
                {app.vets?.id && (
                  <>
                    <button
                      onClick={() => navigate(`/vet-profile/${app.vets.id}`)}
                      style={styles.viewProfileButton}
                      title="Ver perfil do veterinário"
                    >
                      <User size={16} color={colors.brand.primary[500]} />
                      Ver Perfil
                    </button>
                    <button
                      onClick={() => handleSendMessage(app.vets.id)}
                      style={styles.messageButton}
                      title="Enviar mensagem"
                    >
                      <MessageCircle size={16} color={colors.brand.primary[500]} />
                      Mensagem
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleAccept(app.id)}
                  style={styles.acceptButton}
                  disabled={!!processingId}
                >
                  <CheckCircle size={16} color="#ffffff" />
                  {processingId === app.id ? 'Processando...' : 'Aceitar'}
                </button>
                <button
                  onClick={() => handleReject(app.id)}
                  style={styles.rejectButton}
                  disabled={!!processingId}
                >
                  <XCircle size={16} color="#dc2626" />
                  {processingId === app.id ? 'Processando...' : 'Rejeitar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Candidaturas Aceitas */}
      {acceptedApplications.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Aceitos ({acceptedApplications.length})</h4>
          {acceptedApplications.map((app) => (
            <div key={app.id} style={styles.applicationCard}>
              <div style={styles.vetInfo}>
                <div style={styles.vetHeader}>
                  <h4 style={styles.vetName}>{app.vets?.name}</h4>
                  {getStatusBadge(app.status)}
                </div>
                <p style={styles.vetDetail}>
                  <strong>CRMV:</strong> {app.vets?.crmv}
                </p>
                <p style={styles.vetDetail}>
                  <strong>Email:</strong> {app.vets?.email}
                </p>
                {app.accepted_at && (
                  <p style={styles.vetDetail}>
                    <strong>Aceito em:</strong>{' '}
                    {new Date(app.accepted_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              {app.vets?.id && (
                <div style={styles.actions}>
                  <button
                    onClick={() => navigate(`/vet-profile/${app.vets.id}`)}
                    style={styles.viewProfileButton}
                    title="Ver perfil do veterinário"
                  >
                    <User size={16} color={colors.brand.primary[500]} />
                    Ver Perfil
                  </button>
                  <button
                    onClick={() => handleSendMessage(app.vets.id)}
                    style={styles.messageButton}
                    title="Enviar mensagem"
                  >
                    <MessageCircle size={16} color={colors.brand.primary[500]} />
                    Mensagem
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outras Candidaturas */}
      {otherApplications.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Outras ({otherApplications.length})</h4>
          {otherApplications.map((app) => (
            <div key={app.id} style={styles.applicationCard}>
              <div style={styles.vetInfo}>
                <div style={styles.vetHeader}>
                  <h4 style={styles.vetName}>{app.vets?.name}</h4>
                  {getStatusBadge(app.status)}
                </div>
                <p style={styles.vetDetail}>
                  <strong>CRMV:</strong> {app.vets?.crmv}
                </p>
                {app.inactive_reason && (
                  <p style={styles.inactiveReason}>
                    <strong>Motivo:</strong> {app.inactive_reason}
                  </p>
                )}
              </div>
              {app.vets?.id && (
                <div style={styles.actions}>
                  <button
                    onClick={() => navigate(`/vet-profile/${app.vets.id}`)}
                    style={styles.viewProfileButton}
                    title="Ver perfil do veterinário"
                  >
                    <User size={16} color={colors.brand.primary[500]} />
                    Ver Perfil
                  </button>
                  <button
                    onClick={() => handleSendMessage(app.vets.id)}
                    style={styles.messageButton}
                    title="Enviar mensagem"
                  >
                    <MessageCircle size={16} color={colors.brand.primary[500]} />
                    Mensagem
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#262626',
    marginBottom: '12px',
  },
  positionInfo: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  positionBadge: {
    padding: '4px 12px',
    backgroundColor: '#faf5ff',
    color: colors.brand.primary[500],
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
  },
  slotsInfo: {
    fontSize: '14px',
    color: '#737373',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#525252',
    marginBottom: '16px',
  },
  applicationCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '12px',
  },
  vetInfo: {
    marginBottom: '16px',
  },
  vetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  vetName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  vetDetail: {
    fontSize: '14px',
    color: '#525252',
    marginBottom: '6px',
  },
  message: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#525252',
  },
  inactiveReason: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#737373',
    fontStyle: 'italic',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  viewProfileButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  acceptButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  messageButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#737373',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #f3f4f6',
    borderTop: `3px solid ${colors.brand.primary[500]}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#737373',
  },
  specialtiesContainer: {
    marginTop: '8px',
    marginBottom: '8px',
  },
  vetDetailLabel: {
    fontSize: '14px',
    color: '#525252',
    marginBottom: '6px',
    display: 'block',
  },
  specialtiesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  specialtyBadge: {
    padding: '4px 10px',
    backgroundColor: '#f3f4f6',
    color: '#525252',
    borderRadius: '12px',
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '500',
  },
};

export default PositionApplicationsManager;

