import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import CalendarView from '../components/CalendarView';
import LoadingOverlay from '../components/LoadingOverlay';
import SearchBar from '../components/SearchBar';
import { demandsApi, clinicsApi, applicationsApi, specialtiesApi } from '../services';
import { Demand } from '../services/demandsApi';
import { useAlert } from '../hooks/useAlert';
import { getUserRole, type Role as AuthRole } from '../utils/authHelpers';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { Search, Filter, X, Clock, MapPin, DollarSign, PlusCircle, UserPlus } from 'lucide-react';
import colors from '../styles/colors';
import InviteVetModal from '../components/InviteVetModal';

interface Clinic {
  id: string;
  name: string;
  address: string;
}

type SortOption = 'date_asc' | 'date_desc' | 'payment_asc' | 'payment_desc' | 'title_asc' | 'title_desc';
type DateFilter = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

const DemandsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, showWarning } = useAlert();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [specialties, setSpecialties] = useState<Array<{ id: string; name: string }>>([]);
  const [userApplications, setUserApplications] = useState<string[]>([]); // IDs das demandas já aplicadas
  const [loading, setLoading] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteDemandId, setInviteDemandId] = useState<string | null>(null);
  
  // Load view mode from localStorage
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    const saved = localStorage.getItem('demandsViewMode');
    return (saved === 'list' || saved === 'calendar') ? saved : 'list';
  });
  
  const [fabHovered, setFabHovered] = useState(false);

  // Filters and search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [minPayment, setMinPayment] = useState<number | ''>('');
  const [maxPayment, setMaxPayment] = useState<number | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date_asc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const user = JSON.parse(localStorage.getItem('user') || '');
  const userRole: AuthRole | null = user ? getUserRole(user) : null;
  const rawUserRole = user?.user_metadata?.role || user?.role;
  
  // Get status filter from query params (legacy support)
  const queryStatusFilter = searchParams.get('status');

  // Verificar se vet está aprovado
  useEffect(() => {
    if (userRole === 'VET') {
      const vetOnboardingStr = localStorage.getItem('vetOnboarding');
      if (vetOnboardingStr && vetOnboardingStr.trim() !== '') {
        try {
          const vetOnboarding = JSON.parse(vetOnboardingStr);
          if (!vetOnboarding.isApproved) {
            showWarning('Você precisa estar aprovado para visualizar e se candidatar às demandas. Seu cadastro está em análise.');
            navigate('/vet-dashboard', { replace: true });
          }
        } catch (e) {
          console.error('Erro ao verificar aprovação:', e);
        }
      }
    }
  }, [userRole, navigate, showWarning]);

  // Load filters from localStorage
  useEffect(() => {
    const savedFilters = localStorage.getItem('demandsFilters');
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters);
        if (filters.statusFilter) setStatusFilter(filters.statusFilter);
        if (filters.dateFilter) setDateFilter(filters.dateFilter);
        if (filters.selectedSpecialties) setSelectedSpecialties(filters.selectedSpecialties);
        if (filters.minPayment !== undefined) setMinPayment(filters.minPayment);
        if (filters.maxPayment !== undefined) setMaxPayment(filters.maxPayment);
        if (filters.sortBy) setSortBy(filters.sortBy);
      } catch (e) {
        console.error('Erro ao carregar filtros salvos:', e);
      }
    }
  }, []);

  // Save view mode to localStorage
  useEffect(() => {
    localStorage.setItem('demandsViewMode', viewMode);
  }, [viewMode]);

  // Save filters to localStorage
  useEffect(() => {
    const filters = {
      statusFilter,
      dateFilter,
      selectedSpecialties,
      minPayment,
      maxPayment,
      sortBy,
    };
    localStorage.setItem('demandsFilters', JSON.stringify(filters));
  }, [statusFilter, dateFilter, selectedSpecialties, minPayment, maxPayment, sortBy]);

  // Keep search expanded if there's text
  useEffect(() => {
    if (searchQuery && !isSearchExpanded) {
      setIsSearchExpanded(true);
    }
  }, [searchQuery]);

  // Get menu items using hook
  const roleForMenu = userRole || rawUserRole || 'UNKNOWN';
  const { menuItems } = useSidebarMenu(roleForMenu);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar demandas abertas (filtered by user role and user_id for clinics)
      const demandsResult = await demandsApi.getOpen(userRole || undefined, user.id);
      setDemands(demandsResult.demands);
      
      // Carregar clínicas
      const clinicsResult = await clinicsApi.getAll();
      setClinics(clinicsResult.clinics);
      
      // Carregar especialidades
      try {
        const specialtiesResult = await specialtiesApi.getAll();
        setSpecialties(specialtiesResult.specialties.map(s => ({ id: s.name, name: s.name })));
      } catch (e) {
        console.error('Erro ao carregar especialidades:', e);
      }
      
      // Carregar aplicações do usuário (para vets)
      if (userRole === 'VET' && user?.id) {
        try {
          const applicationsResult = await applicationsApi.getByVet(user.id);
          setUserApplications(applicationsResult.applications.map(app => app.demand_id));
        } catch (e) {
          console.error('Erro ao carregar aplicações:', e);
        }
      }
      
    } catch (error: any) {
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Debounce search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getClinicName = useCallback((clinicId: string) => {
    const clinic = clinics.find(c => c.id === clinicId);
    return clinic?.name || 'Clínica não encontrada';
  }, [clinics]);

  // Filter and sort demands
  const filteredAndSortedDemands = useMemo(() => {
    let filtered = [...demands];

    // Apply query status filter (legacy support)
    if (queryStatusFilter === 'open') {
      filtered = filtered.filter(demand => demand.status === 'open');
    }

    // Apply search query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(demand =>
        demand.title.toLowerCase().includes(query) ||
        demand.description.toLowerCase().includes(query) ||
        getClinicName(demand.clinic_id).toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(demand => demand.status === statusFilter);
    }

    // Apply date filter
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

    // Apply specialties filter
    if (selectedSpecialties.length > 0) {
      filtered = filtered.filter(demand =>
        demand.required_specialties?.some(spec =>
          selectedSpecialties.includes(spec)
        )
      );
    }

    // Apply payment filter
    if (minPayment !== '') {
      filtered = filtered.filter(demand => 
        demand.payment && demand.payment >= Number(minPayment)
      );
    }
    if (maxPayment !== '') {
      filtered = filtered.filter(demand => 
        demand.payment && demand.payment <= Number(maxPayment)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(a.demand_date).getTime() - new Date(b.demand_date).getTime();
        case 'date_desc':
          return new Date(b.demand_date).getTime() - new Date(a.demand_date).getTime();
        case 'payment_asc':
          return (a.payment || 0) - (b.payment || 0);
        case 'payment_desc':
          return (b.payment || 0) - (a.payment || 0);
        case 'title_asc':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [demands, debouncedSearchQuery, statusFilter, dateFilter, selectedSpecialties, minPayment, maxPayment, sortBy, queryStatusFilter, getClinicName]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedDemands.length / itemsPerPage);
  const paginatedDemands = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedDemands.slice(start, start + itemsPerPage);
  }, [filteredAndSortedDemands, currentPage, itemsPerPage]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFilter('all');
    setSelectedSpecialties([]);
    setMinPayment('');
    setMaxPayment('');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || dateFilter !== 'all' || 
    selectedSpecialties.length > 0 || minPayment !== '' || maxPayment !== '';

  const handleApply = async (demand: Demand) => {
    if (userRole !== 'VET') {
      // Se for clínica (CADMIN ou CMANAGER), navegar para página de detalhes para gerenciar candidaturas
      if (userRole === 'CADMIN' || userRole === 'CMANAGER' || rawUserRole?.toLowerCase() === 'clinic') {
        navigate(`/demands/${demand.id}`);
        return;
      }
      showWarning('Apenas veterinários podem se candidatar a demandas');
      return;
    }
    setSelectedDemand(demand);
  };

  const submitApplication = async () => {
    if (!selectedDemand) return;

    try {
      setIsApplying(true);
      await applicationsApi.apply({
        demand_id: selectedDemand.id,
        vet_id: user.id,
        message: applicationMessage,
      });

      showSuccess('Candidatura enviada com sucesso!');
      setSelectedDemand(null);
      setApplicationMessage('');
      
      // Reload user applications
      if (userRole === 'VET' && user.id) {
        try {
          const applicationsResult = await applicationsApi.getByVet(user.id);
          setUserApplications(applicationsResult.applications.map(app => app.demand_id));
        } catch (e) {
          console.error('Erro ao recarregar aplicações:', e);
        }
      }
    } catch (error: any) {
      showError('Erro ao enviar candidatura: ' + error.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
    <DashboardLayout
      pageName="Demandas"
      menuItems={menuItems}
    >
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Demandas Abertas</h1>
            <p style={styles.subtitle}>
              Encontre oportunidades de trabalho na sua área
            </p>
          </div>

          {/* View Toggle */}
          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'list' && styles.toggleButtonActive),
              }}
            >
              📋 Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'calendar' && styles.toggleButtonActive),
              }}
            >
              📅 Calendário
            </button>
          </div>
        </div>

        {/* Search and Filters Bar - Only show in list mode */}
        {viewMode === 'list' && (
          <div style={styles.searchFiltersBar}>
            <div style={styles.searchContainer}>
              <SearchBar
                placeholder="Buscar por título, descrição ou clínica..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
            
            <div style={styles.controlsRow}>
              <div style={styles.controlsLeft}>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  style={{
                    ...styles.filterButton,
                    ...(showFilters && styles.filterButtonActive),
                  }}
                >
                  <Filter size={16} />
                  Filtros
                  {hasActiveFilters && (
                    <span style={styles.filterBadge}>
                      {[
                        statusFilter !== 'all' ? 1 : 0,
                        dateFilter !== 'all' ? 1 : 0,
                        selectedSpecialties.length,
                        minPayment !== '' ? 1 : 0,
                        maxPayment !== '' ? 1 : 0,
                      ].reduce((a, b) => a + b, 0)}
                    </span>
                  )}
                </button>
                
                {hasActiveFilters && (
                  <button onClick={clearFilters} style={styles.clearFiltersButton}>
                    <X size={14} />
                    Limpar filtros
                  </button>
                )}
              </div>

              <div style={styles.sortContainer}>
                <label style={styles.sortLabel}>Ordenar por:</label>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as SortOption);
                    setCurrentPage(1);
                  }}
                  style={styles.sortSelect}
                >
                  <option value="date_asc">Data (mais antiga)</option>
                  <option value="date_desc">Data (mais recente)</option>
                  <option value="payment_desc">Pagamento (maior)</option>
                  <option value="payment_asc">Pagamento (menor)</option>
                  <option value="title_asc">Título (A-Z)</option>
                  <option value="title_desc">Título (Z-A)</option>
                </select>
              </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div style={styles.filtersPanel}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    style={styles.filterSelect}
                  >
                    <option value="all">Todos</option>
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
                    onChange={(e) => {
                      setDateFilter(e.target.value as DateFilter);
                      setCurrentPage(1);
                    }}
                    style={styles.filterSelect}
                  >
                    <option value="all">Todas</option>
                    <option value="today">Hoje</option>
                    <option value="this_week">Esta Semana</option>
                    <option value="this_month">Este Mês</option>
                  </select>
                </div>

                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Especialidades</label>
                  <select
                    multiple
                    value={selectedSpecialties}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setSelectedSpecialties(selected);
                      setCurrentPage(1);
                    }}
                    style={styles.filterSelectMultiple}
                  >
                    {specialties.map(spec => (
                      <option key={spec.id} value={spec.name}>{spec.name}</option>
                    ))}
                  </select>
                  {selectedSpecialties.length > 0 && (
                    <div style={styles.selectedSpecialties}>
                      {selectedSpecialties.map(spec => (
                        <span key={spec} style={styles.specialtyTag}>
                          {spec}
                          <button
                            onClick={() => {
                              setSelectedSpecialties(selectedSpecialties.filter(s => s !== spec));
                              setCurrentPage(1);
                            }}
                            style={styles.tagRemove}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Pagamento</label>
                  <div style={styles.paymentRange}>
                    <input
                      type="number"
                      placeholder="Mínimo"
                      value={minPayment}
                      onChange={(e) => {
                        setMinPayment(e.target.value === '' ? '' : Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      style={styles.paymentInput}
                      min="0"
                    />
                    <span style={styles.paymentSeparator}>-</span>
                    <input
                      type="number"
                      placeholder="Máximo"
                      value={maxPayment}
                      onChange={(e) => {
                        setMaxPayment(e.target.value === '' ? '' : Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      style={styles.paymentInput}
                      min="0"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Results count */}
            <div style={styles.resultsCount}>
              {filteredAndSortedDemands.length === 0 ? (
                <span>Nenhuma demanda encontrada</span>
              ) : (
                <span>
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1}-
                  {Math.min(currentPage * itemsPerPage, filteredAndSortedDemands.length)} de{' '}
                  {filteredAndSortedDemands.length} demanda{filteredAndSortedDemands.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {filteredAndSortedDemands.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📋</div>
            <h3 style={styles.emptyTitle}>
              Nenhuma demanda encontrada
            </h3>
            <p style={styles.emptyText}>
              {hasActiveFilters 
                ? 'Tente ajustar os filtros para encontrar mais resultados.'
                : 'No momento não há demandas disponíveis. Volte mais tarde!'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={styles.clearFiltersButton}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <>
            <div style={styles.demandsGrid}>
              {paginatedDemands.map((demand) => {
                const hasApplied = userApplications.includes(demand.id);
                const demandDate = new Date(demand.demand_date);
                const isPast = demandDate < new Date();
                
                return (
                  <div 
                    key={demand.id} 
                    style={{
                      ...styles.demandCard,
                      ...(hasApplied && styles.demandCardApplied),
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                    }}
                  >
                    <div style={styles.cardHeader}>
                      <h2 style={styles.demandTitle}>{demand.title}</h2>
                      <span
                        style={{
                          ...styles.statusBadge,
                          backgroundColor: 
                            demand.status === 'open' ? '#22c55e' :
                            demand.status === 'in_progress' ? '#f59e0b' :
                            demand.status === 'closed' ? '#6b7280' : '#ef4444',
                        }}
                      >
                        {demand.status === 'open' ? 'Aberta' : 
                         demand.status === 'in_progress' ? 'Em Andamento' :
                         demand.status === 'closed' ? 'Fechada' : 'Cancelada'}
                      </span>
                    </div>

                    <p style={styles.demandDescription}>{demand.description}</p>

                    {/* Additional Info */}
                    <div style={styles.cardInfoRow}>
                      <div style={styles.infoItem}>
                        <Clock size={14} style={styles.infoIcon} />
                        <span style={styles.infoText}>
                          {demand.start_time} ({demand.duration_hours}h)
                        </span>
                      </div>
                      <div style={styles.infoItem}>
                        <span style={styles.infoText}>
                          {demandDate.toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric' 
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Specialties */}
                    {demand.required_specialties && demand.required_specialties.length > 0 && (
                      <div style={styles.specialtiesContainer}>
                        {demand.required_specialties.slice(0, 3).map((spec, idx) => (
                          <span key={idx} style={styles.specialtyBadge}>
                            {spec}
                          </span>
                        ))}
                        {demand.required_specialties.length > 3 && (
                          <span style={styles.specialtyBadge}>
                            +{demand.required_specialties.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div style={styles.cardFooter}>
                      <div style={styles.demandInfo}>
                        <div style={styles.clinicInfo}>
                          <MapPin size={14} style={styles.clinicIcon} />
                          <span style={styles.clinicName}>
                            {getClinicName(demand.clinic_id)}
                          </span>
                        </div>
                        {demand.payment && (
                          <div style={styles.paymentContainer}>
                            <DollarSign size={16} style={styles.paymentIcon} />
                            <span style={styles.payment}>
                              R$ {demand.payment.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={styles.demandActions}>
                        {hasApplied && (
                          <span style={styles.appliedBadge}>
                            ✓ Candidatura enviada
                          </span>
                        )}
                        {userRole === 'VET' && (
                          <div style={styles.actionButtonsContainer}>
                            {!hasApplied && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApply(demand);
                                }}
                                style={styles.applyButton}
                              >
                                Candidatar-se
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/demands/${demand.id}`);
                              }}
                              style={styles.viewDetailsButton}
                            >
                              Ver Detalhes
                            </button>
                          </div>
                        )}
                        {userRole !== 'VET' && (
                          <>
                            {(userRole === 'CADMIN' || userRole === 'CMANAGER' || rawUserRole?.toLowerCase() === 'clinic') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInviteDemandId(demand.id);
                                  setShowInviteModal(true);
                                }}
                                style={{
                                  ...styles.viewDetailsButton,
                                  backgroundColor: colors.primary,
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginRight: '8px',
                                }}
                              >
                                <UserPlus size={16} />
                                Convidar Vet
                              </button>
                            )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/demands/${demand.id}`);
                            }}
                            style={styles.viewDetailsButton}
                          >
                            Ver Detalhes
                          </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={styles.pagination}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  style={{
                    ...styles.paginationButton,
                    ...(currentPage === 1 && styles.paginationButtonDisabled),
                  }}
                >
                  Anterior
                </button>
                
                <div style={styles.paginationNumbers}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          ...styles.paginationNumber,
                          ...(currentPage === pageNum && styles.paginationNumberActive),
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    ...styles.paginationButton,
                    ...(currentPage === totalPages && styles.paginationButtonDisabled),
                  }}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <CalendarView
              demands={filteredAndSortedDemands}
              getClinicName={getClinicName}
              userRole={userRole || undefined}
              userApplications={userApplications}
              onApply={(demand) => {
                if (userRole === 'VET') {
                  handleApply(demand);
                }
              }}
              onViewDetails={(demandId) => {
                navigate(`/demands/${demandId}`);
              }}
              filters={
                <div style={styles.searchFiltersBar}>
                  <div style={styles.controlsRow}>
                    <div style={styles.controlsLeft}>
                      {/* Expandable Search */}
                      <div style={{
                        ...styles.expandableSearchContainer,
                        width: isSearchExpanded ? '300px' : '40px',
                        transition: 'width 0.3s ease',
                      }}>
                        {isSearchExpanded ? (
                          <div style={styles.searchInputWrapper}>
                            <Search size={16} style={styles.searchIcon} />
                            <input
                              type="text"
                              placeholder="Buscar por título, descrição ou clínica..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onBlur={(e) => {
                                // Não fechar se o usuário clicar no botão de limpar
                                const relatedTarget = e.relatedTarget as HTMLElement;
                                if (!relatedTarget || !relatedTarget.closest('.clear-search-button')) {
                                  if (!searchQuery) {
                                    setIsSearchExpanded(false);
                                  }
                                }
                              }}
                              autoFocus
                              style={styles.expandableSearchInput}
                            />
                            {searchQuery && (
                              <button
                                className="clear-search-button"
                                onClick={() => {
                                  setSearchQuery('');
                                  setIsSearchExpanded(false);
                                }}
                                style={styles.clearSearchButton}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fee2e2';
                                  e.currentTarget.style.color = '#dc2626';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.color = '#737373';
                                }}
                                title="Limpar busca"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsSearchExpanded(true)}
                            style={{
                              ...styles.searchToggleButton,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#ede9fe';
                              e.currentTarget.style.color = '#7c3aed';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#f5f5f5';
                              e.currentTarget.style.color = '#737373';
                            }}
                            title="Buscar"
                          >
                            <Search size={16} />
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setShowFilters(!showFilters)}
                        style={{
                          ...styles.filterButton,
                          ...(showFilters && styles.filterButtonActive),
                        }}
                      >
                        <Filter size={16} />
                        Filtros
                        {hasActiveFilters && (
                          <span style={styles.filterBadge}>
                            {[
                              statusFilter !== 'all' ? 1 : 0,
                              dateFilter !== 'all' ? 1 : 0,
                              selectedSpecialties.length,
                              minPayment !== '' ? 1 : 0,
                              maxPayment !== '' ? 1 : 0,
                            ].reduce((a, b) => a + b, 0)}
                          </span>
                        )}
                      </button>
                      
                      {hasActiveFilters && (
                        <button onClick={clearFilters} style={styles.clearFiltersButton}>
                          <X size={14} />
                          Limpar filtros
                        </button>
                      )}
                    </div>

                    <div style={styles.sortContainer}>
                      <label style={styles.sortLabel}>Ordenar por:</label>
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          setSortBy(e.target.value as SortOption);
                          setCurrentPage(1);
                        }}
                        style={styles.sortSelect}
                      >
                        <option value="date_asc">Data (mais antiga)</option>
                        <option value="date_desc">Data (mais recente)</option>
                        <option value="payment_desc">Pagamento (maior)</option>
                        <option value="payment_asc">Pagamento (menor)</option>
                        <option value="title_asc">Título (A-Z)</option>
                        <option value="title_desc">Título (Z-A)</option>
                      </select>
                    </div>
                  </div>

                  {/* Filters Panel */}
                  {showFilters && (
                    <div style={styles.filtersPanel}>
                      <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Status</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          style={styles.filterSelect}
                        >
                          <option value="all">Todos</option>
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
                          onChange={(e) => {
                            setDateFilter(e.target.value as DateFilter);
                            setCurrentPage(1);
                          }}
                          style={styles.filterSelect}
                        >
                          <option value="all">Todas</option>
                          <option value="today">Hoje</option>
                          <option value="this_week">Esta Semana</option>
                          <option value="this_month">Este Mês</option>
                        </select>
                      </div>

                      <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Especialidades</label>
                        <select
                          multiple
                          value={selectedSpecialties}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                            setSelectedSpecialties(selected);
                            setCurrentPage(1);
                          }}
                          style={styles.filterSelectMultiple}
                        >
                          {specialties.map(spec => (
                            <option key={spec.id} value={spec.name}>{spec.name}</option>
                          ))}
                        </select>
                        {selectedSpecialties.length > 0 && (
                          <div style={styles.selectedSpecialties}>
                            {selectedSpecialties.map(spec => (
                              <span key={spec} style={styles.specialtyTag}>
                                {spec}
                                <button
                                  onClick={() => {
                                    setSelectedSpecialties(selectedSpecialties.filter(s => s !== spec));
                                    setCurrentPage(1);
                                  }}
                                  style={styles.tagRemove}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Pagamento</label>
                        <div style={styles.paymentRange}>
                          <input
                            type="number"
                            placeholder="Mínimo"
                            value={minPayment}
                            onChange={(e) => {
                              setMinPayment(e.target.value === '' ? '' : Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            style={styles.paymentInput}
                            min="0"
                          />
                          <span style={styles.paymentSeparator}>-</span>
                          <input
                            type="number"
                            placeholder="Máximo"
                            value={maxPayment}
                            onChange={(e) => {
                              setMaxPayment(e.target.value === '' ? '' : Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            style={styles.paymentInput}
                            min="0"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              }
            />
          </>
        )}
      </div>

      {/* Application Modal */}
      {selectedDemand && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Candidatar-se à Demanda</h2>

            <div style={styles.modalDemandInfo}>
              <h3 style={styles.modalDemandTitle}>{selectedDemand.title}</h3>
              <p style={styles.modalDemandDescription}>
                {selectedDemand.description}
              </p>
            </div>

            <div style={styles.modalInputGroup}>
              <label style={styles.modalLabel}>
                Mensagem para a clínica (opcional)
              </label>
              <textarea
                value={applicationMessage}
                onChange={(e) => setApplicationMessage(e.target.value)}
                placeholder="Conte um pouco sobre você e por que se interessa por esta vaga..."
                style={styles.modalTextarea}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={submitApplication}
                disabled={isApplying}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonPrimary,
                  opacity: isApplying ? 0.7 : 1,
                }}
              >
                {isApplying ? 'Enviando...' : 'Enviar Candidatura'}
              </button>
              <button
                onClick={() => {
                  setSelectedDemand(null);
                  setApplicationMessage('');
                }}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonSecondary,
                }}
                disabled={isApplying}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
    <LoadingOverlay visible={loading} label="Carregando demandas..." />
    
    {/* Floating Action Button - Only show for clinic users */}
    {(userRole === 'CADMIN' || userRole === 'CMANAGER' || rawUserRole?.toLowerCase() === 'clinic') && (
      <button
        onClick={() => navigate('/create-demand')}
        onMouseEnter={() => setFabHovered(true)}
        onMouseLeave={() => setFabHovered(false)}
        style={{
          ...styles.fab,
          backgroundColor: fabHovered ? colors.primaryDark : colors.primary,
          transform: fabHovered ? 'scale(1.1)' : 'scale(1)',
        }}
        title="Criar nova demanda"
      >
        <PlusCircle size={24} color="#ffffff" />
      </button>
    )}

      {/* Invite Vet Modal */}
      {showInviteModal && inviteDemandId && (
        <InviteVetModal
          demandId={inviteDemandId}
          onClose={() => {
            setShowInviteModal(false);
            setInviteDemandId(null);
          }}
          onInviteSent={() => {
            // Recarregar dados se necessário
            loadData();
          }}
        />
      )}
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
  viewToggle: {
    display: 'flex',
    gap: '8px',
    backgroundColor: '#f5f5f5',
    padding: '4px',
    borderRadius: '12px',
  },
  toggleButton: {
    padding: '10px 20px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleButtonActive: {
    backgroundColor: '#ffffff',
    color: '#7c3aed',
    fontWeight: '600',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '64px 0',
  },
  loadingSpinner: {
    fontSize: '48px',
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
  },
  demandsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    margin: 0,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  demandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    lineHeight: '1.6',
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: 'auto',
  },
  demandInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicName: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  payment: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '700',
    color: '#22c55e',
  },
  demandActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  actionButtonsContainer: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  date: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a3a3a3',
  },
  applyButton: {
    padding: '8px 16px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  viewDetailsButton: {
    padding: '8px 16px',
    backgroundColor: '#ffffff',
    color: '#7c3aed',
    border: '1px solid #7c3aed',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
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
    padding: '16px',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '560px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '24px',
  },
  modalDemandInfo: {
    marginBottom: '24px',
  },
  modalDemandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#404040',
    marginBottom: '8px',
  },
  modalDemandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  modalInputGroup: {
    marginBottom: '24px',
  },
  modalLabel: {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
    marginBottom: '8px',
  },
  modalTextarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    resize: 'vertical',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  modalButton: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalButtonPrimary: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
  },
  modalButtonSecondary: {
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
  },
  fab: {
    position: 'fixed',
    bottom: '32px',
    right: '32px',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: colors.primary,
    border: 'none',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    zIndex: 999,
  },
  // Search and Filters
  searchFiltersBar: {
    marginBottom: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  searchContainer: {
    marginBottom: '16px',
  },
  controlsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  controlsLeft: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  expandableSearchContainer: {
    position: 'relative',
    height: '40px',
    overflow: 'hidden',
    borderRadius: '8px',
  },
  searchInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '100%',
    padding: '0 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
  },
  searchIcon: {
    color: '#737373',
    flexShrink: 0,
  },
  expandableSearchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    padding: 0,
  },
  clearSearchButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#737373',
    transition: 'all 0.2s ease',
  },
  searchToggleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    padding: 0,
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#737373',
    transition: 'all 0.2s ease',
  },
  filterButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filterButtonActive: {
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
  },
  filterBadge: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    borderRadius: '10px',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '600',
    minWidth: '20px',
    textAlign: 'center',
  },
  clearFiltersButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  sortContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sortLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    fontWeight: '500',
  },
  sortSelect: {
    padding: '8px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
  },
  filtersPanel: {
    marginTop: '20px',
    padding: '20px',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
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
  },
  filterSelectMultiple: {
    padding: '8px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#ffffff',
    minHeight: '100px',
    outline: 'none',
  },
  selectedSpecialties: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  },
  specialtyTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
    borderRadius: '16px',
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    color: '#7c3aed',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
  },
  paymentRange: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  paymentInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    outline: 'none',
  },
  paymentSeparator: {
    color: '#737373',
    fontFamily: 'Inter, sans-serif',
  },
  resultsCount: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e5e5',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  // Improved Card Styles
  demandCardApplied: {
    border: '2px solid #22c55e',
    backgroundColor: '#f0fdf4',
  },
  cardInfoRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  infoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  infoIcon: {
    color: '#737373',
  },
  infoText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#525252',
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
  clinicInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  clinicIcon: {
    color: '#737373',
  },
  paymentContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  paymentIcon: {
    color: '#22c55e',
  },
  appliedBadge: {
    padding: '6px 12px',
    backgroundColor: '#22c55e',
    color: '#ffffff',
    borderRadius: '16px',
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '600',
  },
  // Pagination
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    marginTop: '32px',
    padding: '20px',
  },
  paginationButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  paginationButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  paginationNumbers: {
    display: 'flex',
    gap: '8px',
  },
  paginationNumber: {
    width: '40px',
    height: '40px',
    padding: '0',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  paginationNumberActive: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    borderColor: '#7c3aed',
  },
};

export default DemandsPage;
