import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import PositionApplicationsManager from '../components/PositionApplicationsManager';
import LoadingOverlay from '../components/LoadingOverlay';
import { demandsApi } from '../services/demandsApi';
import { demandPositionsApi, DemandPosition } from '../services/demandPositionsApi';
import { clinicsApi } from '../services/clinicsApi';
import { unitsApi } from '../services/unitsApi';
import { Unit } from '../types/units';
import { vetsApi } from '../services/vetsApi';
import { statisticsApi } from '../services/statisticsApi';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../AuthContext';
import { getUserRole } from '../utils/authHelpers';
import { BarChart2, ClipboardList, ArrowLeft, Clock, Calendar, MapPin, DollarSign, User, Building2, CheckCircle2, AlertCircle, XCircle, ExternalLink, Star, Shield, CreditCard, Info } from 'lucide-react';
import colors from '../styles/colors';

interface DemandDetail {
  id: string;
  title: string;
  description: string;
  clinic_id: string;
  unit_id?: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  required_specialties?: string[];
  demand_date: string;
  start_time: string;
  end_time?: string;
  duration_hours?: number;
  is_composite?: boolean;
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  payment?: number;
  created_at: string;
  updated_at: string;
}

const DemandDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { user } = useAuth();
  const [demand, setDemand] = useState<DemandDetail | null>(null);
  const [positions, setPositions] = useState<DemandPosition[]>([]);
  const [clinicName, setClinicName] = useState<string>('');
  const [clinic, setClinic] = useState<any>(null);
  const [clinicStats, setClinicStats] = useState<any>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [vetProfile, setVetProfile] = useState<any>(null);
  const [vetApplications, setVetApplications] = useState<any[]>([]);
  const [hasTimeConflict, setHasTimeConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [applyingPositionId, setApplyingPositionId] = useState<string | null>(null);
  const [userApplications, setUserApplications] = useState<Set<string>>(new Set());
  const [expandedDescription, setExpandedDescription] = useState(false);
  
  const userRole = user ? getUserRole(user) : null;
  const isVet = userRole === 'VET';

  const menuItems: MenuItem[] = [
    {
      id: 'back',
      label: 'Voltar para Demandas',
      icon: <ArrowLeft size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/demands',
    },
  ];

  useEffect(() => {
    if (id) {
      loadDemandDetails();
    } else {
      showError('ID da demanda não fornecido');
      navigate('/demands');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadDemandDetails = async () => {
    try {
      setLoading(true);
      
      // Carregar demanda e posições em paralelo
      const [demandResult, positionsResult] = await Promise.all([
        demandsApi.getById(id!),
        demandPositionsApi.getDemandWithPositions(id!).catch(() => ({ positions: [] })),
      ]);
      
      const demandData = demandResult.demand as any;
      setDemand(demandData as DemandDetail);
      setPositions(positionsResult.positions || []);

      // Carregar dados completos da clínica
      try {
        const clinicResult = await clinicsApi.getById(demandData.clinic_id);
        setClinic(clinicResult.clinic);
        setClinicName(clinicResult.clinic.name);
        
        // Carregar estatísticas da clínica
        try {
          const statsResult = await statisticsApi.getClinicStats(demandData.clinic_id);
          setClinicStats(statsResult.stats);
        } catch (e) {
          console.warn('Não foi possível carregar estatísticas da clínica:', e);
        }
      } catch (error) {
        console.error('Erro ao carregar clínica:', error);
        setClinicName('Clínica não encontrada');
      }

      // Carregar unidade se houver
      if (demandData.unit_id) {
        try {
          const unitResult = await unitsApi.getById(demandData.unit_id);
          setUnit(unitResult.unit);
        } catch (error) {
          console.error('Erro ao carregar unidade:', error);
        }
      }

      // Se for veterinário, carregar perfil e candidaturas
      if (isVet && user?.id) {
        // Carregar perfil do veterinário
        try {
          const vetResult = await vetsApi.getById(user.id);
          setVetProfile(vetResult.vet);
        } catch (e) {
          console.warn('Não foi possível carregar perfil do veterinário:', e);
        }

        // Carregar candidaturas do veterinário
        try {
          const vetAppsResult = await demandPositionsApi.getVetApplications(user.id);
          const appliedPositions = new Set<string>();
          const allApplications: any[] = [];
          
          vetAppsResult.applications.forEach((app: any) => {
            allApplications.push(app);
            const positionId = app.demand_positions?.id || app.position_id;
            if (positionId) {
              appliedPositions.add(positionId);
            }
          });
          
          setUserApplications(appliedPositions);
          setVetApplications(allApplications);
          
          // Verificar conflitos de horário
          if (demandData.demand_date && demandData.start_time && demandData.end_time) {
            const hasConflict = allApplications.some((app: any) => {
              const appDemand = app.demand_positions?.demands;
              if (!appDemand || app.status !== 'accepted') return false;
              
              if (appDemand.demand_date === demandData.demand_date) {
                const appStart = appDemand.start_time;
                const appEnd = appDemand.end_time || appDemand.start_time;
                const demandStart = demandData.start_time;
                const demandEnd = demandData.end_time || demandData.start_time;
                
                // Verificar sobreposição de horários
                return (appStart <= demandEnd && appEnd >= demandStart);
              }
              return false;
            });
            
            setHasTimeConflict(hasConflict);
          }
        } catch (e) {
          console.warn('Não foi possível carregar candidaturas do veterinário:', e);
        }
      }
    } catch (error: any) {
      console.error('Erro ao carregar detalhes da demanda:', error);
      showError('Erro ao carregar detalhes da demanda: ' + (error.message || 'Tente novamente'));
      navigate('/demands');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyClick = (positionId: string) => {
    setSelectedPositionId(positionId);
    setApplicationMessage('');
    setShowApplicationModal(true);
  };

  const handleApplyConfirm = async () => {
    if (!selectedPositionId || !user?.id) return;

    try {
      setApplyingPositionId(selectedPositionId);
      await demandPositionsApi.applyToPosition({
        position_id: selectedPositionId,
        vet_id: user.id,
        message: applicationMessage,
      });
      showSuccess('Candidatura enviada com sucesso!');
      setShowApplicationModal(false);
      setApplicationMessage('');
      setSelectedPositionId(null);
      
      // Atualizar lista de candidaturas do usuário
      setUserApplications(prev => {
        const newSet = new Set(prev);
        newSet.add(selectedPositionId);
        return newSet;
      });
      
      // Recarregar dados
      if (id) {
        await loadDemandDetails();
      }
    } catch (error: any) {
      console.error('Error applying to position:', error);
      showError('Erro ao candidatar-se: ' + (error.message || 'Tente novamente.'));
    } finally {
      setApplyingPositionId(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      open: '#22c55e',
      in_progress: '#f59e0b',
      closed: '#6b7280',
      cancelled: '#ef4444',
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      open: 'Aberta',
      in_progress: 'Em Andamento',
      closed: 'Fechada',
      cancelled: 'Cancelada',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    return timeString.substring(0, 5);
  };

  // Verificar requisitos da vaga para veterinários
  const checkRequirements = () => {
    if (!isVet || !vetProfile || !demand) return null;

    const requirements: Array<{ label: string; status: 'ok' | 'warning' | 'error'; message?: string }> = [];

    // CRMV
    requirements.push({
      label: 'CRMV ativo',
      status: vetProfile.crmv ? 'ok' : 'error',
      message: vetProfile.crmv ? undefined : 'CRMV não informado',
    });

    // Especialidades
    if (demand.required_specialties && demand.required_specialties.length > 0) {
      const vetSpecialties = vetProfile.specialties || [];
      const missingSpecialties = demand.required_specialties.filter(
        spec => !vetSpecialties.includes(spec)
      );
      
      if (missingSpecialties.length === 0) {
        requirements.push({
          label: 'Especialidades requeridas',
          status: 'ok',
        });
      } else {
        requirements.push({
          label: 'Especialidades requeridas',
          status: 'warning',
          message: `Faltam: ${missingSpecialties.join(', ')}`,
        });
      }
    }

    // Disponibilidade
    if (hasTimeConflict) {
      requirements.push({
        label: 'Disponibilidade no horário',
        status: 'error',
        message: 'Você já possui outra demanda agendada neste horário',
      });
    } else {
      requirements.push({
        label: 'Disponibilidade no horário',
        status: 'ok',
      });
    }

    return requirements;
  };

  const requirements = checkRequirements();
  const canApply = requirements ? requirements.every(r => r.status === 'ok') : true;
  const mainSpecialty = demand?.required_specialties?.[0] || 'Veterinário';
  const totalPayment = positions.length > 0 
    ? positions.reduce((sum, p) => sum + (p.individual_payment || 0), 0)
    : demand?.payment || 0;
  
  // Calcular valor líquido (assumindo 10% de taxa da plataforma)
  const platformFee = 0.1;
  const netPayment = totalPayment * (1 - platformFee);
  
  // Verificar se é demanda premium (pagamento acima da média - assumindo R$ 200 como média)
  const isPremium = totalPayment > 200;
  
  // Endereço completo da clínica
  const getFullAddress = () => {
    if (unit) {
      return `${unit.address || ''}, ${unit.city || ''}, ${unit.state || ''}`.trim().replace(/^,|,$/g, '');
    }
    if (clinic) {
      return clinic.address || '';
    }
    return '';
  };

  const getGoogleMapsUrl = () => {
    const address = getFullAddress();
    if (!address) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  if (loading) {
    return (
      <>
        <DashboardLayout pageName="Detalhes da Demanda" menuItems={menuItems}>
          <div style={styles.loadingContainer}>
            <div style={styles.spinner}></div>
            <p style={styles.loadingText}>Carregando detalhes da demanda...</p>
          </div>
        </DashboardLayout>
        <LoadingOverlay visible={true} label="Carregando..." />
      </>
    );
  }

  if (!demand) {
    return (
      <DashboardLayout pageName="Demanda não encontrada" menuItems={menuItems}>
        <div style={styles.errorContainer}>
          <h2 style={styles.errorTitle}>Demanda não encontrada</h2>
          <p style={styles.errorText}>A demanda que você está procurando não existe ou foi removida.</p>
          <button onClick={() => navigate('/demands')} style={styles.backButton}>
            <ArrowLeft size={16} />
            Voltar para Demandas
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout pageName="Detalhes da Demanda" menuItems={menuItems}>
        <div style={styles.container}>
          {/* Header */}
          <div style={styles.header}>
            <button onClick={() => navigate('/demands')} style={styles.backButton}>
              <ArrowLeft size={20} />
              Voltar
            </button>
          </div>

          {/* 1. Header Resumido da Demanda */}
          <div style={{
            ...styles.headerCard,
            borderLeft: `4px solid ${getStatusColor(demand.status)}`,
          }}>
            <div style={styles.headerCardContent}>
              <div style={styles.headerCardMain}>
                <div style={styles.headerClinicInfo}>
                  <Building2 size={24} color={colors.primary} />
                  <div>
                    <h2 style={styles.headerClinicName}>{clinicName}</h2>
                    {(unit?.city || clinic?.city) && (
                      <p style={styles.headerLocation}>
                        {unit?.city || clinic?.city}
                        {unit?.state || clinic?.state ? `, ${unit?.state || clinic?.state}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{
                  ...styles.headerStatusBadge,
                  backgroundColor: getStatusColor(demand.status),
                }}>
                  {getStatusLabel(demand.status)}
                </div>
              </div>
              
              <h1 style={styles.headerTitle}>{demand.title}</h1>
              
              <div style={styles.headerMeta}>
                <div style={styles.headerMetaItem}>
                  <DollarSign size={20} color={colors.primary} />
                  <div>
                    <span style={styles.headerMetaLabel}>Valor</span>
                    <span style={styles.headerMetaValue}>
                      {totalPayment > 0 ? `R$ ${totalPayment.toFixed(2)}` : 'A combinar'}
                    </span>
                  </div>
                </div>
                <div style={styles.headerMetaItem}>
                  <Calendar size={20} color={colors.primary} />
                  <div>
                    <span style={styles.headerMetaLabel}>Data</span>
                    <span style={styles.headerMetaValue}>{formatDate(demand.demand_date)}</span>
                  </div>
                </div>
                <div style={styles.headerMetaItem}>
                  <Clock size={20} color={colors.primary} />
                  <div>
                    <span style={styles.headerMetaLabel}>Horário</span>
                    <span style={styles.headerMetaValue}>
                      {formatTime(demand.start_time)}
                      {demand.end_time && ` - ${formatTime(demand.end_time)}`}
                    </span>
                  </div>
                </div>
                <div style={styles.headerMetaItem}>
                  <User size={20} color={colors.primary} />
                  <div>
                    <span style={styles.headerMetaLabel}>Categoria</span>
                    <span style={styles.headerMetaValue}>
                      {demand.category === 'vet' ? 'Veterinário' :
                       demand.category === 'freelancer' ? 'Freelancer' :
                       demand.category === 'clinic' ? 'Clínica' : 'Outro'}
                    </span>
                  </div>
                </div>
              </div>
              
              {isPremium && (
                <div style={styles.premiumBadge}>
                  <Star size={16} />
                  Demanda Premium
                </div>
              )}
            </div>
          </div>

          {/* 2. Descrição Expandida */}
          {demand.description && (
            <div style={styles.descriptionCard}>
              <h3 style={styles.sectionTitle}>Descrição da Demanda</h3>
              <div style={styles.descriptionContent}>
                <p style={styles.description}>
                  {expandedDescription || demand.description.length < 300
                    ? demand.description
                    : `${demand.description.substring(0, 300)}...`}
                </p>
                {demand.description.length > 300 && (
                  <button
                    onClick={() => setExpandedDescription(!expandedDescription)}
                    style={styles.readMoreButton}
                  >
                    {expandedDescription ? 'Ler menos' : 'Ler mais'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 3. Informações Completas da Clínica */}
          <div style={styles.clinicCard}>
            <div style={styles.clinicCardHeader}>
              <h2 style={styles.clinicCardTitle}>Informações da Clínica</h2>
              {clinic?.status === 'approved' && (
                <div style={styles.verifiedBadge}>
                  <Shield size={14} />
                  Clínica verificada
                </div>
              )}
            </div>
            
            <div style={styles.clinicInfoGrid}>
              <div style={styles.clinicInfoItem}>
                <Building2 size={20} style={styles.clinicInfoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Nome</strong>
                  <p style={styles.infoValue}>{clinicName}</p>
                </div>
              </div>
              
              {getFullAddress() && (
                <div style={styles.clinicInfoItem}>
                  <MapPin size={20} style={styles.clinicInfoIcon} />
                  <div>
                    <strong style={styles.infoLabel}>Endereço</strong>
                    <p style={styles.infoValue}>{getFullAddress()}</p>
                    {getGoogleMapsUrl() && (
                      <a
                        href={getGoogleMapsUrl()!}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.mapLink}
                      >
                        <ExternalLink size={14} />
                        Ver no mapa
                      </a>
                    )}
                  </div>
                </div>
              )}
              
              {clinicStats && (
                <>
                  <div style={styles.clinicInfoItem}>
                    <ClipboardList size={20} style={styles.clinicInfoIcon} />
                    <div>
                      <strong style={styles.infoLabel}>Demandas publicadas</strong>
                      <p style={styles.infoValue}>{clinicStats.totalDemands || 0}</p>
                    </div>
                  </div>
                  
                  <div style={styles.clinicInfoItem}>
                    <User size={20} style={styles.clinicInfoIcon} />
                    <div>
                      <strong style={styles.infoLabel}>Veterinários parceiros</strong>
                      <p style={styles.infoValue}>{clinicStats.totalApplications || 0}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <button
              onClick={() => navigate(`/clinic-profile/${demand.clinic_id}`)}
              style={styles.viewProfileButton}
            >
              Ver perfil da clínica
              <ExternalLink size={16} />
            </button>
          </div>

          {/* 4. Seção de Requisitos da Vaga (apenas para veterinários) */}
          {isVet && requirements && (
            <div style={styles.requirementsCard}>
              <h3 style={styles.sectionTitle}>Requisitos da Vaga</h3>
              <div style={styles.requirementsTable}>
                {requirements.map((req, idx) => (
                  <div key={idx} style={styles.requirementRow}>
                    <div style={styles.requirementLabel}>
                      {req.status === 'ok' && <CheckCircle2 size={18} color="#22c55e" />}
                      {req.status === 'warning' && <AlertCircle size={18} color="#f59e0b" />}
                      {req.status === 'error' && <XCircle size={18} color="#ef4444" />}
                      <span>{req.label}</span>
                    </div>
                    <div style={styles.requirementStatus}>
                      {req.status === 'ok' && <span style={styles.statusOk}>Atendido</span>}
                      {req.status === 'warning' && <span style={styles.statusWarning}>Não informado</span>}
                      {req.status === 'error' && <span style={styles.statusError}>Não atendido</span>}
                    </div>
                  </div>
                ))}
              </div>
              
              {requirements.some(r => r.status !== 'ok') && (
                <div style={styles.requirementWarning}>
                  <AlertCircle size={18} />
                  <div>
                    <strong>Complete seu perfil para se candidatar</strong>
                    <p>
                      {requirements.find(r => r.status === 'warning')?.message ||
                       requirements.find(r => r.status === 'error')?.message}
                    </p>
                    <button
                      onClick={() => navigate('/vet-profile')}
                      style={styles.updateProfileButton}
                    >
                      Atualizar perfil
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Informações Operacionais */}
          <div style={styles.operationalCard}>
            <h3 style={styles.sectionTitle}>Informações Operacionais</h3>
            <div style={styles.operationalGrid}>
              {demand.duration_hours && (
                <div style={styles.operationalItem}>
                  <Clock size={18} style={styles.infoIcon} />
                  <div>
                    <strong style={styles.infoLabel}>Duração estimada</strong>
                    <p style={styles.infoValue}>{demand.duration_hours}h</p>
                  </div>
                </div>
              )}
              
              <div style={styles.operationalItem}>
                <MapPin size={18} style={styles.infoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Tipo</strong>
                  <p style={styles.infoValue}>Presencial</p>
                </div>
              </div>
              
              {hasTimeConflict && (
                <div style={styles.conflictWarning}>
                  <AlertCircle size={18} color="#ef4444" />
                  <div>
                    <strong>Conflito de horário detectado</strong>
                    <p>Você já possui outra demanda agendada neste horário.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 6. Seção de Pagamento Detalhada */}
          {totalPayment > 0 && (
            <div style={styles.paymentCard}>
              <h3 style={styles.sectionTitle}>Pagamento</h3>
              <div style={styles.paymentDetails}>
                <div style={styles.paymentRow}>
                  <span style={styles.paymentLabel}>Valor total da vaga</span>
                  <span style={styles.paymentValue}>R$ {totalPayment.toFixed(2)}</span>
                </div>
                <div style={styles.paymentRow}>
                  <span style={styles.paymentLabel}>Forma de pagamento</span>
                  <span style={styles.paymentValue}>Via PetiVet</span>
                </div>
                <div style={styles.paymentRow}>
                  <span style={styles.paymentLabel}>Taxa da plataforma (10%)</span>
                  <span style={styles.paymentValue}>- R$ {(totalPayment * platformFee).toFixed(2)}</span>
                </div>
                <div style={styles.paymentDivider}></div>
                <div style={styles.paymentRow}>
                  <span style={styles.paymentLabelBold}>Valor líquido estimado</span>
                  <span style={styles.paymentValueBold}>R$ {netPayment.toFixed(2)}</span>
                </div>
                <div style={styles.paymentNote}>
                  <Info size={14} />
                  <span>Repasse previsto em até 5 dias após conclusão</span>
                </div>
              </div>
            </div>
          )}

          {/* 7. Posições / Especialidades Solicitadas */}
          {positions.length > 0 ? (
            <div style={styles.positionsSection}>
              <h3 style={styles.sectionTitle}>Posições / Especialidades Solicitadas</h3>
              <div style={styles.positionsTable}>
                <div style={styles.positionsTableHeader}>
                  <div style={styles.tableHeaderCell}>Especialidade</div>
                  <div style={styles.tableHeaderCell}>Vagas</div>
                  <div style={styles.tableHeaderCell}>Valor</div>
                  <div style={styles.tableHeaderCell}>Status</div>
                </div>
                {positions.map((position) => (
                  <div key={position.id} style={styles.positionTableRow}>
                    <div style={styles.tableCell}>
                      {position.specialties && position.specialties.length > 0
                        ? position.specialties.join(', ')
                        : position.specialty || 'Posição'}
                    </div>
                    <div style={styles.tableCell}>
                      {position.filled_slots}/{position.total_slots}
                    </div>
                    <div style={styles.tableCell}>
                      {position.individual_payment > 0
                        ? `R$ ${position.individual_payment.toFixed(2)}`
                        : 'A combinar'}
                    </div>
                    <div style={styles.tableCell}>
                      <span
                        style={{
                          ...styles.positionStatusBadge,
                          backgroundColor:
                            position.status === 'open'
                              ? '#22c55e'
                              : position.status === 'filled'
                              ? '#6b7280'
                              : '#ef4444',
                        }}
                      >
                        {position.status === 'open'
                          ? 'Aberta'
                          : position.status === 'filled'
                          ? 'Preenchida'
                          : 'Cancelada'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Cards detalhados das posições */}
              {positions.map((position) => (
                <div key={position.id} style={styles.positionCard}>
                  <div style={styles.positionHeader}>
                    <h3 style={styles.positionTitle}>
                      {position.specialties && position.specialties.length > 0
                        ? position.specialties.join(', ')
                        : position.specialty || 'Posição'}
                    </h3>
                    <div style={styles.positionMeta}>
                      <span style={styles.positionBadge}>
                        {position.filled_slots}/{position.total_slots} vagas
                      </span>
                      {position.individual_payment > 0 && (
                        <span style={styles.paymentBadge}>
                          <DollarSign size={14} />
                          R$ {position.individual_payment.toFixed(2)}
                        </span>
                      )}
                      <span
                        style={{
                          ...styles.positionStatusBadge,
                          backgroundColor:
                            position.status === 'open'
                              ? '#22c55e'
                              : position.status === 'filled'
                              ? '#6b7280'
                              : '#ef4444',
                        }}
                      >
                        {position.status === 'open'
                          ? 'Aberta'
                          : position.status === 'filled'
                          ? 'Preenchida'
                          : 'Cancelada'}
                      </span>
                    </div>
                    {position.description && (
                      <p style={styles.positionDescription}>{position.description}</p>
                    )}
                  </div>

                  {/* Applications - Apenas para clínicas, não para veterinários */}
                  {!isVet && (
                    <div style={styles.applicationsSection}>
                      <PositionApplicationsManager
                        positionId={position.id}
                        positionDetails={{
                          specialty:
                            position.specialties && position.specialties.length > 0
                              ? position.specialties.join(', ')
                              : position.specialty || 'Posição',
                          total_slots: position.total_slots,
                          filled_slots: position.filled_slots,
                        }}
                      />
                    </div>
                  )}

                  {/* Botão de Candidatura - Apenas para veterinários */}
                  {isVet && position.status === 'open' && (
                    <div style={styles.vetActionSection}>
                      {userApplications.has(position.id) ? (
                        <div style={styles.appliedBadge}>
                          ✓ Candidatura enviada
                        </div>
                      ) : (
                        <button
                          onClick={() => handleApplyClick(position.id)}
                          style={styles.applyButton}
                          disabled={!!applyingPositionId}
                        >
                          {applyingPositionId === position.id ? 'Enviando...' : 'Candidatar-se'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : demand.is_composite ? (
            <div style={styles.noPositions}>
              <p>Esta demanda composta ainda não possui posições cadastradas.</p>
            </div>
          ) : null}

          {/* 8. Resumo Final + Ação Principal */}
          {isVet && positions.some(p => p.status === 'open') && (
            <div style={styles.summaryCard}>
              <h3 style={styles.summaryTitle}>Resumo</h3>
              <div style={styles.summaryContent}>
                <div style={styles.summaryItem}>
                  <Calendar size={18} />
                  <span>{formatDate(demand.demand_date)} – {formatTime(demand.start_time)} às {demand.end_time ? formatTime(demand.end_time) : '--'}</span>
                </div>
                <div style={styles.summaryItem}>
                  <Building2 size={18} />
                  <span>{clinicName}</span>
                </div>
                <div style={styles.summaryItem}>
                  <DollarSign size={18} />
                  <span>{totalPayment > 0 ? `R$ ${totalPayment.toFixed(2)}` : 'A combinar'} (valor total)</span>
                </div>
                <div style={styles.summaryItem}>
                  <User size={18} />
                  <span>{mainSpecialty}</span>
                </div>
              </div>
              
              {positions.filter(p => p.status === 'open' && !userApplications.has(p.id)).length > 0 ? (
                <button
                  onClick={() => {
                    const firstOpenPosition = positions.find(p => p.status === 'open' && !userApplications.has(p.id));
                    if (firstOpenPosition) {
                      handleApplyClick(firstOpenPosition.id);
                    }
                  }}
                  style={{
                    ...styles.mainActionButton,
                    ...(!canApply && styles.mainActionButtonDisabled),
                  }}
                  disabled={!canApply || !!applyingPositionId}
                >
                  {applyingPositionId ? 'Enviando...' : 'Candidatar-se à Demanda'}
                </button>
              ) : (
                <div style={styles.appliedBadge}>
                  ✓ Todas as posições já foram candidatadas
                </div>
              )}
            </div>
          )}

          {/* 9. Seção de Transparência */}
          <div style={styles.transparencyCard}>
            <h3 style={styles.sectionTitle}>Transparência e Confiança</h3>
            <div style={styles.transparencyGrid}>
              {clinic?.status === 'approved' && (
                <div style={styles.transparencyItem}>
                  <Shield size={20} color="#22c55e" />
                  <div>
                    <strong>Clínica verificada</strong>
                    <p>Clínica aprovada pela plataforma</p>
                  </div>
                </div>
              )}
              
              <div style={styles.transparencyItem}>
                <CreditCard size={20} color={colors.primary} />
                <div>
                  <strong>Pagamentos via PetiVet</strong>
                  <p>Processamento seguro e garantido</p>
                </div>
              </div>
              
              <div style={styles.transparencyItem}>
                <Info size={20} color={colors.primary} />
                <div>
                  <strong>Política de cancelamento</strong>
                  <p>Cancelamentos até 24h antes não geram penalidade</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>

      {/* Modal de Candidatura */}
      {showApplicationModal && (
        <div style={styles.modalOverlay} onClick={() => {
          setShowApplicationModal(false);
          setApplicationMessage('');
          setSelectedPositionId(null);
        }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Candidatar-se à Posição</h2>
            <p style={styles.modalSubtitle}>
              Escreva uma mensagem para se destacar (opcional):
            </p>
            <textarea
              value={applicationMessage}
              onChange={(e) => setApplicationMessage(e.target.value)}
              placeholder="Ex: Tenho 5 anos de experiência em cirurgias ortopédicas..."
              style={styles.modalTextarea}
              rows={6}
            />
            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowApplicationModal(false);
                  setApplicationMessage('');
                  setSelectedPositionId(null);
                }}
                style={styles.modalCancelButton}
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyConfirm}
                style={styles.modalConfirmButton}
                disabled={!!applyingPositionId}
              >
                {applyingPositionId ? 'Enviando...' : 'Confirmar Candidatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadingOverlay visible={loading} label="Carregando..." />
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  headerRight: {
    display: 'flex',
    gap: '12px',
  },
  statusBadge: {
    padding: '8px 16px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
  },
  clinicCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  clinicCardTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  clinicInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '24px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
  },
  description: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#525252',
    lineHeight: '1.6',
    margin: 0,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },
  infoItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  infoIcon: {
    color: colors.primary,
    marginTop: '4px',
    flexShrink: 0,
  },
  infoLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    display: 'block',
    marginBottom: '4px',
  },
  infoValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#262626',
    margin: 0,
    fontWeight: '500',
  },
  specialtiesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  specialtyBadge: {
    padding: '6px 14px',
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  compositeBadge: {
    padding: '12px 16px',
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    marginTop: '16px',
  },
  positionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    marginBottom: '32px',
  },
  positionCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e5e5',
  },
  positionHeader: {
    marginBottom: '20px',
  },
  positionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
  },
  positionMeta: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  positionBadge: {
    padding: '4px 12px',
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  paymentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    backgroundColor: '#f0fdf4',
    color: '#22c55e',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  positionStatusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  positionDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: 0,
    lineHeight: '1.6',
  },
  applicationsSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e5e5',
  },
  noPositions: {
    padding: '32px',
    textAlign: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f4f6',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  errorContainer: {
    padding: '64px',
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  errorText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
    marginBottom: '24px',
  },
  vetActionSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e5e5',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  applyButton: {
    padding: '10px 24px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  appliedBadge: {
    padding: '10px 24px',
    backgroundColor: '#f0fdf4',
    color: '#22c55e',
    border: '1px solid #22c55e',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  modalTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  modalSubtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    marginBottom: '20px',
  },
  modalTextarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    resize: 'vertical',
    marginBottom: '24px',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  modalCancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalConfirmButton: {
    padding: '10px 20px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  // Novos estilos para melhorias
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  headerCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  headerCardMain: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerClinicInfo: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  headerClinicName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  headerLocation: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: '4px 0 0 0',
  },
  headerStatusBadge: {
    padding: '8px 16px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
  },
  headerTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  headerMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  headerMetaItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  headerMetaLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
    display: 'block',
  },
  headerMetaValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#262626',
    fontWeight: '600',
  },
  premiumBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#fef3c7',
    color: '#d97706',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  descriptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  descriptionContent: {
    position: 'relative',
  },
  readMoreButton: {
    marginTop: '12px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  clinicCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  verifiedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#f0fdf4',
    color: '#22c55e',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  clinicInfoItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  clinicInfoIcon: {
    color: colors.primary,
    marginTop: '4px',
    flexShrink: 0,
  },
  mapLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '8px',
    color: colors.primary,
    textDecoration: 'none',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '500',
  },
  viewProfileButton: {
    marginTop: '20px',
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
  },
  requirementsCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  requirementsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  requirementRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  requirementLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
  },
  requirementStatus: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
  },
  statusOk: {
    color: '#22c55e',
  },
  statusWarning: {
    color: '#f59e0b',
  },
  statusError: {
    color: '#ef4444',
  },
  requirementWarning: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
  },
  updateProfileButton: {
    marginTop: '12px',
    padding: '8px 16px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  operationalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  operationalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  operationalItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  conflictWarning: {
    gridColumn: '1 / -1',
    padding: '16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  paymentCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  paymentDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  paymentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
  },
  paymentLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
  },
  paymentValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    fontWeight: '500',
  },
  paymentLabelBold: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#262626',
    fontWeight: '600',
  },
  paymentValueBold: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    color: colors.primary,
    fontWeight: '700',
  },
  paymentDivider: {
    height: '1px',
    backgroundColor: '#e5e5e5',
    margin: '8px 0',
  },
  paymentNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    padding: '12px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#3b82f6',
  },
  positionsTable: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
    overflow: 'hidden',
    marginBottom: '24px',
  },
  positionsTableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e5e5',
  },
  tableHeaderCell: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    color: '#525252',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  positionTableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    gap: '16px',
    padding: '16px',
    borderBottom: '1px solid #e5e5e5',
  },
  tableCell: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    display: 'flex',
    alignItems: 'center',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    marginTop: '8px',
    border: '2px solid',
    borderColor: colors.primary,
  },
  summaryTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '20px',
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#262626',
  },
  mainActionButton: {
    width: '100%',
    padding: '16px 32px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  mainActionButtonDisabled: {
    backgroundColor: '#d1d5db',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  transparencyCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    marginBottom: '32px',
    border: '1px solid #e5e5e5',
  },
  transparencyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  transparencyItem: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
};

export default DemandDetailPage;

