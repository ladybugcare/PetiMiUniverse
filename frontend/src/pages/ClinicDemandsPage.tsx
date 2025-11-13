import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import PositionApplicationsManager from '../components/PositionApplicationsManager';
import LoadingOverlay from '../components/LoadingOverlay';
import { demandsApi } from '../services/demandsApi';
import { demandPositionsApi, DemandPosition } from '../services/demandPositionsApi';
import { unitsApi } from '../services/unitsApi';
import { Unit } from '../types/units';
import { useAlert } from '../hooks/useAlert';
import { PlusCircle, Clock, ChevronDown, ChevronUp, Calendar, MapPin, DollarSign } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';

interface DemandWithPositions {
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
  positions?: DemandPosition[];
}

const ClinicDemandsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showError } = useAlert();
  const [demands, setDemands] = useState<DemandWithPositions[]>([]);
  const [units, setUnits] = useState<Map<string, Unit>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedDemands, setExpandedDemands] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'this_month'>('all');
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

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

  // Get clinic ID
  const clinicUserStr = localStorage.getItem('clinic_user');
  const clinicUser = clinicUserStr ? JSON.parse(clinicUserStr) : null;
  const clinicId = clinicUser?.clinic_id || user?.user_metadata?.clinic_id || user?.id;

  useEffect(() => {
    if (!clinicId) {
      showError('Clínica não identificada');
      navigate('/clinic-dashboard');
      return;
    }
    loadData();
    loadSpecialtiesNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar demandas e unidades em paralelo
      // Usar getRecentActivity como alternativa já que /demands/clinic/:id não existe
      const [demandsResult, unitsResult] = await Promise.all([
        demandsApi.getRecentActivity(clinicId, undefined, 1000).catch(() => ({ demands: [] })),
        unitsApi.getByClinic(clinicId).catch(() => ({ units: [] })),
      ]);
      
      const demandsList = demandsResult.demands || [];
      
      // Criar mapa de unidades
      const unitsMap = new Map<string, Unit>();
      unitsResult.units.forEach(unit => {
        unitsMap.set(unit.id, unit);
      });
      setUnits(unitsMap);
      
      // Carregar posições para cada demanda
      const demandsWithPositions = await Promise.all(
        demandsList.map(async (demand) => {
          try {
            const positionsResult = await demandPositionsApi.getDemandWithPositions(demand.id);
            return {
              ...demand,
              positions: positionsResult.positions || [],
            };
          } catch (error) {
            console.error(`Erro ao carregar posições da demanda ${demand.id}:`, error);
            return {
              ...demand,
              positions: [],
            };
          }
        })
      );
      
      setDemands(demandsWithPositions);
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      showError('Erro ao carregar demandas: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const toggleDemand = (demandId: string) => {
    setExpandedDemands(prev => {
      const newSet = new Set(prev);
      if (newSet.has(demandId)) {
        newSet.delete(demandId);
      } else {
        newSet.add(demandId);
      }
      return newSet;
    });
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
    // Se já está no formato HH:MM:SS, pegar apenas HH:MM
    return timeString.substring(0, 5);
  };

  // Filtrar demandas
  const filteredDemands = useMemo(() => {
    let filtered = [...demands];

    // Filtro por status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }

    // Filtro por data
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(demand => {
        const demandDate = new Date(demand.demand_date);
        demandDate.setHours(0, 0, 0, 0);
        
        switch (dateFilter) {
          case 'today':
            return demandDate.getTime() === today.getTime();
          case 'this_week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            return demandDate >= weekStart;
          case 'this_month':
            return demandDate.getMonth() === today.getMonth() && 
                   demandDate.getFullYear() === today.getFullYear();
          default:
            return true;
        }
      });
    }

    // Ordenar por data (mais recente primeiro)
    filtered.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [demands, statusFilter, dateFilter]);

  return (
    <>
      <DashboardLayout pageName="Minhas Demandas" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>Minhas Demandas</h1>
              <p style={styles.subtitle}>
                Visualize e gerencie todas as demandas criadas pela sua clínica
              </p>
            </div>
            <button
              onClick={() => navigate('/create-demand')}
              style={styles.createButton}
            >
              <PlusCircle size={20} />
              Criar Nova Demanda
            </button>
          </div>

          {/* Filtros */}
          <div style={styles.filtersBar}>
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">Todas</option>
                <option value="open">Aberta</option>
                <option value="in_progress">Em Andamento</option>
                <option value="closed">Fechada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Data</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                style={styles.filterSelect}
              >
                <option value="all">Todas</option>
                <option value="today">Hoje</option>
                <option value="this_week">Esta Semana</option>
                <option value="this_month">Este Mês</option>
              </select>
            </div>

            <div style={styles.resultsCount}>
              {filteredDemands.length} demanda{filteredDemands.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Lista de Demandas */}
          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Carregando demandas...</p>
            </div>
          ) : filteredDemands.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📋</div>
              <h3 style={styles.emptyTitle}>Nenhuma demanda encontrada</h3>
              <p style={styles.emptyText}>
                {statusFilter !== 'all' || dateFilter !== 'all'
                  ? 'Tente ajustar os filtros para encontrar mais resultados.'
                  : 'Você ainda não criou nenhuma demanda. Crie sua primeira demanda agora!'}
              </p>
              <button
                onClick={() => navigate('/create-demand')}
                style={styles.createButton}
              >
                <PlusCircle size={20} />
                Criar Primeira Demanda
              </button>
            </div>
          ) : (
            <div style={styles.demandsList}>
              {filteredDemands.map((demand) => {
                const isExpanded = expandedDemands.has(demand.id);
                const hasPositions = demand.positions && demand.positions.length > 0;
                
                return (
                  <div key={demand.id} style={styles.demandCard}>
                    {/* Header da Demanda */}
                    <div
                      style={styles.demandHeader}
                      onClick={() => toggleDemand(demand.id)}
                    >
                      <div style={styles.demandHeaderLeft}>
                        <h2 style={styles.demandTitle}>{demand.title}</h2>
                        <div style={styles.demandMeta}>
                          <span style={styles.metaItem}>
                            <Calendar size={14} />
                            {formatDate(demand.demand_date)}
                          </span>
                          <span style={styles.metaItem}>
                            <Clock size={14} />
                            {formatTime(demand.start_time)}
                            {demand.end_time && ` - ${formatTime(demand.end_time)}`}
                          </span>
                          {demand.is_composite && (
                            <span style={styles.compositeBadge}>
                              Múltiplas Posições
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={styles.demandHeaderRight}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: getStatusColor(demand.status),
                          }}
                        >
                          {getStatusLabel(demand.status)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={20} style={styles.expandIcon} />
                        ) : (
                          <ChevronDown size={20} style={styles.expandIcon} />
                        )}
                      </div>
                    </div>

                    {/* Conteúdo Expandido */}
                    {isExpanded && (
                      <div style={styles.demandContent}>
                        {/* Informações da Demanda */}
                        <div style={styles.demandInfoSection}>
                          <h3 style={styles.sectionTitle}>Informações da Demanda</h3>
                          <div style={styles.infoGrid}>
                            <div style={styles.infoItem}>
                              <strong>Descrição:</strong>
                              <p style={styles.description}>{demand.description || 'Sem descrição'}</p>
                            </div>
                            <div style={styles.infoItem}>
                              <strong>Categoria:</strong>
                              <span>{demand.category}</span>
                            </div>
                            <div style={styles.infoItem}>
                              <strong>Criada em:</strong>
                              <span>{new Date(demand.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                            {demand.unit_id && (
                              <div style={styles.infoItem}>
                                <strong>Unidade:</strong>
                                <span>{units.get(demand.unit_id)?.name || demand.unit_id}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Posições */}
                        {hasPositions ? (
                          <div style={styles.positionsSection}>
                            <h3 style={styles.sectionTitle}>
                              Posições ({demand.positions!.length})
                            </h3>
                            {demand.positions!.map((position) => (
                              <div key={position.id} style={styles.positionCard}>
                                <div style={styles.positionHeader}>
                                  <div style={styles.positionHeaderLeft}>
                                    <h4 style={styles.positionTitle}>
                                      {position.specialties && position.specialties.length > 0 ? (
                                        <div style={styles.specialtiesContainer}>
                                          {position.specialties.map((spec: string, idx: number) => (
                                            <span key={idx} style={styles.specialtyBadge}>
                                              {getSpecialtyName(spec)}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        position.specialty || 'Posição'
                                      )}
                                    </h4>
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
                                      <p style={styles.positionDescription}>
                                        {position.description}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Aplicações da Posição */}
                                <div style={styles.applicationsSection}>
                                  <PositionApplicationsManager
                                    positionId={position.id}
                                    positionDetails={{
                                      specialty:
                                        position.specialties && position.specialties.length > 0
                                          ? position.specialties.map((spec: string) => getSpecialtyName(spec)).join(', ')
                                          : position.specialty || 'Posição',
                                      total_slots: position.total_slots,
                                      filled_slots: position.filled_slots,
                                    }}
                                    onApplicationAccepted={() => {
                                      // Recarregar dados após aceitar candidatura
                                      loadData();
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={styles.noPositions}>
                            <p>Esta demanda não possui posições cadastradas.</p>
                            <p style={styles.noPositionsSubtext}>
                              Posições são criadas automaticamente ao criar uma demanda composta.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
      <LoadingOverlay visible={loading} label="Carregando demandas..." />
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  createButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
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
  filtersBar: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end',
    marginBottom: '24px',
    padding: '20px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    color: '#404040',
  },
  filterSelect: {
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '150px',
  },
  resultsCount: {
    marginLeft: 'auto',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    padding: '10px 0',
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
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '24px',
  },
  emptyTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
    marginBottom: '24px',
  },
  demandsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  demandHeader: {
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.2s ease',
  },
  demandHeaderLeft: {
    flex: 1,
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '12px',
  },
  demandMeta: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  compositeBadge: {
    padding: '4px 10px',
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  demandHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusBadge: {
    padding: '6px 14px',
    borderRadius: '16px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  expandIcon: {
    color: '#737373',
    cursor: 'pointer',
  },
  demandContent: {
    padding: '24px',
  },
  demandInfoSection: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #f3f4f6',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  infoItem: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
  },
  description: {
    marginTop: '8px',
    lineHeight: '1.6',
    color: '#737373',
  },
  positionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  positionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #e5e5e5',
  },
  positionHeader: {
    marginBottom: '20px',
  },
  positionHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  positionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  positionMeta: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  noPositionsSubtext: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#a3a3a3',
  },
  specialtiesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
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

export default ClinicDemandsPage;

