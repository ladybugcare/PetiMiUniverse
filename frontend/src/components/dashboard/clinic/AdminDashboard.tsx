import React, { useState, useEffect } from 'react';
import { useUnit } from '../../../contexts/UnitContext';
import { statisticsApi } from '../../../services/statisticsApi';
import { clinicUsersApi } from '../../../services/clinicUsersApi';
import { Building2, Users, ClipboardList, AlertCircle, BarChart2, UserPlus } from 'lucide-react';
import colors from '../../../styles/colors';

interface AdminDashboardProps {
  activeSection: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ activeSection }) => {
  const { units } = useUnit();
  const [stats, setStats] = useState({
    totalUnits: 0,
    totalUsers: 0,
    totalDemands: 0,
    pendingApplications: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || '{}');
        const clinicId = clinicUser.clinic_id || user.user_metadata?.clinic_id || user.id;

        console.log('Loading stats for clinic:', { clinicId, userId: user.id });

        // Fetch clinic statistics
        const { stats: clinicStats } = await statisticsApi.getClinicStats(clinicId);

        // Fetch clinic users count
        const { clinic_users } = await clinicUsersApi.getClinicUsers(clinicId);

        setStats({
          totalUnits: units.length,
          totalUsers: clinic_users?.length || 0,
          totalDemands: clinicStats.totalDemands,
          pendingApplications: clinicStats.pendingApplications,
        });
      } catch (error: any) {
        console.error('Error loading stats:', error);
        console.error('Error details:', error.message);
      } finally {
        setLoading(false);
      }
    };

    if (units.length > 0) {
      loadStats();
    }
  }, [units]);

  const renderSection = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection stats={stats} units={units} />;
      case 'audit':
        return <AuditLogsSection />;
      default:
        return <ResumoSection stats={stats} units={units} />;
    }
  };

  return <div style={styles.container}>{renderSection()}</div>;
};

// Resumo Section for CADMIN
const ResumoSection: React.FC<{ stats: any; units: any[] }> = ({ stats, units }) => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Visão Geral - Todas as Unidades</h2>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={{ ...styles.statCard, borderLeftColor: '#7c3aed' }}>
          <div style={styles.statIcon}>
            <Building2 size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalUnits}</h3>
            <p style={styles.statLabel}>Unidades Ativas</p>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderLeftColor: '#3b82f6' }}>
          <div style={styles.statIcon}>
            <Users size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalUsers}</h3>
            <p style={styles.statLabel}>Usuários Ativos</p>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderLeftColor: '#10b981' }}>
          <div style={styles.statIcon}>
            <ClipboardList size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalDemands}</h3>
            <p style={styles.statLabel}>Demandas Abertas</p>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}>
          <div style={styles.statIcon}>
            <AlertCircle size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.pendingApplications}</h3>
            <p style={styles.statLabel}>Candidaturas Pendentes</p>
          </div>
        </div>
      </div>

      {/* Units List */}
      <div style={styles.unitsSection}>
        <h3 style={styles.subsectionTitle}>Suas Unidades</h3>
        <div style={styles.unitsList}>
          {units.map((unit) => (
            <div key={unit.id} style={styles.unitCard}>
              {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
              <h4 style={styles.unitName}>{unit.name}</h4>
              <p style={styles.unitLocation}>
                📍 {unit.city}, {unit.state}
              </p>
              <p style={styles.unitAddress}>{unit.address}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={styles.quickActions}>
        <h3 style={styles.subsectionTitle}>Ações Rápidas</h3>
        <div style={styles.actionsGrid}>
          <button style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <Building2 size={20} />
            </span>
            <span style={styles.actionLabel}>Nova Unidade</span>
          </button>
          <button style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <UserPlus size={20} />
            </span>
            <span style={styles.actionLabel}>Convidar Usuário</span>
          </button>
          <button style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <ClipboardList size={20} />
            </span>
            <span style={styles.actionLabel}>Nova Demanda</span>
          </button>
          <button style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <BarChart2 size={20} />
            </span>
            <span style={styles.actionLabel}>Relatórios</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Audit Logs Section
const AuditLogsSection: React.FC = () => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Logs de Auditoria</h2>
      <div style={styles.auditPlaceholder}>
        <p style={styles.placeholderText}>
          🔍 Visualização de logs de auditoria em desenvolvimento
        </p>
        <p style={styles.placeholderSubtext}>
          Aqui você poderá ver todas as ações realizadas por usuários da clínica
        </p>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '24px',
  },
  subsectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
  },
  statIcon: {
    fontSize: '36px',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  unitsSection: {
    marginBottom: '32px',
  },
  unitsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  unitCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    position: 'relative',
  },
  mainBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
  },
  unitName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  unitLocation: {
    fontSize: '14px',
    color: '#525252',
    marginBottom: '4px',
  },
  unitAddress: {
    fontSize: '13px',
    color: '#737373',
  },
  quickActions: {
    marginTop: '32px',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  actionIcon: {
    fontSize: '32px',
  },
  actionLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
  },
  auditPlaceholder: {
    backgroundColor: '#fafafa',
    border: '2px dashed #e5e5e5',
    borderRadius: '12px',
    padding: '64px 32px',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: '18px',
    color: '#525252',
    marginBottom: '8px',
  },
  placeholderSubtext: {
    fontSize: '14px',
    color: '#737373',
  },
};

export default AdminDashboard;

