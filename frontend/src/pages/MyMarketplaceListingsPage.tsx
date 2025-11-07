import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import MarketplaceCard from '../components/MarketplaceCard';
import LoadingOverlay from '../components/LoadingOverlay';
import { marketplaceApi, MarketplaceItem } from '../services/marketplaceApi';
import { ShoppingCart, PlusCircle, Package, MessageSquare } from 'lucide-react';
import colors from '../styles/colors';

const MyMarketplaceListingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'sold' | 'inactive'>('all');

  const menuItems: MenuItem[] = [
    {
      id: 'marketplace',
      label: 'Ver Marketplace',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <ShoppingCart size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'criar-anuncio',
      label: 'Criar Anúncio',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <PlusCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/create',
    },
    {
      id: 'meus-anuncios',
      label: 'Meus Anúncios',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <Package size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/my-listings',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <MessageSquare size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/messages',
    },
  ];

  useEffect(() => {
    loadMyListings();
  }, []);

  const loadMyListings = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const result = await marketplaceApi.getMyListings(user.id);
      setItems(result.items);
    } catch (error: any) {
      console.error('Error loading listings:', error);
      alert('Erro ao carregar seus anúncios: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const getStats = () => {
    return {
      total: items.length,
      active: items.filter((i) => i.status === 'active').length,
      sold: items.filter((i) => i.status === 'sold').length,
      inactive: items.filter((i) => i.status === 'inactive').length,
    };
  };

  const stats = getStats();

  return (
    <>
    <DashboardLayout
      pageName="Meus Anúncios"
      menuItems={menuItems}
    >
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Meus Anúncios</h1>
            <p style={styles.subtitle}>
              Gerencie seus anúncios de venda e procura
            </p>
          </div>
          <button
            onClick={() => navigate('/marketplace/create')}
            style={styles.createButton}
          >
            ➕ Criar Novo Anúncio
          </button>
        </div>

        {/* Stats Cards */}
        <div style={styles.statsGrid}>
          <button
            onClick={() => setFilter('all')}
            style={{
              ...styles.statCard,
              borderColor: filter === 'all' ? '#7c3aed' : '#e5e5e5',
            }}
          >
            <div style={styles.statNumber}>{stats.total}</div>
            <div style={styles.statLabel}>Total</div>
          </button>
          <button
            onClick={() => setFilter('active')}
            style={{
              ...styles.statCard,
              borderColor: filter === 'active' ? '#10b981' : '#e5e5e5',
            }}
          >
            <div style={{...styles.statNumber, color: '#10b981'}}>{stats.active}</div>
            <div style={styles.statLabel}>Ativos</div>
          </button>
          <button
            onClick={() => setFilter('sold')}
            style={{
              ...styles.statCard,
              borderColor: filter === 'sold' ? '#f59e0b' : '#e5e5e5',
            }}
          >
            <div style={{...styles.statNumber, color: '#f59e0b'}}>{stats.sold}</div>
            <div style={styles.statLabel}>Vendidos</div>
          </button>
          <button
            onClick={() => setFilter('inactive')}
            style={{
              ...styles.statCard,
              borderColor: filter === 'inactive' ? '#737373' : '#e5e5e5',
            }}
          >
            <div style={{...styles.statNumber, color: '#737373'}}>{stats.inactive}</div>
            <div style={styles.statLabel}>Inativos</div>
          </button>
        </div>

        {/* Items Grid */}
        {filteredItems.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyIcon}>📦</p>
            <p style={styles.emptyText}>
              {filter === 'all'
                ? 'Você ainda não tem anúncios'
                : `Nenhum anúncio ${filter === 'active' ? 'ativo' : filter === 'sold' ? 'vendido' : 'inativo'}`}
            </p>
            <button
              onClick={() => navigate('/marketplace/create')}
              style={styles.emptyButton}
            >
              Criar Primeiro Anúncio
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {filteredItems.map((item) => (
              <MarketplaceCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
    <LoadingOverlay visible={loading} label="Carregando seus anúncios..." />
    </>
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
    marginBottom: '32px',
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
  createButton: {
    padding: '12px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    padding: '24px',
    borderRadius: '12px',
    border: '2px solid #e5e5e5',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  statNumber: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '36px',
    fontWeight: '700',
    color: '#7c3aed',
    marginBottom: '8px',
  },
  statLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
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
    margin: '16px 0 24px 0',
  },
  emptyButton: {
    padding: '12px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default MyMarketplaceListingsPage;

