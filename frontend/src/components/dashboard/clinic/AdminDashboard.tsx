import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../../../contexts/UnitContext';
import { useAlert } from '../../../hooks/useAlert';
import { statisticsApi } from '../../../services/statisticsApi';
import { clinicUsersApi } from '../../../services/clinicUsersApi';
import { unitsApi } from '../../../services/unitsApi';
import { Building2, Users, ClipboardList, AlertCircle, BarChart2, UserPlus } from 'lucide-react';
import { Role, Unit } from '../../../types/units';
import colors from '../../../styles/colors';

interface AdminDashboardProps {
  activeSection: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ activeSection }) => {
  const { units, loadUnits } = useUnit();
  const [stats, setStats] = useState({
    totalUnits: 0,
    totalUsers: 0,
    totalDemands: 0,
    pendingApplications: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadStats = async () => {
      try {
        setLoading(true);
        const userStr = localStorage.getItem('user');
        const clinicUserStr = localStorage.getItem('clinic_user');
        
        if (!userStr || !clinicUserStr) return;
        
        const user = JSON.parse(userStr);
        const clinicUser = JSON.parse(clinicUserStr);
        // Sempre usar clinic_id do clinic_user quando disponível
        // Fallback para user.id apenas se não houver clinic_user (clinic owner direto)
        const clinicId = clinicUser?.clinic_id || user.user_metadata?.clinic_id || user.id;

        console.log('Loading stats for clinic:', { clinicId, userId: user.id });

        // Get fresh units count directly from API to ensure accuracy
        const { units: allClinicUnits } = await unitsApi.getByClinic(clinicId);
        const activeUnitsCount = allClinicUnits.filter(u => 
          u.status === 'active' || u.status === 'approved'
        ).length;

        // Fetch clinic statistics
        const { stats: clinicStats } = await statisticsApi.getClinicStats(clinicId);

        // Fetch clinic users count
        const { clinic_users } = await clinicUsersApi.getClinicUsers(clinicId);

        if (!isMounted) return;

        setStats({
          totalUnits: activeUnitsCount,
          totalUsers: clinic_users?.length || 0,
          totalDemands: clinicStats.totalDemands,
          pendingApplications: clinicStats.pendingApplications,
        });
      } catch (error: any) {
        // Não logar erro 403/404 - são esperados em alguns casos
        if (error?.message?.includes('403') || error?.message?.includes('404')) {
          // Silently handle - usuário pode não ter acesso ou dados podem não existir
          setStats({
            totalUnits: 0,
            totalUsers: 0,
            totalDemands: 0,
            pendingApplications: 0,
          });
        } else {
          // Logar apenas erros inesperados
          if (process.env.NODE_ENV === 'development') {
            console.error('Error loading stats:', error);
            console.error('Error details:', error.message);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

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
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();
  const { units: contextUnits, selectedUnit } = useUnit();
  // Use units from context or props - no need to fetch again
  const allUnits = contextUnits.length > 0 ? contextUnits : units.filter(u => 
    u.status === 'active' || u.status === 'approved'
  );
  const [loadingUnits] = useState(false);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    unit_id: '',
    role: 'CASSISTANT' as Role,
  });

  // Get clinic ID from localStorage
  const getClinicId = React.useCallback(() => {
    const userStr = localStorage.getItem('user');
    const clinicUserStr = localStorage.getItem('clinic_user');
    
    if (!userStr || !clinicUserStr) return null;
    
    const user = JSON.parse(userStr);
    const clinicUser = JSON.parse(clinicUserStr);
    return clinicUser.clinic_id || user.user_metadata?.clinic_id || user.id;
  }, []);

  // Handlers for button actions
  const handleNewUnit = () => {
    // Se não tem unidades, vai para o fluxo de primeira unidade
    const availableUnits = contextUnits.length > 0 ? contextUnits : units;
    if (availableUnits.length === 0) {
      navigate('/units/create-first');
    } else {
      navigate('/units/create');
    }
  };

  const handleInviteUser = () => {
    const availableUnits = contextUnits.length > 0 ? contextUnits : units;
    if (availableUnits.length === 0) {
      showWarning('Você precisa ter pelo menos uma unidade cadastrada para convidar usuários.');
      return;
    }
    setInviteForm({
      email: '',
      unit_id: selectedUnit?.id || availableUnits[0]?.id || '',
      role: 'CASSISTANT',
    });
    setShowInviteModal(true);
  };

  const handleNewDemand = () => {
    navigate('/create-demand');
  };

  const handleReports = () => {
    navigate('/clinic-reports');
  };

  // Modal handlers
  const handleCloseInviteModal = () => {
    setShowInviteModal(false);
    setInviteForm({
      email: '',
      unit_id: '',
      role: 'CASSISTANT',
    });
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteForm.email || !inviteForm.unit_id || !inviteForm.role) {
      showError('Por favor, preencha todos os campos');
      return;
    }

    const clinicId = getClinicId();
    if (!clinicId) {
      showError('Erro ao identificar a clínica');
      return;
    }

    try {
      setInviteLoading(true);
      await clinicUsersApi.invite({
        email: inviteForm.email,
        clinic_id: clinicId,
        unit_id: inviteForm.unit_id,
        role: inviteForm.role,
      });

      showSuccess('Convite enviado com sucesso!');
      handleCloseInviteModal();
    } catch (error: any) {
      showError('Erro ao enviar convite: ' + (error.message || ''));
    } finally {
      setInviteLoading(false);
    }
  };

  const availableUnits = contextUnits.length > 0 ? contextUnits : units;

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Visão Geral - Todas as Unidades</h2>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div 
          style={{ ...styles.statCard, borderLeftColor: '#7c3aed' }}
          onClick={() => navigate('/units')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(124, 58, 237, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <Building2 size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalUnits}</h3>
            <p style={styles.statLabel}>Unidades Ativas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#3b82f6', cursor: 'pointer' }}
          onClick={() => navigate('/users?status=active')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <Users size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalUsers}</h3>
            <p style={styles.statLabel}>Usuários Ativos</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#10b981', cursor: 'pointer' }}
          onClick={() => navigate('/demands?status=open')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <ClipboardList size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalDemands}</h3>
            <p style={styles.statLabel}>Demandas Abertas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#f59e0b', cursor: 'pointer' }}
          onClick={() => navigate('/clinic-applications?status=pending')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(245, 158, 11, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
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
          {loadingUnits ? (
            <p style={styles.loadingText}>Carregando unidades...</p>
          ) : allUnits.length === 0 ? (
            <p style={styles.emptyText}>Nenhuma unidade cadastrada</p>
          ) : (
            allUnits.map((unit) => {
              const getStatusLabel = (status: string) => {
                switch (status) {
                  case 'approved':
                  case 'active':
                    return { label: 'Aprovada', color: '#10b981' };
                  case 'pending_review':
                    return { label: 'Pendente', color: '#f59e0b' };
                  case 'rejected':
                    return { label: 'Rejeitada', color: '#ef4444' };
                  case 'inactive':
                    return { label: 'Inativa', color: '#737373' };
                  default:
                    return { label: status, color: '#737373' };
                }
              };
              const statusInfo = getStatusLabel(unit.status);
              
              return (
                <div 
                  key={unit.id} 
                  style={{ ...styles.unitCard, cursor: 'pointer' }}
                  onClick={() => navigate(`/units/${unit.id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
                  <div style={styles.unitHeader}>
                    <h4 style={styles.unitName}>{unit.name}</h4>
                    <span style={{ ...styles.statusBadge, backgroundColor: `${statusInfo.color}20`, color: statusInfo.color, borderColor: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p style={styles.unitLocation}>
                    📍 {unit.city}, {unit.state}
                  </p>
                  <p style={styles.unitAddress}>{unit.address}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={styles.quickActions}>
        <h3 style={styles.subsectionTitle}>Ações Rápidas</h3>
        <div style={styles.actionsGrid}>
          <button 
            style={styles.actionButton}
            onClick={handleNewUnit}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
              }
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
              }
            }}
          >
              <div className="action-icon-circle" style={styles.actionIconCircle}>
                <Building2 size={28} strokeWidth={1.5} color="white" />
              </div>
            <span style={styles.actionLabel}>Nova Unidade</span>
          </button>
          <button 
            style={styles.actionButton}
            onClick={handleInviteUser}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
              }
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
              }
            }}
          >
              <div className="action-icon-circle" style={styles.actionIconCircle}>
                <UserPlus size={28} strokeWidth={1.5} color="white" />
              </div>
            <span style={styles.actionLabel}>Convidar Usuário</span>
          </button>
          <button 
            style={styles.actionButton}
            onClick={handleNewDemand}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
              }
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
              }
            }}
          >
              <div className="action-icon-circle" style={styles.actionIconCircle}>
                <ClipboardList size={28} strokeWidth={1.5} color="white" />
              </div>
            <span style={styles.actionLabel}>Nova Demanda</span>
          </button>
          <button 
            style={styles.actionButton}
            onClick={handleReports}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
              }
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
              }
            }}
          >
              <div className="action-icon-circle" style={styles.actionIconCircle}>
                <BarChart2 size={28} strokeWidth={1.5} color="white" />
              </div>
            <span style={styles.actionLabel}>Relatórios</span>
          </button>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={styles.modalOverlay} onClick={handleCloseInviteModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Convidar Usuário</h2>
            <form onSubmit={handleInviteSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  style={styles.input}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e5e5';
                  }}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Unidade *</label>
                <select
                  value={inviteForm.unit_id}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, unit_id: e.target.value })
                  }
                  style={styles.input}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e5e5';
                  }}
                  required
                >
                  <option value="">Selecione uma unidade</option>
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Role *</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, role: e.target.value as Role })
                  }
                  style={styles.input}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e5e5';
                  }}
                  required
                >
                  <option value="CADMIN">Administrador da Clínica</option>
                  <option value="CMANAGER">Gestor de Unidade</option>
                  <option value="CASSISTANT">Assistente/Secretário</option>
                  <option value="CVET_INTERNAL">Veterinário Interno</option>
                </select>
              </div>
              <div style={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={handleCloseInviteModal} 
                  style={styles.cancelButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={inviteLoading} 
                  style={{
                    ...styles.submitButton,
                    ...(inviteLoading && { opacity: 0.6, cursor: 'not-allowed' })
                  }}
                  onMouseEnter={(e) => {
                    if (!inviteLoading) {
                      e.currentTarget.style.backgroundColor = '#6d28d9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!inviteLoading) {
                      e.currentTarget.style.backgroundColor = '#7c3aed';
                    }
                  }}
                >
                  {inviteLoading ? 'Enviando...' : 'Enviar Convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    userSelect: 'none',
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
    bottom: '12px',
    right: '12px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
  },
  unitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '12px',
  },
  unitName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    flex: 1,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  loadingText: {
    fontSize: '14px',
    color: '#737373',
    textAlign: 'center',
    padding: '20px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#737373',
    textAlign: 'center',
    padding: '20px',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '20px',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #d7c7ff',
    borderRadius: '16px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  actionIconCircle: {
    width: '56px',
    height: '56px',
    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
  },
  actionLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d1b69',
    textAlign: 'center',
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
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '600',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
  },
  input: {
    padding: '12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    color: '#262626',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelButton: {
    flex: '1',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    color: '#525252',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  submitButton: {
    flex: '1',
    padding: '12px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
};

export default AdminDashboard;

