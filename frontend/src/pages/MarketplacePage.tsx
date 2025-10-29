import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import MarketplaceCard from '../components/MarketplaceCard';
import { marketplaceApi, MarketplaceItem, MarketplaceFilters } from '../services/marketplaceApi';
import { BRAZILIAN_STATES } from '../utils/locationData';

const MarketplacePage: React.FC = () => {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<MarketplaceFilters>({
    listing_type: '',
    category: '',
    state: '',
    condition: '',
    min_price: undefined,
    max_price: undefined,
    negotiable_only: false,
    search: '',
    sort_by: 'recent',
  });

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'marketplace',
      label: 'Ver Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'criar-anuncio',
      label: 'Criar Anúncio',
      icon: '➕',
      action: 'navigate',
      path: '/marketplace/create',
    },
    {
      id: 'meus-anuncios',
      label: 'Meus Anúncios',
      icon: '📦',
      action: 'navigate',
      path: '/marketplace/my-listings',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'navigate',
      path: '/marketplace/messages',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  useEffect(() => {
    loadItems();
  }, [filters]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const result = await marketplaceApi.getAll(filters);
      setItems(result.items);
    } catch (error: any) {
      console.error('Error loading items:', error);
      alert('Erro ao carregar itens: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name: string, value: any) => {
    setFilters({
      ...filters,
      [name]: value,
    });
  };

  const handleClearFilters = () => {
    setFilters({
      listing_type: '',
      category: '',
      state: '',
      condition: '',
      min_price: undefined,
      max_price: undefined,
      negotiable_only: false,
      search: '',
      sort_by: 'recent',
    });
  };

  return (
    <DashboardLayout
      pageName="Marketplace"
      menuItems={menuItems}
      notificationCount={0}
    >
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Marketplace PetiVet</h1>
            <p style={styles.subtitle}>
              Encontre equipamentos, medicamentos e suprimentos veterinários
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={styles.filterToggleButton}
          >
            🔍 {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>

        {/* Search Bar */}
        <div style={styles.searchContainer}>
          <input
            type="text"
            placeholder="Buscar por título ou descrição..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div style={styles.filtersPanel}>
            <div style={styles.filtersGrid}>
              {/* Listing Type */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Tipo de Anúncio</label>
                <select
                  value={filters.listing_type}
                  onChange={(e) => handleFilterChange('listing_type', e.target.value)}
                  style={styles.filterInput}
                >
                  <option value="">Todos</option>
                  <option value="sale">Venda</option>
                  <option value="wanted">Procura</option>
                </select>
              </div>

              {/* Category */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Categoria</label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  style={styles.filterInput}
                >
                  <option value="">Todas</option>
                  <option value="equipment">Equipamentos</option>
                  <option value="medicine">Medicamentos</option>
                  <option value="vaccine">Vacinas</option>
                  <option value="supplies">Suprimentos</option>
                </select>
              </div>

              {/* State */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Estado</label>
                <select
                  value={filters.state}
                  onChange={(e) => handleFilterChange('state', e.target.value)}
                  style={styles.filterInput}
                >
                  <option value="">Todos</option>
                  {BRAZILIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Condição</label>
                <select
                  value={filters.condition}
                  onChange={(e) => handleFilterChange('condition', e.target.value)}
                  style={styles.filterInput}
                >
                  <option value="">Todas</option>
                  <option value="new">Novo</option>
                  <option value="used">Usado</option>
                  <option value="refurbished">Remanufaturado</option>
                </select>
              </div>

              {/* Min Price */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Preço Mínimo (R$)</label>
                <input
                  type="number"
                  value={filters.min_price || ''}
                  onChange={(e) => handleFilterChange('min_price', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.00"
                  style={styles.filterInput}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Max Price */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Preço Máximo (R$)</label>
                <input
                  type="number"
                  value={filters.max_price || ''}
                  onChange={(e) => handleFilterChange('max_price', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.00"
                  style={styles.filterInput}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Sort By */}
              <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Ordenar por</label>
                <select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  style={styles.filterInput}
                >
                  <option value="recent">Mais Recentes</option>
                  <option value="price_asc">Menor Preço</option>
                  <option value="price_desc">Maior Preço</option>
                </select>
              </div>

              {/* Negotiable Only */}
              <div style={styles.filterGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={filters.negotiable_only}
                    onChange={(e) => handleFilterChange('negotiable_only', e.target.checked)}
                    style={styles.checkbox}
                  />
                  <span>Apenas negociáveis</span>
                </label>
              </div>
            </div>

            <button onClick={handleClearFilters} style={styles.clearButton}>
              Limpar Filtros
            </button>
          </div>
        )}

        {/* Results Count */}
        <div style={styles.resultsCount}>
          {loading ? 'Carregando...' : `${items.length} ${items.length === 1 ? 'item encontrado' : 'itens encontrados'}`}
        </div>

        {/* Items Grid */}
        {loading ? (
          <div style={styles.loading}>Carregando anúncios...</div>
        ) : items.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyIcon}>📦</p>
            <p style={styles.emptyText}>Nenhum item encontrado</p>
            <p style={styles.emptyHint}>Tente ajustar os filtros ou criar um novo anúncio</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {items.map((item) => (
              <MarketplaceCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
    margin: '8px 0 0 0',
  },
  filterToggleButton: {
    padding: '12px 24px',
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
  searchContainer: {
    marginBottom: '24px',
  },
  searchInput: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontFamily: 'Inter, sans-serif',
    border: '2px solid #e5e5e5',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
  },
  filtersPanel: {
    backgroundColor: '#f9fafb',
    padding: '24px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: '1px solid #e5e5e5',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    color: '#525252',
  },
  filterInput: {
    padding: '10px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    cursor: 'pointer',
    marginTop: '24px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  clearButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    color: '#737373',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    cursor: 'pointer',
  },
  resultsCount: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '24px',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px',
  },
  emptyIcon: {
    fontSize: '64px',
    margin: 0,
  },
  emptyText: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: '16px 0 8px 0',
  },
  emptyHint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
};

export default MarketplacePage;

