import React, { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import { adminApi, RecentSignup, SignupProduct } from '../services/adminApi';
import { useAlert } from '../hooks/useAlert';
import { Building2, Clock, Mail, Phone, UserPlus, Users } from 'lucide-react';
import { formatCNPJ } from '../utils/validators';

type ProductFilter = 'all' | 'hub' | 'shift';

const AdminSignupsPage: React.FC = () => {
  const { user } = useAuth();
  const { showError } = useAlert();
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  const [signups, setSignups] = useState<RecentSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const isLoadingRef = useRef(false);

  useEffect(() => {
    loadSignups();
    return () => {
      isLoadingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productFilter]);

  const loadSignups = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      setLoading(true);
      const result = await adminApi.getRecentSignups(productFilter, 100);
      setSignups(result.signups || []);
    } catch (error) {
      console.error('Error loading signups:', error);
      showError('Erro ao carregar cadastros recentes.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const productLabel = (product: SignupProduct) => {
    if (product === 'hub') return 'PetMi Hub';
    if (product === 'shift') return 'PetMi Shift';
    return 'Não identificado';
  };

  const productBadgeStyle = (product: SignupProduct): React.CSSProperties => {
    if (product === 'hub') {
      return { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
    }
    if (product === 'shift') {
      return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
    }
    return { background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' };
  };

  const statusLabel = (signup: RecentSignup) => {
    if (signup.status === 'pending_clinic') return 'Aguardando clínica';
    if (!signup.onboarding_completed) return 'Onboarding incompleto';
    if (signup.status === 'active') return 'Ativa';
    if (signup.status === 'pending_approval' || signup.status === 'pending_review') return 'Em análise';
    return signup.status || '—';
  };

  return (
    <DashboardLayout pageName="Novas contas" menuItems={menuItems}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <UserPlus size={28} color={colors.brand.primary[600]} strokeWidth={2} aria-hidden />
            <span>Novas contas cadastradas</span>
          </h1>
          <p style={styles.subtitle}>
            Acompanhe os cadastros recentes no PetMi Hub e no PetMi Shift.
          </p>
        </div>

        <div style={styles.filters}>
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'hub', label: 'PetMi Hub' },
              { id: 'shift', label: 'PetMi Shift' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setProductFilter(option.id)}
              style={{
                ...styles.filterButton,
                ...(productFilter === option.id ? styles.filterButtonActive : {}),
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Carregando cadastros...</p>
          </div>
        ) : signups.length === 0 ? (
          <div style={styles.emptyState}>
            <Users size={48} color={colors.neutral[400]} aria-hidden />
            <h3 style={styles.emptyTitle}>Nenhuma conta encontrada</h3>
            <p style={styles.emptyText}>
              Ainda não há cadastros recentes para o filtro selecionado.
            </p>
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Produto</th>
                  <th style={styles.th}>Pessoa</th>
                  <th style={styles.th}>Clínica</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Cadastrado em</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((signup) => (
                  <tr key={signup.id}>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...productBadgeStyle(signup.product) }}>
                        {productLabel(signup.product)}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.personCell}>
                        <strong style={styles.personName}>{signup.name || 'Sem nome'}</strong>
                        <span style={styles.metaRow}>
                          <Mail size={14} aria-hidden />
                          {signup.email || '—'}
                        </span>
                        {signup.phone && (
                          <span style={styles.metaRow}>
                            <Phone size={14} aria-hidden />
                            {signup.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>
                      {signup.clinic ? (
                        <div style={styles.personCell}>
                          <span style={styles.metaRow}>
                            <Building2 size={14} aria-hidden />
                            {signup.clinic.name}
                          </span>
                          {signup.clinic.cnpj && (
                            <span style={styles.muted}>CNPJ: {formatCNPJ(signup.clinic.cnpj)}</span>
                          )}
                        </div>
                      ) : (
                        <span style={styles.muted}>Ainda sem clínica</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.statusBadge}>{statusLabel(signup)}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.metaRow}>
                        <Clock size={14} aria-hidden />
                        {formatDate(signup.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: colors.neutral[900],
  },
  subtitle: {
    margin: '8px 0 0',
    color: colors.neutral[600],
    fontSize: '14px',
  },
  filters: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  filterButton: {
    border: `1px solid ${colors.neutral[200]}`,
    background: '#fff',
    color: colors.neutral[700],
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterButtonActive: {
    background: colors.brand.primary[50],
    borderColor: colors.brand.primary[300],
    color: colors.brand.primary[700],
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
    gap: '12px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: `3px solid ${colors.neutral[200]}`,
    borderTopColor: colors.brand.primary[500],
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: colors.neutral[600],
    margin: 0,
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 16px',
    background: '#fff',
    borderRadius: '12px',
    border: `1px solid ${colors.neutral[200]}`,
  },
  emptyTitle: {
    margin: '12px 0 4px',
    fontSize: '18px',
    color: colors.neutral[800],
  },
  emptyText: {
    margin: 0,
    color: colors.neutral[500],
    fontSize: '14px',
  },
  tableWrap: {
    background: '#fff',
    borderRadius: '12px',
    border: `1px solid ${colors.neutral[200]}`,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '760px',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: colors.neutral[500],
    borderBottom: `1px solid ${colors.neutral[200]}`,
    background: colors.neutral[50],
  },
  td: {
    padding: '14px 16px',
    borderBottom: `1px solid ${colors.neutral[100]}`,
    verticalAlign: 'top',
    fontSize: '14px',
    color: colors.neutral[800],
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 700,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '8px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 600,
    background: colors.neutral[100],
    color: colors.neutral[700],
  },
  personCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  personName: {
    fontSize: '14px',
    color: colors.neutral[900],
  },
  metaRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    color: colors.neutral[600],
    fontSize: '13px',
  },
  muted: {
    color: colors.neutral[500],
    fontSize: '13px',
  },
};

export default AdminSignupsPage;
