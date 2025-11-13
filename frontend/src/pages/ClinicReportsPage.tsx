import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { useUnit } from '../contexts/UnitContext';
import { useAlert } from '../hooks/useAlert';
import { reportsApi, PeriodType, ReportsOverview, ReportsDemands, ReportsProfessionals } from '../services/reportsApi';
import { ClipboardList, CheckCircle, Users, Clock } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

const ClinicReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showError } = useAlert();
  const { units } = useUnit();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [demands, setDemands] = useState<ReportsDemands | null>(null);
  const [professionals, setProfessionals] = useState<ReportsProfessionals | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'demands' | 'professionals'>('overview');

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  // Get clinic ID
  const getClinicId = () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    const user = JSON.parse(userStr);
    const userRole = user?.user_metadata?.role || user?.role;
    
    // If user is clinic owner, clinic_id is the same as user.id
    if (userRole === 'clinic' || userRole === 'CADMIN') {
      return user.id;
    }
    
    // Otherwise, try to get from clinic_user
    const clinicUserStr = localStorage.getItem('clinic_user');
    if (clinicUserStr) {
      try {
        const clinicUser = JSON.parse(clinicUserStr);
        if (clinicUser?.clinic_id) {
          return clinicUser.clinic_id;
        }
      } catch (error) {
        console.warn('Failed to parse clinic_user:', error);
      }
    }
    
    // Fallback to user_metadata or user.id
    return user.user_metadata?.clinic_id || user.id;
  };

  // Load reports data
  useEffect(() => {
    const loadReports = async () => {
      const clinicId = getClinicId();
      if (!clinicId) {
        showError('Erro ao identificar a clínica');
        return;
      }

      try {
        setLoading(true);
        const unitIds = selectedUnits.length > 0 ? selectedUnits : undefined;

        const [overviewData, demandsData, professionalsData] = await Promise.all([
          reportsApi.getOverview(clinicId, selectedPeriod, unitIds),
          reportsApi.getDemands(clinicId, selectedPeriod, unitIds),
          reportsApi.getProfessionals(clinicId, selectedPeriod, unitIds),
        ]);

        setOverview(overviewData);
        setDemands(demandsData);
        setProfessionals(professionalsData);
      } catch (error: any) {
        console.error('Error loading reports:', error);
        showError('Erro ao carregar relatórios: ' + (error.message || ''));
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [selectedPeriod, selectedUnits]);


  const handleUnitToggle = (unitId: string) => {
    setSelectedUnits(prev => 
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  return (
    <DashboardLayout pageName="Relatórios" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header with Filters */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Relatórios da Clínica</h1>
            <p style={styles.subtitle}>Análise detalhada de demandas e contratações</p>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Período</label>
            <div style={styles.periodButtons}>
              {(['7d', '30d', '90d'] as PeriodType[]).map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  style={{
                    ...styles.periodButton,
                    ...(selectedPeriod === period ? styles.periodButtonActive : {}),
                  }}
                >
                  {period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias'}
                </button>
              ))}
            </div>
          </div>

          {units.length > 1 && (
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Unidades</label>
              <div style={styles.unitsCheckboxes}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedUnits.length === 0}
                    onChange={() => setSelectedUnits([])}
                    style={styles.checkbox}
                  />
                  <span>Todas as unidades</span>
                </label>
                {units.map(unit => (
                  <label key={unit.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectedUnits.includes(unit.id)}
                      onChange={() => handleUnitToggle(unit.id)}
                      style={styles.checkbox}
                    />
                    <span>{unit.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              ...styles.tab,
              ...(activeTab === 'overview' ? styles.tabActive : {}),
            }}
          >
            Resumo Geral
          </button>
          <button
            onClick={() => setActiveTab('demands')}
            style={{
              ...styles.tab,
              ...(activeTab === 'demands' ? styles.tabActive : {}),
            }}
          >
            Demandas
          </button>
          <button
            onClick={() => setActiveTab('professionals')}
            style={{
              ...styles.tab,
              ...(activeTab === 'professionals' ? styles.tabActive : {}),
            }}
          >
            Profissionais Contratados
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={styles.loading}>
            <p>Carregando relatórios...</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && overview && (
              <OverviewTab overview={overview} />
            )}
            {activeTab === 'demands' && demands && (
              <DemandsTab demands={demands} />
            )}
            {activeTab === 'professionals' && professionals && (
              <ProfessionalsTab professionals={professionals} />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

// Helper function to format dates
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR');
};

// Overview Tab Component
const OverviewTab: React.FC<{ overview: ReportsOverview }> = ({ overview }) => {
  return (
    <div style={styles.tabContent}>
      <div style={styles.periodInfo}>
        <p style={styles.periodText}>
          Período: {formatDate(overview.period.start)} até {formatDate(overview.period.end)}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <ClipboardList size={24} color={colors.primary} />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{overview.summary.totalDemandsCreated}</h3>
            <p style={styles.summaryLabel}>Demandas Criadas</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <CheckCircle size={24} color="#10b981" />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{overview.summary.totalPositionsFilled}</h3>
            <p style={styles.summaryLabel}>Posições Preenchidas</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Users size={24} color="#3b82f6" />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{overview.summary.professionalsHired}</h3>
            <p style={styles.summaryLabel}>Profissionais Contratados</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Clock size={24} color="#f59e0b" />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{overview.summary.averageFillTime.toFixed(1)}</h3>
            <p style={styles.summaryLabel}>Dias (média de preenchimento)</p>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Status das Demandas</h3>
        <div style={styles.statusGrid}>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#3b82f6' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{overview.summary.demandsByStatus.open}</h4>
              <p style={styles.statusLabel}>Abertas</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#f59e0b' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{overview.summary.demandsByStatus.in_progress}</h4>
              <p style={styles.statusLabel}>Em Andamento</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#10b981' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{overview.summary.demandsByStatus.closed}</h4>
              <p style={styles.statusLabel}>Concluídas</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#ef4444' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{overview.summary.demandsByStatus.cancelled}</h4>
              <p style={styles.statusLabel}>Canceladas</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Demands Tab Component
const DemandsTab: React.FC<{ demands: ReportsDemands }> = ({ demands }) => {
  return (
    <div style={styles.tabContent}>
      <div style={styles.periodInfo}>
        <p style={styles.periodText}>
          Período: {formatDate(demands.period.start)} até {formatDate(demands.period.end)}
        </p>
      </div>

      {/* By Status */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Demandas por Status</h3>
        <div style={styles.statusGrid}>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#3b82f6' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{demands.byStatus.open}</h4>
              <p style={styles.statusLabel}>Abertas</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#f59e0b' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{demands.byStatus.in_progress}</h4>
              <p style={styles.statusLabel}>Em Andamento</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#10b981' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{demands.byStatus.closed}</h4>
              <p style={styles.statusLabel}>Concluídas</p>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={{ ...styles.statusIndicator, backgroundColor: '#ef4444' }} />
            <div style={styles.statusContent}>
              <h4 style={styles.statusValue}>{demands.byStatus.cancelled}</h4>
              <p style={styles.statusLabel}>Canceladas</p>
            </div>
          </div>
        </div>
      </div>

      {/* By Specialty */}
      {Object.keys(demands.bySpecialty).length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Taxa de Sucesso por Especialidade</h3>
          <div style={styles.specialtyGrid}>
            {Object.entries(demands.bySpecialty).map(([specialty, data]) => (
              <div key={specialty} style={styles.specialtyCard}>
                <h4 style={styles.specialtyName}>{specialty}</h4>
                <div style={styles.specialtyStats}>
                  <div style={styles.specialtyStat}>
                    <span style={styles.specialtyLabel}>Criadas:</span>
                    <span style={styles.specialtyValue}>{data.created}</span>
                  </div>
                  <div style={styles.specialtyStat}>
                    <span style={styles.specialtyLabel}>Preenchidas:</span>
                    <span style={styles.specialtyValue}>{data.filled}</span>
                  </div>
                  <div style={styles.specialtyStat}>
                    <span style={styles.specialtyLabel}>Taxa de Sucesso:</span>
                    <span style={styles.specialtyValue}>{data.successRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demands List */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Lista de Demandas</h3>
        {demands.demands.length === 0 ? (
          <p style={styles.emptyText}>Nenhuma demanda encontrada no período selecionado</p>
        ) : (
          <div style={styles.demandsList}>
            {demands.demands.map(demand => (
              <div key={demand.id} style={styles.demandCard}>
                <div style={styles.demandHeader}>
                  <h4 style={styles.demandTitle}>{demand.title}</h4>
                  <span style={{
                    ...styles.demandStatus,
                    backgroundColor: demand.status === 'open' ? '#3b82f6' :
                                    demand.status === 'in_progress' ? '#f59e0b' :
                                    demand.status === 'closed' ? '#10b981' : '#ef4444'
                  }}>
                    {demand.status === 'open' ? 'Aberta' :
                     demand.status === 'in_progress' ? 'Em Andamento' :
                     demand.status === 'closed' ? 'Concluída' : 'Cancelada'}
                  </span>
                </div>
                <div style={styles.demandInfo}>
                  <span style={styles.demandInfoItem}>
                    📅 {formatDate(demand.created_at)}
                  </span>
                  {demand.unit_name && (
                    <span style={styles.demandInfoItem}>
                      🏢 {demand.unit_name}
                    </span>
                  )}
                  {demand.fillTime !== undefined && (
                    <span style={styles.demandInfoItem}>
                      ⏱️ {demand.fillTime.toFixed(1)} dias para preencher
                    </span>
                  )}
                </div>
                <div style={styles.positionsList}>
                  {demand.positions.map(position => (
                    <div key={position.id} style={styles.positionTag}>
                      <span>{position.specialty}</span>
                      <span style={styles.positionSlots}>
                        {position.filled_slots}/{position.total_slots}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Professionals Tab Component
const ProfessionalsTab: React.FC<{ professionals: ReportsProfessionals }> = ({ professionals }) => {
  return (
    <div style={styles.tabContent}>
      <div style={styles.periodInfo}>
        <p style={styles.periodText}>
          Período: {formatDate(professionals.period.start)} até {formatDate(professionals.period.end)}
        </p>
      </div>

      {/* Summary */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Users size={24} color={colors.primary} />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{professionals.hired.length}</h3>
            <p style={styles.summaryLabel}>Profissionais Contratados</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Clock size={24} color="#f59e0b" />
          </div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryValue}>{professionals.averageHireTime.toFixed(1)}</h3>
            <p style={styles.summaryLabel}>Dias (tempo médio de contratação)</p>
          </div>
        </div>
      </div>

      {/* By Specialty */}
      {Object.keys(professionals.bySpecialty).length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Contratações por Especialidade</h3>
          <div style={styles.specialtyGrid}>
            {Object.entries(professionals.bySpecialty).map(([specialty, count]) => (
              <div key={specialty} style={styles.specialtyCard}>
                <h4 style={styles.specialtyName}>{specialty}</h4>
                <p style={styles.specialtyCount}>{count} profissional(is)</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Professionals List */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Lista de Profissionais Contratados</h3>
        {professionals.hired.length === 0 ? (
          <p style={styles.emptyText}>Nenhum profissional contratado no período selecionado</p>
        ) : (
          <div style={styles.professionalsList}>
            {professionals.hired.map((professional, index) => (
              <div key={`${professional.vet_id}-${professional.position_id}-${index}`} style={styles.professionalCard}>
                <div style={styles.professionalHeader}>
                  <div>
                    <h4 style={styles.professionalName}>{professional.vet_name}</h4>
                    {professional.vet_crmv && (
                      <p style={styles.professionalCrmv}>CRMV: {professional.vet_crmv}</p>
                    )}
                  </div>
                  <span style={styles.specialtyBadge}>{professional.specialty}</span>
                </div>
                <div style={styles.professionalInfo}>
                  <span style={styles.professionalInfoItem}>
                    📋 {professional.demand_title}
                  </span>
                  {professional.unit_name && (
                    <span style={styles.professionalInfoItem}>
                      🏢 {professional.unit_name}
                    </span>
                  )}
                  <span style={styles.professionalInfoItem}>
                    📅 Contratado em {formatDate(professional.accepted_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#737373',
    margin: 0,
  },
  filters: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  periodButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  periodButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
    backgroundColor: '#ffffff',
    color: '#525252',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderColor: colors.primary,
  },
  unitsCheckboxes: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#525252',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  tab: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    borderBottomColor: colors.primary,
    color: colors.primary,
  },
  tabContent: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
  },
  periodInfo: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e5e5',
  },
  periodText: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '64px',
    color: '#737373',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  summaryCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  summaryIcon: {
    flexShrink: 0,
  },
  summaryContent: {
    flex: 1,
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  statusCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusIndicator: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusContent: {
    flex: 1,
  },
  statusValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  statusLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  specialtyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '16px',
  },
  specialtyCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
  },
  specialtyName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '12px',
  },
  specialtyStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  specialtyStat: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
  },
  specialtyLabel: {
    color: '#737373',
  },
  specialtyValue: {
    fontWeight: '600',
    color: '#262626',
  },
  specialtyCount: {
    fontSize: '24px',
    fontWeight: '700',
    color: colors.primary,
    margin: 0,
  },
  demandsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  demandCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  demandHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  demandTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  demandStatus: {
    padding: '4px 12px',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
  },
  demandInfo: {
    display: 'flex',
    gap: '16px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  demandInfoItem: {
    fontSize: '14px',
    color: '#737373',
  },
  positionsList: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  positionTag: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  positionSlots: {
    fontWeight: '600',
    color: colors.primary,
  },
  professionalsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  professionalCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  professionalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  professionalName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  professionalCrmv: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  specialtyBadge: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
  },
  professionalInfo: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  professionalInfoItem: {
    fontSize: '14px',
    color: '#737373',
  },
  emptyText: {
    textAlign: 'center',
    padding: '64px',
    color: '#737373',
    fontSize: '16px',
  },
};

export default ClinicReportsPage;

