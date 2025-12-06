import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { useUnit } from '../contexts/UnitContext';
import { useAlert } from '../hooks/useAlert';
import { reportsApi, PeriodType, ReportsOverview, ReportsDemands, ReportsProfessionals, ReportsOverviewWithComparison } from '../services/reportsApi';
import { ClipboardList, CheckCircle, Users, Clock, FileText, TrendingUp, XCircle, Award, ChevronDown, ChevronUp } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import StatusPieChart from '../components/reports/StatusPieChart';
import SpecialtyBarChart from '../components/reports/SpecialtyBarChart';
import MetricTooltip from '../components/reports/MetricTooltip';
import SpecialtySuccessCard from '../components/reports/SpecialtySuccessCard';
import MetricCard from '../components/reports/MetricCard';
import SpecialtyHireCard from '../components/reports/SpecialtyHireCard';

const ClinicReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showError } = useAlert();
  const { units } = useUnit();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [overviewWithComparison, setOverviewWithComparison] = useState<ReportsOverviewWithComparison | null>(null);
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

        const [overviewComparisonData, demandsData, professionalsData] = await Promise.all([
          reportsApi.getOverviewWithComparison(clinicId, selectedPeriod, unitIds, startDate, endDate),
          reportsApi.getDemands(clinicId, selectedPeriod, unitIds, startDate, endDate),
          reportsApi.getProfessionals(clinicId, selectedPeriod, unitIds, startDate, endDate),
        ]);

        setOverview(overviewComparisonData.current);
        setOverviewWithComparison(overviewComparisonData);
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
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-width: 768px) {
          .charts-container {
            grid-template-columns: 1fr !important;
          }
          .status-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
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
        @media (min-width: 769px) {
          .status-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (max-width: 1024px) {
          .specialty-success-grid {
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
          }
        }
        @media (max-width: 768px) {
          .specialty-success-grid {
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
            {activeTab === 'overview' && overview && overviewWithComparison && (
              <OverviewTab overview={overview} overviewWithComparison={overviewWithComparison} />
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

// Helper function to generate status insight
const generateStatusInsight = (data: {
  open: number;
  in_progress: number;
  closed: number;
  cancelled: number;
}): React.ReactNode => {
  // Tratar valores nulos/undefined
  const open = data.open || 0;
  const inProgress = data.in_progress || 0;
  const closed = data.closed || 0;
  const cancelled = data.cancelled || 0;
  
  const total = open + inProgress + closed + cancelled;
  
  // Caso especial: sem demandas
  if (total === 0) {
    return 'Nenhuma demanda encontrada no período selecionado.';
  }

  // Calcular percentuais com proteção contra divisão por zero
  const openPercent = total > 0 ? (open / total) * 100 : 0;
  const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;
  const closedPercent = total > 0 ? (closed / total) * 100 : 0;
  const cancelledPercent = total > 0 ? (cancelled / total) * 100 : 0;
  
  // Validar percentuais (NaN, Infinity)
  const safeOpenPercent = isNaN(openPercent) || !isFinite(openPercent) ? 0 : openPercent;
  const safeInProgressPercent = isNaN(inProgressPercent) || !isFinite(inProgressPercent) ? 0 : inProgressPercent;
  const safeClosedPercent = isNaN(closedPercent) || !isFinite(closedPercent) ? 0 : closedPercent;
  const safeCancelledPercent = isNaN(cancelledPercent) || !isFinite(cancelledPercent) ? 0 : cancelledPercent;

  // Verificar se há apenas uma categoria
  const categoriesWithData = [
    { name: 'abertas', count: open, percent: safeOpenPercent },
    { name: 'em andamento', count: inProgress, percent: safeInProgressPercent },
    { name: 'concluídas', count: closed, percent: safeClosedPercent },
    { name: 'canceladas', count: cancelled, percent: safeCancelledPercent },
  ].filter(cat => cat.count > 0);

  // Caso: apenas uma categoria
  if (categoriesWithData.length === 1) {
    const category = categoriesWithData[0];
    if (category.name === 'abertas') {
      return <>Todas as <strong>{total}</strong> demandas estão em aberto no período.</>;
    }
    if (category.name === 'concluídas') {
      return <>Todas as <strong>{total}</strong> demandas foram concluídas com sucesso.</>;
    }
    if (category.name === 'canceladas') {
      return <>Todas as <strong>{total}</strong> demandas foram canceladas no período.</>;
    }
    if (category.name === 'em andamento') {
      return <>Todas as <strong>{total}</strong> demandas estão em andamento.</>;
    }
  }

  // Prioridade 1: Cancelamentos significativos (>20%)
  if (safeCancelledPercent > 20) {
    return (
      <>
        Atenção: <strong>{safeCancelledPercent.toFixed(1)}%</strong> das demandas foram canceladas 
        ({cancelled} de {total}).
      </>
    );
  }

  // Prioridade 2: Maioria clara (>50%)
  if (safeClosedPercent > 50) {
    return (
      <>
        A maioria das demandas (<strong>{safeClosedPercent.toFixed(1)}%</strong>) foi concluída com sucesso 
        ({closed} de {total}).
      </>
    );
  }

  if (safeCancelledPercent > 50) {
    return (
      <>
        A maioria das demandas (<strong>{safeCancelledPercent.toFixed(1)}%</strong>) foi cancelada 
        ({cancelled} de {total}).
      </>
    );
  }

  if (safeOpenPercent > 50) {
    return (
      <>
        A maioria das demandas (<strong>{safeOpenPercent.toFixed(1)}%</strong>) está em aberto 
        ({open} de {total}).
      </>
    );
  }

  if (safeInProgressPercent > 50) {
    return (
      <>
        A maioria das demandas (<strong>{safeInProgressPercent.toFixed(1)}%</strong>) está em andamento 
        ({inProgress} de {total}).
      </>
    );
  }

  // Caso 3: Distribuição equilibrada
  const parts: React.ReactNode[] = [];
  parts.push('As demandas estão distribuídas entre: ');
  
  const distributionParts: string[] = [];
  if (open > 0) {
    distributionParts.push(`${safeOpenPercent.toFixed(1)}% abertas`);
  }
  if (inProgress > 0) {
    distributionParts.push(`${safeInProgressPercent.toFixed(1)}% em andamento`);
  }
  if (closed > 0) {
    distributionParts.push(`${safeClosedPercent.toFixed(1)}% concluídas`);
  }
  if (cancelled > 0) {
    distributionParts.push(`${safeCancelledPercent.toFixed(1)}% canceladas`);
  }

  if (distributionParts.length > 0) {
    const lastPart = distributionParts.pop();
    if (distributionParts.length > 0) {
      parts.push(distributionParts.join(', '));
      parts.push(' e ');
    }
    parts.push(<strong key="last">{lastPart}</strong>);
    parts.push('.');
  }

  return <>{parts}</>;
};

// Helper function to generate specialties insight
const generateSpecialtiesInsight = (
  specialties: Array<{ specialty: string; count: number }>,
  totalPositions: number
): React.ReactNode => {
  if (!specialties || specialties.length === 0) {
    return 'Nenhuma especialidade registrada no período.';
  }

  // Tratar valores nulos/undefined
  const safeTotalPositions = totalPositions || 0;
  
  if (safeTotalPositions === 0) {
    return 'Nenhuma posição registrada no período.';
  }

  // Calcular total das top especialidades mostradas (tratando valores nulos)
  const topSpecialtiesCount = specialties.reduce((sum, item) => {
    const count = item.count || 0;
    return sum + count;
  }, 0);
  
  // Proteção contra divisão por zero e valores inválidos
  const percentage = safeTotalPositions > 0 
    ? (topSpecialtiesCount / safeTotalPositions) * 100 
    : 0;
  
  const safePercentage = isNaN(percentage) || !isFinite(percentage) ? 0 : percentage;

  // Caso: apenas uma especialidade
  if (specialties.length === 1) {
    const specialty = specialties[0];
    const specialtyCount = specialty.count || 0;
    if (specialtyCount === safeTotalPositions) {
      return (
        <>
          Todas as posições são da especialidade <strong>{specialty.specialty}</strong>.
        </>
      );
    }
    const specialtyPercent = safeTotalPositions > 0 
      ? (specialtyCount / safeTotalPositions) * 100 
      : 0;
    const safeSpecialtyPercent = isNaN(specialtyPercent) || !isFinite(specialtyPercent) ? 0 : specialtyPercent;
    
    return (
      <>
        A especialidade <strong>{specialty.specialty}</strong> concentra{' '}
        <strong>{safeSpecialtyPercent.toFixed(1)}%</strong> das posições ({specialtyCount} de {safeTotalPositions}).
      </>
    );
  }

  // Caso: especialidade dominante (>50%)
  const topSpecialty = specialties[0];
  const topSpecialtyCount = topSpecialty.count || 0;
  const topSpecialtyPercent = safeTotalPositions > 0 
    ? (topSpecialtyCount / safeTotalPositions) * 100 
    : 0;
  const safeTopSpecialtyPercent = isNaN(topSpecialtyPercent) || !isFinite(topSpecialtyPercent) ? 0 : topSpecialtyPercent;
  
  if (safeTopSpecialtyPercent > 50) {
    return (
      <>
        A especialidade <strong>{topSpecialty.specialty}</strong> concentra{' '}
        <strong>{safeTopSpecialtyPercent.toFixed(1)}%</strong> das posições ({topSpecialtyCount} de {safeTotalPositions}).
      </>
    );
  }

  // Caso: top 2-3 dominantes (>70% combinado)
  const top2Count = specialties.slice(0, 2).reduce((sum, item) => sum + (item.count || 0), 0);
  const top2Percent = safeTotalPositions > 0 
    ? (top2Count / safeTotalPositions) * 100 
    : 0;
  const safeTop2Percent = isNaN(top2Percent) || !isFinite(top2Percent) ? 0 : top2Percent;
  
  if (safeTop2Percent > 70 && specialties.length >= 2) {
    return (
      <>
        As especialidades <strong>{specialties[0].specialty}</strong> e <strong>{specialties[1].specialty}</strong>{' '}
        concentram <strong>{safeTop2Percent.toFixed(1)}%</strong> das posições.
      </>
    );
  }

  const top3Count = specialties.slice(0, 3).reduce((sum, item) => sum + (item.count || 0), 0);
  const top3Percent = safeTotalPositions > 0 
    ? (top3Count / safeTotalPositions) * 100 
    : 0;
  const safeTop3Percent = isNaN(top3Percent) || !isFinite(top3Percent) ? 0 : top3Percent;
  
  if (safeTop3Percent > 70 && specialties.length >= 3) {
    return (
      <>
        As especialidades <strong>{specialties[0].specialty}</strong>, <strong>{specialties[1].specialty}</strong>{' '}
        e <strong>{specialties[2].specialty}</strong> concentram <strong>{safeTop3Percent.toFixed(1)}%</strong> das posições.
      </>
    );
  }

  // Caso: poucas especialidades (≤3)
  if (specialties.length <= 3) {
    return (
      <>
        As <strong>{specialties.length}</strong> especialidades mais procuradas representam{' '}
        <strong>{safePercentage.toFixed(1)}%</strong> das posições ({topSpecialtiesCount} de {safeTotalPositions}).
      </>
    );
  }

  // Caso: distribuição equilibrada (top 5 <50% combinado)
  if (safePercentage < 50) {
    return 'A demanda está distribuída de forma equilibrada entre as especialidades.';
  }

  // Caso padrão: muitas especialidades
  return (
    <>
      As <strong>5</strong> especialidades mais procuradas representam{' '}
      <strong>{safePercentage.toFixed(1)}%</strong> das posições totais ({topSpecialtiesCount} de {safeTotalPositions}).
    </>
  );
};

// Helper function to get card color based on metric and value
const getCardColor = (metric: string, value: number): string => {
  switch (metric) {
    case 'conversionRate':
      // Taxa de Conversão: > 30% = verde, 10-30% = roxo, < 10% = laranja
      if (value >= 30) return colors.success[500];
      if (value >= 10) return colors.brand.primary[500];
      return colors.warning[500];
    
    case 'cancellationRate':
      // Taxa de Cancelamento: < 5% = verde, 5-15% = laranja, > 15% = vermelho
      if (value < 5) return colors.success[500];
      if (value <= 15) return colors.warning[500];
      return colors.error[500];
    
    case 'averageResponseTime':
      // Tempo Médio de Resposta: < 24h = verde, 24-48h = laranja, > 48h = vermelho
      if (value < 24) return colors.success[500];
      if (value <= 48) return colors.warning[500];
      return colors.error[500];
    
    case 'averageFillTime':
      // Média de Preenchimento: < 7 dias = verde, 7-14 dias = laranja, > 14 dias = vermelho
      if (value < 7) return colors.success[500];
      if (value <= 14) return colors.warning[500];
      return colors.error[500];
    
    case 'totalDemandsCreated':
    case 'totalApplicationsReceived':
    case 'totalPositionsFilled':
    case 'professionalsHired':
      // Métricas de volume: sempre roxo (informativo)
      return colors.brand.primary[500];
    
    default:
      return colors.brand.primary[500];
  }
};

// Overview Tab Component
const OverviewTab: React.FC<{ 
  overview: ReportsOverview;
  overviewWithComparison: ReportsOverviewWithComparison;
}> = ({ overview, overviewWithComparison }) => {
  const summary = overview.summary;
  const { trends } = overviewWithComparison;
  
  // Calcular período para o texto do insight
  const periodDays = Math.ceil(
    (new Date(overview.period.end).getTime() - new Date(overview.period.start).getTime()) / (1000 * 60 * 60 * 24)
  );
  const periodText = periodDays === 7 ? 'última semana' : 
                     periodDays === 30 ? 'último mês' : 
                     periodDays === 90 ? 'últimos 3 meses' : 
                     'período selecionado';

  // Generate improved insight text with trends
  const generateInsightText = () => {
    const parts: React.ReactNode[] = [];
    
    parts.push('No ');
    parts.push(<strong key="period">{periodText}</strong>);
    parts.push(', sua clínica criou ');
    parts.push(<strong key="demands">{summary.totalDemandsCreated}</strong>);
    parts.push(` ${summary.totalDemandsCreated === 1 ? 'demanda' : 'demandas'}`);
    
    // Add trend for demands if significant
    if (trends.totalDemandsCreated && Math.abs(trends.totalDemandsCreated.value) > 10) {
      const trend = trends.totalDemandsCreated;
      const trendText = trend.isPositive ? 'aumentou' : 'diminuiu';
      parts.push(` (${trendText} ${Math.abs(trend.value).toFixed(1)}%`);
      if (overviewWithComparison.previous) {
        parts.push(' em relação ao período anterior');
      }
      parts.push(')');
    }
    
    parts.push(', recebeu ');
    parts.push(<strong key="applications">{summary.totalApplicationsReceived}</strong>);
    parts.push(` ${summary.totalApplicationsReceived === 1 ? 'candidatura' : 'candidaturas'}`);
    
    // Add trend for applications if significant
    if (trends.totalApplicationsReceived && Math.abs(trends.totalApplicationsReceived.value) > 10) {
      const trend = trends.totalApplicationsReceived;
      const trendText = trend.isPositive ? 'aumentou' : 'diminuiu';
      parts.push(` (${trendText} ${Math.abs(trend.value).toFixed(1)}%`);
      if (overviewWithComparison.previous) {
        parts.push(' em relação ao período anterior');
      }
      parts.push(')');
    }
    
    parts.push(' e contratou ');
    parts.push(<strong key="hired">{summary.professionalsHired}</strong>);
    parts.push(` ${summary.professionalsHired === 1 ? 'profissional' : 'profissionais'}`);
    
    // Add trend for hired if significant
    if (trends.professionalsHired && Math.abs(trends.professionalsHired.value) > 10) {
      const trend = trends.professionalsHired;
      const trendText = trend.isPositive ? 'aumentou' : 'diminuiu';
      parts.push(` (${trendText} ${Math.abs(trend.value).toFixed(1)}%`);
      if (overviewWithComparison.previous) {
        parts.push(' em relação ao período anterior');
      }
      parts.push(')');
    }
    
    parts.push(' — uma taxa de conversão de ');
    parts.push(<strong key="conversion">{summary.conversionRate.toFixed(1)}%</strong>);
    
    // Add trend for conversion rate if significant
    if (trends.conversionRate && Math.abs(trends.conversionRate.value) > 10) {
      const trend = trends.conversionRate;
      const trendText = trend.isPositive ? 'aumentou' : 'diminuiu';
      parts.push(` (${trendText} ${Math.abs(trend.value).toFixed(1)}%`);
      if (overviewWithComparison.previous) {
        parts.push(' em relação ao período anterior');
      }
      parts.push(')');
    }
    
    parts.push('.');
    
    return <>{parts}</>;
  };

  return (
    <div style={styles.tabContent}>
      <div style={styles.periodInfo}>
        <p style={styles.periodText}>
          Período: {formatDate(overview.period.start)} até {formatDate(overview.period.end)}
        </p>
      </div>

      {/* Insight Box */}
      <div style={styles.overviewInsightBox}>
        <div style={styles.overviewInsightIcon}>
          <TrendingUp size={16} color={colors.brand.primary[500]} />
        </div>
        <p style={styles.overviewInsightText}>
          {generateInsightText()}
        </p>
      </div>

      {/* Summary Cards - Grouped by Category */}
      
      {/* Bloco 1: Volume de Atividade */}
      <div style={styles.cardGroup}>
        <h4 style={styles.cardGroupTitle}>Volume de Atividade</h4>
        <div style={styles.summaryGrid} className="summary-grid">
          <MetricCard
            label="Demandas Criadas"
            value={summary.totalDemandsCreated}
            icon={ClipboardList}
            tooltip="Total de demandas criadas no período selecionado"
            trend={trends.totalDemandsCreated || null}
            color={getCardColor('totalDemandsCreated', summary.totalDemandsCreated)}
          />
          
          <MetricCard
            label="Candidaturas Recebidas"
            value={summary.totalApplicationsReceived}
            icon={FileText}
            tooltip="Total de candidaturas recebidas no período selecionado"
            trend={trends.totalApplicationsReceived || null}
            color={getCardColor('totalApplicationsReceived', summary.totalApplicationsReceived)}
          />
          
          <MetricCard
            label="Posições Preenchidas"
            value={summary.totalPositionsFilled}
            icon={CheckCircle}
            tooltip="Total de posições preenchidas no período selecionado"
            trend={trends.totalPositionsFilled || null}
            color={getCardColor('totalPositionsFilled', summary.totalPositionsFilled)}
          />
        </div>
      </div>

      {/* Bloco 2: Eficiência de Contratação */}
      <div style={styles.cardGroup}>
        <h4 style={styles.cardGroupTitle}>Eficiência de Contratação</h4>
        <div style={styles.summaryGrid} className="summary-grid">
          <MetricCard
            label="Profissionais Contratados"
            value={summary.professionalsHired}
            icon={Users}
            tooltip="Total de profissionais contratados no período selecionado"
            trend={trends.professionalsHired || null}
            color={getCardColor('professionalsHired', summary.professionalsHired)}
          />
          
          <MetricCard
            label="Taxa de Conversão"
            value={summary.conversionRate}
            icon={TrendingUp}
            tooltip="Percentual de candidaturas que foram aceitas (aceitas / total recebidas)"
            trend={trends.conversionRate || null}
            color={getCardColor('conversionRate', summary.conversionRate)}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          
          <MetricCard
            label="Tempo Médio de Resposta"
            value={summary.averageResponseTime}
            icon={Clock}
            tooltip="Tempo médio entre a criação da demanda e a primeira candidatura recebida"
            trend={trends.averageResponseTime || null}
            color={getCardColor('averageResponseTime', summary.averageResponseTime)}
            formatValue={(v) => `${v.toFixed(1)}h`}
          />
        </div>
      </div>

      {/* Bloco 3: Performance Operacional */}
      <div style={styles.cardGroup}>
        <h4 style={styles.cardGroupTitle}>Performance Operacional</h4>
        <div style={styles.summaryGrid} className="summary-grid">
          <MetricCard
            label="Média de Preenchimento"
            value={summary.averageFillTime}
            icon={Clock}
            tooltip="Tempo médio em dias entre a criação da posição e o preenchimento (aceitação do primeiro candidato)"
            trend={trends.averageFillTime || null}
            color={getCardColor('averageFillTime', summary.averageFillTime)}
            formatValue={(v) => `${v.toFixed(1)} dias`}
          />
          
          <MetricCard
            label="Taxa de Cancelamento"
            value={summary.cancellationRate}
            icon={XCircle}
            tooltip="Percentual de demandas canceladas em relação ao total criado"
            trend={trends.cancellationRate || null}
            color={getCardColor('cancellationRate', summary.cancellationRate)}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
        </div>
      </div>

      {/* Charts Side by Side */}
      <div style={styles.chartsContainer} className="charts-container">
      {/* Status Breakdown */}
        <div style={styles.chartSection}>
        <h3 style={styles.sectionTitle}>Status das Demandas</h3>
          
          {/* Insight Box */}
          {useMemo(() => {
            const insight = generateStatusInsight(overview.summary.demandsByStatus);
            return (
              <div style={styles.statusInsightBox}>
                <div style={styles.statusInsightIcon}>
                  <TrendingUp size={16} color={colors.brand.primary[500]} />
                </div>
                <p style={styles.statusInsightText}>
                  {insight}
                </p>
              </div>
            );
          }, [overview.summary.demandsByStatus])}

          <div style={styles.chartContainer}>
            <StatusPieChart data={overview.summary.demandsByStatus} />
        </div>
      </div>

      {/* Most Demanded Specialties */}
        {useMemo(() => {
          if (!overview.summary.mostDemandedSpecialties || overview.summary.mostDemandedSpecialties.length === 0) {
            return null;
          }

          const specialties = overview.summary.mostDemandedSpecialties;
          const totalPositions = overview.summary.totalPositionsCreated;
          
          return (
            <div style={styles.chartSection}>
              <h3 style={styles.sectionTitle}>Especialidades Mais Demandadas</h3>
              
              {/* Mini Resumo Analítico */}
              <div style={styles.analyticalSummary}>
                <div style={styles.analyticalSummaryIcon}>
                  <TrendingUp size={16} color={colors.brand.primary[500]} />
                </div>
                <p style={styles.analyticalSummaryText}>
                  {generateSpecialtiesInsight(specialties, totalPositions)}
                </p>
              </div>

              <div style={styles.chartContainer}>
                <SpecialtyBarChart 
                  data={specialties} 
                  totalDemands={overview.summary.totalDemandsCreated}
                />
              </div>
            </div>
          );
        }, [overview.summary.mostDemandedSpecialties, overview.summary.totalPositionsCreated, overview.summary.totalDemandsCreated])}
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
        <div style={styles.statusGrid} className="status-grid">
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

      {/* By Specialty - Taxa de Sucesso */}
      {Object.keys(demands.bySpecialty).length > 0 && (() => {
        // Process and sort specialties by success rate
        const specialtiesArray = Object.entries(demands.bySpecialty)
          .map(([specialty, data]) => {
            const created = Math.max(data.created || 0, 0);
            const filled = Math.max(Math.min(data.filled || 0, created), 0); // Ensure filled <= created
            let successRate = isNaN(data.successRate) || !isFinite(data.successRate) ? 0 : data.successRate;
            successRate = Math.max(Math.min(successRate, 100), 0); // Clamp between 0 and 100
            
            return {
              specialty,
              created,
              filled,
              successRate,
            };
          })
          .filter(item => item.created > 0) // Filter out specialties with no created positions
          .sort((a, b) => b.successRate - a.successRate); // Sort by success rate descending

        // Identify top 2 performers
        const topPerformers = specialtiesArray.slice(0, 2);
        const topPerformerSpecialties = new Set(
          topPerformers.map(item => item.specialty)
        );

        // Generate insight text for top performers
        const getTopPerformersText = () => {
          if (topPerformers.length === 0) {
            return 'Nenhuma especialidade com dados suficientes no período.';
          }
          if (topPerformers.length === 1) {
            return (
              <>
                Especialidade com melhor desempenho: <strong>{topPerformers[0].specialty}</strong> ({topPerformers[0].successRate.toFixed(1)}%)
              </>
            );
          }
          return (
            <>
              Especialidades com melhor desempenho: <strong>{topPerformers[0].specialty}</strong> ({topPerformers[0].successRate.toFixed(1)}%) e <strong>{topPerformers[1].specialty}</strong> ({topPerformers[1].successRate.toFixed(1)}%)
            </>
          );
        };

        return (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Taxa de Sucesso por Especialidade</h3>
            
            {/* Insight Box */}
            <div style={styles.analyticalSummary}>
              <div style={styles.analyticalSummaryIcon}>
                <TrendingUp size={16} color={colors.brand.primary[500]} />
                  </div>
              <p style={styles.analyticalSummaryText}>
                {getTopPerformersText()}
              </p>
                  </div>

            {/* Specialty Cards Grid */}
            {specialtiesArray.length > 0 ? (
              <div style={styles.specialtySuccessGrid} className="specialty-success-grid">
                {specialtiesArray.map((item, index) => (
                  <div
                    key={item.specialty}
                    style={{
                      ...styles.specialtyCardWrapper,
                      animationDelay: `${index * 0.1}s`,
                    }}
                  >
                    <SpecialtySuccessCard
                      specialty={item.specialty}
                      created={item.created}
                      filled={item.filled}
                      successRate={item.successRate}
                      isTopPerformer={topPerformerSpecialties.has(item.specialty)}
                    />
              </div>
            ))}
          </div>
            ) : (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Nenhuma especialidade encontrada no período selecionado</p>
                <p style={styles.emptySubtext}>Tente alterar o período ou os filtros de unidade para ver mais resultados</p>
        </div>
      )}
          </div>
        );
      })()}

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

// Helper function to generate professionals insight
const generateProfessionalsInsight = (
  hiredCount: number,
  bySpecialty: { [key: string]: number },
  averageHireTime: number
): React.ReactNode => {
  // Tratar valores nulos/undefined
  const safeHiredCount = hiredCount || 0;
  const safeAverageHireTime = averageHireTime || 0;
  const safeBySpecialty = bySpecialty || {};
  
  // Caso: nenhuma contratação
  if (safeHiredCount === 0) {
    return 'Nenhum profissional contratado neste período.';
  }

  const specialties = Object.keys(safeBySpecialty).filter(s => (safeBySpecialty[s] || 0) > 0);
  const totalSpecialties = specialties.length;

  // Caso: uma única especialidade
  if (totalSpecialties === 1) {
    const specialty = specialties[0];
    const count = safeBySpecialty[specialty] || 0;
    const parts: React.ReactNode[] = [];
    
    parts.push('Todas as ');
    parts.push(<strong key="count">{count}</strong>);
    parts.push(` ${count === 1 ? 'contratação foi' : 'contratações foram'} para `);
    parts.push(<strong key="specialty">{specialty}</strong>);
    parts.push('.');
    
    if (safeAverageHireTime > 0 && !isNaN(safeAverageHireTime) && isFinite(safeAverageHireTime)) {
      parts.push(' Tempo médio de contratação de ');
      parts.push(<strong key="time">{safeAverageHireTime.toFixed(1)}</strong>);
      parts.push(' dias.');
    }
    
    return <>{parts}</>;
  }

  // Caso: múltiplas especialidades
  const parts: React.ReactNode[] = [];
  
  // Ordenar especialidades por volume
  const sortedSpecialties = specialties
    .map(s => ({ name: s, count: safeBySpecialty[s] || 0 }))
    .sort((a, b) => b.count - a.count);
  
  const topSpecialty = sortedSpecialties[0];
  const secondSpecialty = sortedSpecialties.length > 1 ? sortedSpecialties[1] : null;
  
  parts.push('No período analisado, sua clínica contratou ');
  parts.push(<strong key="count">{safeHiredCount}</strong>);
  parts.push(` ${safeHiredCount === 1 ? 'profissional' : 'profissionais'} em `);
  parts.push(<strong key="specialties">{totalSpecialties}</strong>);
  parts.push(` ${totalSpecialties === 1 ? 'especialidade' : 'especialidades'}.`);
  
  if (topSpecialty) {
    parts.push(' A especialidade mais contratada foi ');
    parts.push(<strong key="top">{topSpecialty.name}</strong>);
    parts.push(` (${topSpecialty.count} ${topSpecialty.count === 1 ? 'profissional' : 'profissionais'})`);
    
    if (secondSpecialty && secondSpecialty.count === topSpecialty.count) {
      parts.push(', empatada com ');
      parts.push(<strong key="second">{secondSpecialty.name}</strong>);
    }
    
    parts.push('.');
  }
  
  if (safeAverageHireTime > 0 && !isNaN(safeAverageHireTime) && isFinite(safeAverageHireTime)) {
    parts.push(' Tempo médio de contratação de ');
    parts.push(<strong key="time">{safeAverageHireTime.toFixed(1)}</strong>);
    parts.push(' dias.');
  }
  
  return <>{parts}</>;
};

// Professionals Tab Component
const ProfessionalsTab: React.FC<{ professionals: ReportsProfessionals }> = ({ professionals }) => {
  const hiredCount = professionals.hired.length;
  const totalHired = hiredCount;
  
  // Processar especialidades: calcular percentuais e ordenar
  const specialtiesData = useMemo(() => {
    if (totalHired === 0) {
      return [];
    }

    return Object.entries(professionals.bySpecialty)
      .map(([specialty, count]) => {
        const safeCount = count || 0;
        const percentage = totalHired > 0 ? (safeCount / totalHired) * 100 : 0;
        const safePercentage = isNaN(percentage) || !isFinite(percentage) ? 0 : percentage;
        
        return {
          specialty,
          count: safeCount,
          percentage: safePercentage,
        };
      })
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count); // Ordenar por volume (maior para menor)
  }, [professionals.bySpecialty, totalHired]);

  // Identificar especialidade mais contratada
  const topHiredSpecialty = specialtiesData.length > 0 ? specialtiesData[0].specialty : null;

  // Gerar insight
  const insight = useMemo(() => {
    return generateProfessionalsInsight(
      hiredCount,
      professionals.bySpecialty,
      professionals.averageHireTime
    );
  }, [hiredCount, professionals.bySpecialty, professionals.averageHireTime]);

  return (
    <div style={styles.tabContent}>
      <div style={styles.periodInfo}>
        <p style={styles.periodText}>
          Período: {formatDate(professionals.period.start)} até {formatDate(professionals.period.end)}
        </p>
      </div>

      {/* Bloco 1: Panorama Geral */}
      {/* Insight Box */}
      <div style={styles.overviewInsightBox}>
        <div style={styles.overviewInsightIcon}>
          <TrendingUp size={16} color={colors.brand.primary[500]} />
        </div>
        <p style={styles.overviewInsightText}>
          {insight}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid} className="summary-grid">
        <MetricCard
          label="Profissionais Contratados"
          value={hiredCount}
          icon={Users}
          tooltip="Total de profissionais contratados no período selecionado"
          color={getCardColor('professionalsHired', hiredCount)}
        />

        <MetricCard
          label="Tempo Médio de Contratação"
          value={professionals.averageHireTime}
          icon={Clock}
          tooltip="Tempo médio em dias entre a criação da posição e a aceitação da candidatura"
          color={getCardColor('averageFillTime', professionals.averageHireTime)}
          formatValue={(v) => `${v.toFixed(1)} dias`}
        />
      </div>

      {/* Bloco 2: Contratações por Especialidade */}
      {specialtiesData.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Contratações por Especialidade</h3>
          <div style={styles.specialtySuccessGrid} className="specialty-success-grid">
            {specialtiesData.map((item, index) => (
              <div
                key={item.specialty}
                style={{
                  ...styles.specialtyCardWrapper,
                  animationDelay: `${index * 0.1}s`,
                }}
              >
                <SpecialtyHireCard
                  specialty={item.specialty}
                  count={item.count}
                  percentage={item.percentage}
                  isTopHired={item.specialty === topHiredSpecialty}
                />
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
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    borderColor: colors.brand.primary[500],
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
    borderBottomColor: colors.brand.primary[500],
    color: colors.brand.primary[500],
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
    borderTop: '4px solid ' + colors.brand.primary[500],
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
    backgroundColor: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[300]}`,
    borderRadius: '8px',
    marginBottom: '20px',
  },
  analyticalSummaryIcon: {
    flexShrink: 0,
  },
  analyticalSummaryText: {
    fontSize: '14px',
    color: colors.brand.primary[600],
    margin: 0,
    lineHeight: '1.5',
  },
  statusInsightBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[300]}`,
    borderRadius: '8px',
    marginBottom: '20px',
  },
  statusInsightIcon: {
    flexShrink: 0,
  },
  statusInsightText: {
    fontSize: '14px',
    color: colors.brand.primary[600],
    margin: 0,
    lineHeight: '1.5',
  },
  overviewInsightBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[300]}`,
    borderRadius: '12px',
    marginBottom: '32px',
  },
  overviewInsightIcon: {
    flexShrink: 0,
  },
  overviewInsightText: {
    fontSize: '14px',
    color: colors.brand.primary[600],
    margin: 0,
    lineHeight: '1.6',
  },
  cardGroup: {
    marginBottom: '32px',
  },
  cardGroupTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '2px solid #e5e5e5',
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
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
    marginTop: '16px',
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
  specialtySuccessGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  specialtyCardWrapper: {
    animation: 'fadeInUp 0.5s ease-out forwards',
    opacity: 0,
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
    color: colors.brand.primary[500],
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
    color: colors.brand.primary[500],
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
    backgroundColor: colors.brand.primary[500],
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

