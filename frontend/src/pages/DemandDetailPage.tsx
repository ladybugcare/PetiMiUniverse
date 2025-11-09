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
import { useAlert } from '../hooks/useAlert';
import { BarChart2, ClipboardList, ArrowLeft, Clock, Calendar, MapPin, DollarSign, User, Building2 } from 'lucide-react';
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
  const { showError } = useAlert();
  const [demand, setDemand] = useState<DemandDetail | null>(null);
  const [positions, setPositions] = useState<DemandPosition[]>([]);
  const [clinicName, setClinicName] = useState<string>('');
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);

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

      // Carregar nome da clínica
      try {
        const clinicResult = await clinicsApi.getById(demandData.clinic_id);
        setClinicName(clinicResult.clinic.name);
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
    } catch (error: any) {
      console.error('Erro ao carregar detalhes da demanda:', error);
      showError('Erro ao carregar detalhes da demanda: ' + (error.message || 'Tente novamente'));
      navigate('/demands');
    } finally {
      setLoading(false);
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
            <div style={styles.headerRight}>
              <span
                style={{
                  ...styles.statusBadge,
                  backgroundColor: getStatusColor(demand.status),
                }}
              >
                {getStatusLabel(demand.status)}
              </span>
            </div>
          </div>

          {/* Demand Info Card */}
          <div style={styles.demandCard}>
            <h1 style={styles.title}>{demand.title}</h1>
            
            {demand.description && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Descrição</h3>
                <p style={styles.description}>{demand.description}</p>
              </div>
            )}

            {/* Info Grid */}
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <Calendar size={18} style={styles.infoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Data</strong>
                  <p style={styles.infoValue}>{formatDate(demand.demand_date)}</p>
                </div>
              </div>

              <div style={styles.infoItem}>
                <Clock size={18} style={styles.infoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Horário</strong>
                  <p style={styles.infoValue}>
                    {formatTime(demand.start_time)}
                    {demand.end_time && ` - ${formatTime(demand.end_time)}`}
                    {demand.duration_hours && ` (${demand.duration_hours}h)`}
                  </p>
                </div>
              </div>

              <div style={styles.infoItem}>
                <MapPin size={18} style={styles.infoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Clínica</strong>
                  <p style={styles.infoValue}>{clinicName}</p>
                </div>
              </div>

              {unit && (
                <div style={styles.infoItem}>
                  <Building2 size={18} style={styles.infoIcon} />
                  <div>
                    <strong style={styles.infoLabel}>Unidade</strong>
                    <p style={styles.infoValue}>{unit.name}</p>
                  </div>
                </div>
              )}

              {demand.payment && (
                <div style={styles.infoItem}>
                  <DollarSign size={18} style={styles.infoIcon} />
                  <div>
                    <strong style={styles.infoLabel}>Pagamento</strong>
                    <p style={styles.infoValue}>R$ {demand.payment.toFixed(2)}</p>
                  </div>
                </div>
              )}

              <div style={styles.infoItem}>
                <User size={18} style={styles.infoIcon} />
                <div>
                  <strong style={styles.infoLabel}>Categoria</strong>
                  <p style={styles.infoValue}>
                    {demand.category === 'vet' ? 'Veterinário' :
                     demand.category === 'freelancer' ? 'Freelancer' :
                     demand.category === 'clinic' ? 'Clínica' : 'Outro'}
                  </p>
                </div>
              </div>
            </div>

            {/* Specialties */}
            {demand.required_specialties && demand.required_specialties.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Especialidades Requeridas</h3>
                <div style={styles.specialtiesContainer}>
                  {demand.required_specialties.map((spec, idx) => (
                    <span key={idx} style={styles.specialtyBadge}>
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Composite Badge */}
            {demand.is_composite && (
              <div style={styles.compositeBadge}>
                <strong>Demanda Composta:</strong> Esta demanda possui múltiplas posições
              </div>
            )}
          </div>

          {/* Positions Section */}
          {positions.length > 0 ? (
            <div style={styles.positionsSection}>
              <h2 style={styles.sectionTitle}>Posições ({positions.length})</h2>
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

                  {/* Applications */}
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
                </div>
              ))}
            </div>
          ) : demand.is_composite ? (
            <div style={styles.noPositions}>
              <p>Esta demanda composta ainda não possui posições cadastradas.</p>
            </div>
          ) : null}
        </div>
      </DashboardLayout>
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
};

export default DemandDetailPage;

