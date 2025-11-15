import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useAlert } from '../hooks/useAlert';
import { adminReportsApi, PeriodType, AdminOverview, AdminSpecialties, AdminUsage } from '../services/adminReportsApi';
import { Building2, Users, FileText, TrendingUp, ChevronDown, ChevronUp, Activity, CheckCircle, XCircle, Award, AlertCircle } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import MetricCard from '../components/reports/MetricCard';
import StatusPieChart from '../components/reports/StatusPieChart';
import SpecialtyBarChart from '../components/reports/SpecialtyBarChart';

const AdminReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { showError } = useAlert();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [specialties, setSpecialties] = useState<AdminSpecialties | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(true);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  // Load reports data
  useEffect(() => {
    const loadReports = async () => {
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
        const startDate = selectedPeriod === 'custom' ? customStartDate : undefined;
        const endDate = selectedPeriod === 'custom' ? customEndDate : undefined;

        const [overviewData, specialtiesData, usageData] = await Promise.all([
          adminReportsApi.getOverview(selectedPeriod, startDate, endDate),
          adminReportsApi.getSpecialties(selectedPeriod, startDate, endDate),
          adminReportsApi.getUsage(selectedPeriod, startDate, endDate),
        ]);

        setOverview(overviewData);
        setSpecialties(specialtiesData);
        setUsage(usageData);
      } catch (error: any) {
        console.error('Error loading admin reports:', error);
        showError('Erro ao carregar relatórios: ' + (error.message || ''));
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [selectedPeriod, customStartDate, customEndDate]);

  // Helper function to format dates
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Helper function to get card color based on metric and value
  const getCardColor = (metric: string, value: number): string => {
    switch (metric) {
      case 'approvalRate':
        // Taxa de Aprovação: > 80% = verde, 50-80% = roxo, < 50% = laranja
        if (value >= 80) return colors.success;
        if (value >= 50) return colors.primary;
        return colors.warning;
      
      case 'growthRate':
        // Crescimento: > 0 = verde, 0 = roxo, < 0 = laranja
        if (value > 0) return colors.success;
        if (value === 0) return colors.primary;
        return colors.warning;
      
      case 'rejectionRate':
      case 'cancellationRate':
        // Taxa de Rejeição/Cancelamento: < 5% = verde, 5-15% = laranja, > 15% = vermelho
        if (value < 5) return colors.success;
        if (value <= 15) return colors.warning;
        return colors.danger;
      
      default:
        return colors.primary;
    }
  };

  // Helper function to generate activity insight
  const generateActivityInsight = (): React.ReactNode => {
    if (!overview) return null;

    const { activity } = overview;
    const parts: React.ReactNode[] = [];

    parts.push('No período analisado, a plataforma registrou ');
    parts.push(<strong key="registrations">{activity.totalNewRegistrations}</strong>);
    parts.push(` ${activity.totalNewRegistrations === 1 ? 'novo cadastro' : 'novos cadastros'} `);
    parts.push(`(${activity.newClinics} ${activity.newClinics === 1 ? 'clínica' : 'clínicas'}, `);
    parts.push(`${activity.newUnits} ${activity.newUnits === 1 ? 'unidade' : 'unidades'} e `);
    parts.push(`${activity.newVets} ${activity.newVets === 1 ? 'veterinário' : 'veterinários'}). `);
    
    parts.push(`Atualmente, há `);
    parts.push(<strong key="active">{activity.activeClinics}</strong>);
    parts.push(` ${activity.activeClinics === 1 ? 'clínica ativa' : 'clínicas ativas'} `);
    parts.push(`e ${activity.inactiveClinics} ${activity.inactiveClinics === 1 ? 'clínica inativa' : 'clínicas inativas'}.`);

    return <>{parts}</>;
  };

  // Helper function to generate performance insight
  const generatePerformanceInsight = (): React.ReactNode => {
    if (!overview || !specialties) return null;

    const { performance } = overview;
    const parts: React.ReactNode[] = [];

    parts.push('A taxa média de aprovação de clínicas é de ');
    parts.push(<strong key="approval">{performance.averageApprovalRate.toFixed(1)}%</strong>);
    parts.push('. ');

    if (performance.growthRate > 0) {
      parts.push('O crescimento de cadastros foi de ');
      parts.push(<strong key="growth">+{performance.growthRate.toFixed(1)}%</strong>);
      parts.push(' em relação ao período anterior. ');
    } else if (performance.growthRate < 0) {
      parts.push('Houve uma redução de ');
      parts.push(<strong key="growth">{performance.growthRate.toFixed(1)}%</strong>);
      parts.push(' nos cadastros em relação ao período anterior. ');
    } else {
      parts.push('O número de cadastros manteve-se estável em relação ao período anterior. ');
    }

    if (specialties.topSpecialties.length > 0) {
      const topSpecialty = specialties.topSpecialties[0];
      parts.push('A especialidade mais demandada foi ');
      parts.push(<strong key="specialty">{topSpecialty.specialty}</strong>);
      parts.push(` (${topSpecialty.count} ${topSpecialty.count === 1 ? 'demanda' : 'demandas'}).`);
    }

    return <>{parts}</>;
  };

  // Helper function to generate health insight
  const generateHealthInsight = (): React.ReactNode => {
    if (!usage) return null;

    const parts: React.ReactNode[] = [];

    parts.push('Nos últimos 30 dias, ');
    parts.push(<strong key="active">{usage.activeUsers}</strong>);
    parts.push(` ${usage.activeUsers === 1 ? 'usuário esteve ativo' : 'usuários estiveram ativos'} `);
    parts.push(`e ${usage.uniqueLogins} ${usage.uniqueLogins === 1 ? 'login único foi registrado' : 'logins únicos foram registrados'} no período. `);

    if (usage.rejectionRate > 15 || usage.cancellationRate > 15) {
      parts.push('Atenção: ');
      if (usage.rejectionRate > 15) {
        parts.push(`a taxa de rejeição está alta (${usage.rejectionRate.toFixed(1)}%). `);
      }
      if (usage.cancellationRate > 15) {
        parts.push(`a taxa de cancelamento está alta (${usage.cancellationRate.toFixed(1)}%). `);
      }
    } else {
      parts.push('As taxas de rejeição e cancelamento estão dentro de níveis aceitáveis.');
    }

    return <>{parts}</>;
  };

  return (
    <DashboardLayout pageName="Visão Global" menuItems={menuItems}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .summary-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (min-width: 1025px) {
          .summary-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
      `}</style>
      <div style={styles.container}>
        {/* Header with Filters */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Visão Global da Plataforma</h1>
            <p style={styles.subtitle}>Monitoramento de uso e desempenho</p>
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
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div style={styles.loading}>
            <div style={styles.loadingSpinner}></div>
            <p>Carregando relatórios...</p>
          </div>
        ) : overview ? (
          <>
            <div style={styles.periodInfo}>
              <p style={styles.periodText}>
                Período: {formatDate(overview.period.start)} até {formatDate(overview.period.end)}
              </p>
            </div>

            {/* Seção 1: Atividade da Plataforma */}
            {overview && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Atividade da Plataforma</h2>
                
                {/* Insight Box */}
                <div style={styles.insightBox}>
                  <div style={styles.insightIcon}>
                    <TrendingUp size={16} color={colors.primary} />
                  </div>
                  <p style={styles.insightText}>
                    {generateActivityInsight()}
                  </p>
                </div>
                
                <div style={styles.summaryGrid} className="summary-grid">
                  <MetricCard
                    label="Clínicas Ativas"
                    value={overview.activity.activeClinics}
                  icon={Building2}
                  tooltip="Clínicas com status ativo que tiveram atividade (login ou demanda) nos últimos 30 dias"
                  color={colors.success}
                />
                
                <MetricCard
                  label="Clínicas Inativas"
                  value={overview.activity.inactiveClinics}
                  icon={Building2}
                  tooltip="Clínicas com status ativo mas sem atividade recente"
                  color={colors.textSecondary}
                />
                
                <MetricCard
                  label="Novos Cadastros"
                  value={overview.activity.totalNewRegistrations}
                  icon={Users}
                  tooltip="Total de novos cadastros (clínicas + unidades + veterinários) no período"
                  color={colors.primary}
                />
                
                <MetricCard
                  label="Novas Clínicas"
                  value={overview.activity.newClinics}
                  icon={Building2}
                  tooltip="Clínicas cadastradas no período"
                  color={colors.primary}
                />
                
                <MetricCard
                  label="Novas Unidades"
                  value={overview.activity.newUnits}
                  icon={Building2}
                  tooltip="Unidades cadastradas no período"
                  color={colors.primary}
                />
                
                <MetricCard
                  label="Novos Veterinários"
                  value={overview.activity.newVets}
                  icon={Users}
                  tooltip="Veterinários cadastrados no período"
                  color={colors.primary}
                />
                
                <MetricCard
                  label="Demandas Abertas"
                  value={overview.activity.openDemands}
                  icon={FileText}
                  tooltip="Total de demandas com status aberto no período"
                  color={colors.primary}
                />
                
                <MetricCard
                  label="Demandas Concluídas"
                  value={overview.activity.closedDemands}
                  icon={CheckCircle}
                  tooltip="Total de demandas concluídas no período"
                  color={colors.success}
                />
              </div>

              {/* Gráfico de Status das Demandas */}
              {overview && overview.activity.demandsByStatus && (
                <div style={styles.chartSection}>
                  <h3 style={styles.chartTitle}>Status das Demandas</h3>
                  <div style={styles.chartContainer}>
                    <StatusPieChart data={overview.activity.demandsByStatus} />
                  </div>
                </div>
              )}
              </div>
            )}

            {/* Seção 2: Performance Geral */}
            {overview && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Performance Geral</h2>
                
                {/* Insight Box */}
                {overview && specialties && (
                  <div style={styles.insightBox}>
                    <div style={styles.insightIcon}>
                      <TrendingUp size={16} color={colors.primary} />
                    </div>
                    <p style={styles.insightText}>
                      {generatePerformanceInsight()}
                    </p>
                  </div>
                )}
                
                <div style={styles.summaryGrid} className="summary-grid">
                  <MetricCard
                    label="Taxa Média de Aprovação"
                    value={overview.performance.averageApprovalRate}
                    icon={Award}
                    tooltip="Percentual de clínicas aprovadas em relação ao total cadastrado"
                    color={getCardColor('approvalRate', overview.performance.averageApprovalRate)}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                  />
                  
                  <MetricCard
                    label="Crescimento de Cadastros"
                    value={overview.performance.growthRate}
                    icon={TrendingUp}
                    tooltip="Variação percentual de novos cadastros em relação ao período anterior"
                    color={getCardColor('growthRate', overview.performance.growthRate)}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  />
                  
                  <MetricCard
                    label="Volume Médio por Especialidade"
                    value={overview.performance.averageDemandsPerSpecialty}
                    icon={FileText}
                    tooltip="Média de demandas por especialidade no período"
                    color={colors.primary}
                    formatValue={(v) => v.toFixed(1)}
                  />
                </div>

                {/* Gráfico de Top 5 Especialidades */}
                {specialties && specialties.topSpecialties.length > 0 && (
                  <div style={styles.chartSection}>
                    <h3 style={styles.chartTitle}>Top 5 Especialidades Mais Demandadas</h3>
                    <div style={styles.chartContainer}>
                      <SpecialtyBarChart
                        data={specialties.topSpecialties.map(s => ({ specialty: s.specialty, count: s.count }))}
                        totalDemands={specialties.topSpecialties.reduce((sum, s) => sum + s.count, 0)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seção 3: Indicadores de Saúde do Sistema */}
            {usage && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Indicadores de Saúde do Sistema</h2>
                
                {/* Insight Box */}
                {usage && (
                  <div style={styles.insightBox}>
                    <div style={styles.insightIcon}>
                      <Activity size={16} color={colors.primary} />
                    </div>
                    <p style={styles.insightText}>
                      {generateHealthInsight()}
                    </p>
                  </div>
                )}
                
                <div style={styles.summaryGrid} className="summary-grid">
                  <MetricCard
                    label="Usuários Ativos (30 dias)"
                    value={usage.activeUsers}
                    icon={Users}
                    tooltip="Usuários únicos com atividade nos últimos 30 dias"
                    color={colors.success}
                  />
                  
                  <MetricCard
                    label="Taxa de Rejeição"
                    value={usage.rejectionRate}
                    icon={XCircle}
                    tooltip="Percentual de demandas rejeitadas em relação ao total"
                    color={getCardColor('rejectionRate', usage.rejectionRate)}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                  />
                  
                  <MetricCard
                    label="Taxa de Cancelamento"
                    value={usage.cancellationRate}
                    icon={AlertCircle}
                    tooltip="Percentual de demandas canceladas em relação ao total"
                    color={getCardColor('cancellationRate', usage.cancellationRate)}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                  />
                  
                  <MetricCard
                    label="Logins Únicos"
                    value={usage.uniqueLogins}
                    icon={Activity}
                    tooltip="Número de usuários únicos que fizeram login no período"
                    color={colors.primary}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Nenhum dado disponível para o período selecionado</p>
          </div>
        )}
      </div>
    </DashboardLayout>
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
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '20px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    position: 'relative',
    overflow: 'visible',
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
  },
  chartSection: {
    marginTop: '32px',
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
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
  },
  insightBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: colors.primaryBg,
    border: `1px solid ${colors.primaryLighter}`,
    borderRadius: '12px',
    marginBottom: '24px',
  },
  insightIcon: {
    flexShrink: 0,
  },
  insightText: {
    fontSize: '14px',
    color: colors.primaryDark,
    margin: 0,
    lineHeight: '1.6',
  },
};

export default AdminReportsPage;

