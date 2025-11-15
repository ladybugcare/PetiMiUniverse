import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { useUnit } from '../contexts/UnitContext';
import { useAlert } from '../hooks/useAlert';
import { reportsApi, PeriodType, ReportsOverview, ReportsDemands, ReportsProfessionals } from '../services/reportsApi';
import { ClipboardList, CheckCircle, Users, Clock, FileText, TrendingUp, XCircle, Award, ChevronDown, ChevronUp } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import StatusPieChart from '../components/reports/StatusPieChart';
import SpecialtyBarChart from '../components/reports/SpecialtyBarChart';
import MetricTooltip from '../components/reports/MetricTooltip';

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
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(true);

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

      // Don't load if custom period is selected but dates are not set
      if (selectedPeriod === 'custom' && (!customStartDate || !customEndDate)) {
        return;
      }

      // Don't load if custom dates are invalid
      if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
        if (new Date(customStartDate) > new Date(customEndDate)) {
          return;
        }
      }

      try {
        setLoading(true);
        const unitIds = selectedUnits.length > 0 ? selectedUnits : undefined;
        const startDate = selectedPeriod === 'custom' ? customStartDate : undefined;
        const endDate = selectedPeriod === 'custom' ? customEndDate : undefined;

        const [overviewData, demandsData, professionalsData] = await Promise.all([
          reportsApi.getOverview(clinicId, selectedPeriod, unitIds, startDate, endDate),
          reportsApi.getDemands(clinicId, selectedPeriod, unitIds, startDate, endDate),
          reportsApi.getProfessionals(clinicId, selectedPeriod, unitIds, startDate, endDate),
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
  }, [selectedPeriod, selectedUnits, customStartDate, customEndDate]);


  const handleUnitToggle = (unitId: string) => {
    setSelectedUnits(prev => 
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  return (
    <DashboardLayout pageName="Relatórios" menuItems={menuItems}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .charts-container {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
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
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            style={styles.filtersHeader}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={styles.filtersHeaderText}>Filtros</span>
            {filtersExpanded ? (
              <ChevronUp size={20} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={20} color={colors.textSecondary} />
            )}
          </button>
          
          {filtersExpanded && (
            <div style={styles.filtersContent}>
              <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Período</label>
            <div style={styles.periodButtons}>
              {(['7d', '30d', '90d', 'custom'] as PeriodType[]).map(period => (
                <button
                  key={period}
                  onClick={() => {
                    setSelectedPeriod(period);
                    if (period === 'custom') {
                      setShowCustomDatePicker(true);
                    } else {
                      setShowCustomDatePicker(false);
                    }
                  }}
                  style={{
                    ...styles.periodButton,
                    ...(selectedPeriod === period ? styles.periodButtonActive : {}),
                  }}
                >
                  {period === '7d' ? '7 dias' : 
                   period === '30d' ? '30 dias' : 
                   period === '90d' ? '90 dias' : 
                   'Personalizado'}
                </button>
              ))}
            </div>
            {showCustomDatePicker && selectedPeriod === 'custom' && (
              <div style={styles.customDatePicker}>
                <div style={styles.dateInputGroup}>
                  <label style={styles.dateLabel}>Data Inicial:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    style={styles.dateInput}
                    max={customEndDate || new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div style={styles.dateInputGroup}>
                  <label style={styles.dateLabel}>Data Final:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    style={styles.dateInput}
                    min={customStartDate}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                {customStartDate && customEndDate && new Date(customStartDate) > new Date(customEndDate) && (
                  <p style={styles.dateError}>A data inicial deve ser anterior à data final</p>
                )}
              </div>
            )}
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
            <div style={styles.loadingSpinner}></div>
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
            <MetricTooltip text="Total de demandas criadas no período selecionado">
              <h3 style={styles.summaryValue}>{overview.summary.totalDemandsCreated}</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Demandas Criadas</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <FileText size={24} color="#8b5cf6" />
          </div>
          <div style={styles.summaryContent}>
            <MetricTooltip text="Total de candidaturas recebidas no período selecionado">
              <h3 style={styles.summaryValue}>{overview.summary.totalApplicationsReceived}</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Candidaturas Recebidas</p>
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
            <TrendingUp size={24} color="#10b981" />
          </div>
          <div style={styles.summaryContent}>
            <MetricTooltip text="Percentual de candidaturas que foram aceitas (aceitas / total recebidas)">
              <h3 style={styles.summaryValue}>{overview.summary.conversionRate.toFixed(1)}%</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Taxa de Conversão</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Clock size={24} color="#f59e0b" />
          </div>
          <div style={styles.summaryContent}>
            <MetricTooltip text="Tempo médio em dias entre a criação da posição e o preenchimento (aceitação do primeiro candidato)">
              <h3 style={styles.summaryValue}>{overview.summary.averageFillTime.toFixed(1)}</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Dias (média de preenchimento)</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Clock size={24} color="#06b6d4" />
          </div>
          <div style={styles.summaryContent}>
            <MetricTooltip text="Tempo médio entre a criação da demanda e a primeira candidatura recebida">
              <h3 style={styles.summaryValue}>{overview.summary.averageResponseTime.toFixed(1)}h</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Tempo Médio de Resposta</p>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <XCircle size={24} color="#ef4444" />
          </div>
          <div style={styles.summaryContent}>
            <MetricTooltip text="Percentual de demandas canceladas em relação ao total criado">
              <h3 style={styles.summaryValue}>{overview.summary.cancellationRate.toFixed(1)}%</h3>
            </MetricTooltip>
            <p style={styles.summaryLabel}>Taxa de Cancelamento</p>
          </div>
        </div>
      </div>

      {/* Charts Side by Side */}
      <div style={styles.chartsContainer} className="charts-container">
        {/* Status Breakdown */}
        <div style={styles.chartSection}>
          <h3 style={styles.sectionTitle}>Status das Demandas</h3>
          
          {/* Insight Box */}
          {(() => {
            const totalAbertas = overview.summary.demandsByStatus.open;
            const totalConcluidas = overview.summary.demandsByStatus.closed;
            
            return (
              <div style={styles.statusInsightBox}>
                <div style={styles.statusInsightIcon}>
                  <TrendingUp size={16} color={colors.primary} />
                </div>
                <p style={styles.statusInsightText}>
                  Das <strong>{totalAbertas}</strong> demandas abertas,{' '}
                  {totalConcluidas > 0 ? (
                    <> <strong>{totalConcluidas}</strong> foram concluídas.</>
                  ) : (
                    <> nenhuma foi concluída até o momento.</>
                  )}
                </p>
              </div>
            );
          })()}

          <div style={styles.chartContainer}>
            <StatusPieChart data={overview.summary.demandsByStatus} />
          </div>
        </div>

        {/* Most Demanded Specialties */}
        {overview.summary.mostDemandedSpecialties && overview.summary.mostDemandedSpecialties.length > 0 && (() => {
          const specialties = overview.summary.mostDemandedSpecialties;
          const totalSpecialtiesCount = specialties.reduce((sum, item) => sum + item.count, 0);
          const totalDemands = overview.summary.totalDemandsCreated;
          const percentageOfTotal = totalDemands > 0 ? (totalSpecialtiesCount / totalDemands) * 100 : 0;
          
          return (
            <div style={styles.chartSection}>
              <h3 style={styles.sectionTitle}>Especialidades Mais Demandadas</h3>
              
              {/* Mini Resumo Analítico */}
              <div style={styles.analyticalSummary}>
                <div style={styles.analyticalSummaryIcon}>
                  <TrendingUp size={16} color={colors.primary} />
                </div>
                <p style={styles.analyticalSummaryText}>
                  As <strong>{specialties.length}</strong> especialidades mais procuradas representam{' '}
                  <strong>{percentageOfTotal.toFixed(1)}%</strong> das demandas totais no período.
                </p>
              </div>

              <div style={styles.chartContainer}>
                <SpecialtyBarChart 
                  data={specialties} 
                  totalDemands={totalDemands}
                />
              </div>
            </div>
          );
        })()}
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
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Nenhuma demanda encontrada no período selecionado</p>
            <p style={styles.emptySubtext}>Tente alterar o período ou os filtros de unidade para ver mais resultados</p>
          </div>
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
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Nenhum profissional contratado no período selecionado</p>
            <p style={styles.emptySubtext}>Profissionais contratados aparecerão aqui quando houver aceitações de candidaturas no período</p>
          </div>
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
    marginBottom: '24px',
    overflow: 'hidden',
  },
  filtersHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '16px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  filtersHeaderText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
  },
  filtersContent: {
    padding: '0 24px 24px 24px',
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
    position: 'relative',
    overflow: 'visible',
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e5e5',
    borderTop: '4px solid ' + colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  customDatePicker: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  dateInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  dateLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
  },
  dateInput: {
    padding: '8px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  dateError: {
    fontSize: '12px',
    color: '#ef4444',
    margin: 0,
  },
  specialtyRank: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  rankNumber: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#525252',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
    position: 'relative',
    overflow: 'visible',
  },
  summaryCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    position: 'relative',
    overflow: 'visible',
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
  analyticalSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: colors.primaryBg,
    border: `1px solid ${colors.primaryLighter}`,
    borderRadius: '8px',
    marginBottom: '20px',
  },
  analyticalSummaryIcon: {
    flexShrink: 0,
  },
  analyticalSummaryText: {
    fontSize: '14px',
    color: colors.primaryDark,
    margin: 0,
    lineHeight: '1.5',
  },
  statusInsightBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: colors.primaryBg,
    border: `1px solid ${colors.primaryLighter}`,
    borderRadius: '8px',
    marginBottom: '20px',
  },
  statusInsightIcon: {
    flexShrink: 0,
  },
  statusInsightText: {
    fontSize: '14px',
    color: colors.primaryDark,
    margin: 0,
    lineHeight: '1.5',
  },
  chartsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '32px',
    alignItems: 'stretch',
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  chartContainer: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'visible',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '400px',
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    height: '100%',
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
    gridTemplateColumns: '1fr',
    gap: '16px',
    height: '100%',
    alignContent: 'stretch',
  },
  specialtyCard: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
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
  emptyState: {
    textAlign: 'center',
    padding: '64px 32px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
  },
  emptyText: {
    color: '#262626',
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '8px',
  },
  emptySubtext: {
    color: '#737373',
    fontSize: '14px',
    margin: 0,
  },
};

export default ClinicReportsPage;

