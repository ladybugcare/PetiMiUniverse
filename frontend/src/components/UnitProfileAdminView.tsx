import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Unit } from '../types/units';
import { useAlert } from '../hooks/useAlert';
import { adminApi } from '../services/adminApi';
import { CheckCircle, XCircle, Clock, Shield, Building2, MapPin, Phone, User, Calendar, Mail } from 'lucide-react';
import colors from '../styles/colors';

interface UnitProfileAdminViewProps {
  unit: Unit;
  onApprove?: (unitId: string) => Promise<void>;
  onReject?: (unitId: string, reason: string) => Promise<void>;
}

const UnitProfileAdminView: React.FC<UnitProfileAdminViewProps> = ({ unit, onApprove, onReject }) => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    if (!onApprove) {
      // Se não houver callback, usar API diretamente
      try {
        setProcessing(true);
        await adminApi.reviewUnit(unit.id, true);
        showSuccess('Unidade aprovada com sucesso!');
        // Recarregar página para atualizar status
        window.location.reload();
      } catch (error: any) {
        showError('Erro ao aprovar unidade: ' + error.message);
      } finally {
        setProcessing(false);
      }
      return;
    }

    showConfirm(
      `Tem certeza que deseja aprovar a unidade "${unit.name}"?`,
      async () => {
        try {
          setProcessing(true);
          await onApprove(unit.id);
          showSuccess('Unidade aprovada com sucesso!');
        } catch (error: any) {
          showError('Erro ao aprovar unidade: ' + error.message);
        } finally {
          setProcessing(false);
        }
      },
      'Confirmar Aprovação'
    );
  };

  const handleReject = async () => {
    if (!onReject) {
      // Se não houver callback, usar API diretamente
      const reason = prompt('Digite o motivo da rejeição:');
      if (!reason || reason.trim().length === 0) {
        showError('Motivo da rejeição é obrigatório');
        return;
      }

      showConfirm(
        `Tem certeza que deseja reprovar a unidade "${unit.name}"?`,
        async () => {
          try {
            setProcessing(true);
            await adminApi.reviewUnit(unit.id, false, reason);
            showSuccess('Unidade reprovada com sucesso!');
            // Recarregar página para atualizar status
            window.location.reload();
          } catch (error: any) {
            showError('Erro ao reprovar unidade: ' + error.message);
          } finally {
            setProcessing(false);
          }
        },
        'Confirmar Reprovação'
      );
      return;
    }

    const reason = prompt('Digite o motivo da rejeição:');
    if (!reason || reason.trim().length === 0) {
      showError('Motivo da rejeição é obrigatório');
      return;
    }

    showConfirm(
      `Tem certeza que deseja reprovar a unidade "${unit.name}"?`,
      async () => {
        try {
          setProcessing(true);
          await onReject(unit.id, reason);
          showSuccess('Unidade reprovada com sucesso!');
        } catch (error: any) {
          showError('Erro ao reprovar unidade: ' + error.message);
        } finally {
          setProcessing(false);
        }
      },
      'Confirmar Reprovação'
    );
  };

  const getStatusBadge = () => {
    const status = unit.status || 'pending_review';
    const statusConfig = {
      approved: { label: 'Aprovada', color: '#22c55e', bgColor: '#dcfce7', icon: CheckCircle },
      active: { label: 'Ativa', color: '#22c55e', bgColor: '#dcfce7', icon: CheckCircle },
      pending_review: { label: 'Pendente', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock },
      rejected: { label: 'Rejeitada', color: '#ef4444', bgColor: '#fee2e2', icon: XCircle },
      inactive: { label: 'Inativa', color: '#6b7280', bgColor: '#f3f4f6', icon: XCircle },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending_review;
    const Icon = config.icon;

    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: '600',
        color: config.color,
        backgroundColor: config.bgColor,
        fontFamily: 'Inter, sans-serif',
      }}>
        <Icon size={16} />
        {config.label}
      </div>
    );
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Não informado';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatCNPJ = (cnpj?: string) => {
    if (!cnpj) return 'N/A';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    return phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
  };

  return (
    <div style={styles.twoColumnContainer}>
      {/* Lado Esquerdo Fixo */}
      <aside style={styles.leftSidebar}>
        {/* Nome e Status */}
        <div style={styles.profileHeader}>
          <h2 style={styles.unitName}>
            {unit.name}
            {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
          </h2>
          <p style={styles.unitId}>ID: {unit.id}</p>
          <div style={{ marginTop: '12px' }}>
            {getStatusBadge()}
          </div>
        </div>

        {/* Informações Rápidas */}
        <div style={styles.quickInfo}>
          <div style={styles.quickInfoItem}>
            <Building2 size={16} color="#737373" />
            <span style={styles.quickInfoText}>CNPJ: {formatCNPJ(unit.cnpj)}</span>
          </div>
          {unit.phone && (
            <div style={styles.quickInfoItem}>
              <Phone size={16} color="#737373" />
              <span style={styles.quickInfoText}>{formatPhone(unit.phone)}</span>
            </div>
          )}
          {unit.technical_manager && (
            <div style={styles.quickInfoItem}>
              <User size={16} color="#737373" />
              <span style={styles.quickInfoText}>Responsável: {unit.technical_manager}</span>
            </div>
          )}
        </div>

        {/* Ações de Moderação */}
        <div style={styles.moderationActions}>
          <h3 style={styles.moderationTitle}>Ações de Moderação</h3>
          {unit.status === 'pending_review' && (
            <>
              <button onClick={handleApprove} style={styles.actionButtonPrimary} disabled={processing}>
                {processing ? 'Aprovando...' : 'Aprovar Unidade'}
              </button>
              <button onClick={handleReject} style={styles.actionButtonSecondary} disabled={processing}>
                {processing ? 'Reprovando...' : 'Reprovar Unidade'}
              </button>
            </>
          )}
          <button
            onClick={() => alert('Bloquear unidade (funcionalidade futura)')}
            style={styles.actionButtonDanger}
            disabled={processing}
          >
            Bloquear Unidade
          </button>
        </div>
      </aside>

      {/* Lado Direito Scrollável */}
      <main style={styles.rightContent}>
        {/* Informações Completas */}
        <div style={styles.sectionCard}>
          <h2 style={styles.sectionTitle}>
            <Shield size={20} /> Informações Completas
          </h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Nome</label>
              <p style={styles.infoValue}>{unit.name}</p>
            </div>
            {unit.nickname && (
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>Apelido</label>
                <p style={styles.infoValue}>{unit.nickname}</p>
              </div>
            )}
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>CNPJ</label>
              <p style={styles.infoValue}>{formatCNPJ(unit.cnpj)}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <MapPin size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Endereço Completo
              </label>
              <p style={styles.infoValue}>{unit.address || 'Não informado'}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Cidade</label>
              <p style={styles.infoValue}>{unit.city || 'Não informado'}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Estado</label>
              <p style={styles.infoValue}>{unit.state || 'Não informado'}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <Phone size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Telefone
              </label>
              <p style={styles.infoValue}>{formatPhone(unit.phone)}</p>
            </div>
            {unit.technical_manager && (
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>
                  <User size={16} style={{ display: 'inline', marginRight: '4px' }} />
                  Responsável Técnico
                </label>
                <p style={styles.infoValue}>{unit.technical_manager}</p>
              </div>
            )}
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <Calendar size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Data de Criação
              </label>
              <p style={styles.infoValue}>{formatDate(unit.created_at)}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <Calendar size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Última Atualização
              </label>
              <p style={styles.infoValue}>{formatDate(unit.updated_at)}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Unidade Principal</label>
              <p style={styles.infoValue}>{unit.is_main ? 'Sim' : 'Não'}</p>
            </div>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Clinic ID</label>
              <p style={styles.infoValue}>{unit.clinic_id}</p>
            </div>
          </div>
        </div>

        {/* Status e Aprovação */}
        <div style={styles.sectionCard}>
          <h2 style={styles.sectionTitle}>
            <Shield size={20} /> Status e Aprovação
          </h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Status Atual</label>
              <div style={{ marginTop: '8px' }}>
                {getStatusBadge()}
              </div>
            </div>
            {(unit as any).reviewed_at && (
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>Data de Revisão</label>
                <p style={styles.infoValue}>{formatDate((unit as any).reviewed_at)}</p>
              </div>
            )}
            {(unit as any).reviewed_by && (
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>Revisado por</label>
                <p style={styles.infoValue}>{(unit as any).reviewed_by}</p>
              </div>
            )}
            {(unit as any).rejection_reason && (
              <div style={styles.infoItem}>
                <label style={{ ...styles.infoLabel, color: colors.error[500] }}>
                  Motivo da Rejeição
                </label>
                <p style={{ ...styles.infoValue, color: colors.error[500] }}>
                  {(unit as any).rejection_reason}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  twoColumnContainer: {
    display: 'flex',
    gap: '32px',
    padding: '24px',
    fontFamily: 'Inter, sans-serif',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '320px',
    flexShrink: 0,
    position: 'sticky' as const,
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  profileHeader: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  unitName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '22px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  unitId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#9ca3af',
    margin: '0 0 8px 0',
  },
  mainBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  quickInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  quickInfoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  quickInfoText: {
    fontSize: '13px',
    color: '#4b5563',
  },
  moderationActions: {
    marginTop: '24px',
  },
  moderationTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  actionButtonPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    marginBottom: '8px',
  },
  actionButtonSecondary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    marginBottom: '8px',
  },
  actionButtonDanger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  rightContent: {
    flex: 1,
    minWidth: 0,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid #e5e7eb',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  infoLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '14px',
    color: '#262626',
    margin: 0,
  },
};

export default UnitProfileAdminView;

