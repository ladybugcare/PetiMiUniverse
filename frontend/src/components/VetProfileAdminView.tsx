import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vet } from '../services/vetsApi';
import { useAlert } from '../hooks/useAlert';
import { CheckCircle, XCircle, Clock, Shield, FileText, Mail, Phone, MapPin, User, Calendar } from 'lucide-react';
import { colors } from '../styles/colors';

interface VetProfileAdminViewProps {
  vet: Vet;
  /** Resolve UUID de especialidade para nome (quando o vet guarda IDs). */
  getSpecialtyName?: (spec: string) => string;
  onApprove?: (vetId: string) => Promise<void>;
  onReject?: (vetId: string, reason: string) => Promise<void>;
}

const VetProfileAdminView: React.FC<VetProfileAdminViewProps> = ({
  vet,
  getSpecialtyName,
  onApprove,
  onReject,
}) => {
  const labelForSpecialty = (spec: string) =>
    getSpecialtyName ? getSpecialtyName(spec) : spec;
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    if (!onApprove) return;
    
    showConfirm(
      `Tem certeza que deseja aprovar o veterinário "${vet.name}"?`,
      async () => {
        try {
          setProcessing(true);
          await onApprove(vet.id);
          showSuccess('Veterinário aprovado com sucesso!');
        } catch (error: any) {
          showError('Erro ao aprovar veterinário: ' + error.message);
        } finally {
          setProcessing(false);
        }
      },
      'Confirmar Aprovação'
    );
  };

  const handleReject = async () => {
    if (!onReject) return;
    
    const reason = prompt('Digite o motivo da rejeição:');
    if (!reason || reason.trim().length === 0) {
      showError('Motivo da rejeição é obrigatório');
      return;
    }
    
    showConfirm(
      `Tem certeza que deseja reprovar o veterinário "${vet.name}"?`,
      async () => {
        try {
          setProcessing(true);
          await onReject(vet.id, reason);
          showSuccess('Veterinário reprovado com sucesso!');
        } catch (error: any) {
          showError('Erro ao reprovar veterinário: ' + error.message);
        } finally {
          setProcessing(false);
        }
      },
      'Confirmar Reprovação'
    );
  };

  /**
   * `status` em `vets` é operacional (active/inactive). Moderação usa `approval_status`.
   * Sem isto, um vet `pending_approval` com `status === 'active'` aparecia como "Aprovado".
   */
  const getStatusBadge = () => {
    const a = vet.approval_status;
    let config: {
      label: string;
      color: string;
      bgColor: string;
      icon: typeof CheckCircle;
    };

    if (a === 'approved') {
      config = { label: 'Aprovado', color: '#22c55e', bgColor: '#dcfce7', icon: CheckCircle };
    } else if (a === 'rejected') {
      config = { label: 'Rejeitado', color: '#ef4444', bgColor: '#fee2e2', icon: XCircle };
    } else if (a === 'pending_review') {
      config = { label: 'Em revisão', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock };
    } else if (a === 'pending_approval') {
      config = { label: 'Pendente', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock };
    } else if (a === 'pending') {
      config = {
        label: 'Aguardando onboarding',
        color: '#f59e0b',
        bgColor: '#fef3c7',
        icon: Clock,
      };
    } else {
      const legacy = vet.status || 'pending';
      const legacyMap: Record<
        string,
        { label: string; color: string; bgColor: string; icon: typeof CheckCircle }
      > = {
        active: { label: 'Aprovado', color: '#22c55e', bgColor: '#dcfce7', icon: CheckCircle },
        pending: { label: 'Pendente', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock },
        rejected: { label: 'Rejeitado', color: '#ef4444', bgColor: '#fee2e2', icon: XCircle },
        inactive: { label: 'Inativo', color: '#6b7280', bgColor: '#f3f4f6', icon: XCircle },
      };
      config = legacyMap[legacy] || legacyMap.pending;
    }

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

  return (
    <div style={styles.twoColumnContainer}>
      {/* Lado Esquerdo Fixo */}
      <aside style={styles.leftSidebar}>
        {/* Foto de Perfil */}
        <div style={styles.photoSection}>
          {vet.photo_url ? (
            <img src={vet.photo_url} alt={vet.name} style={styles.photoImage} />
          ) : (
            <div style={styles.photoPlaceholder}>
              <User size={48} color="#9ca3af" />
            </div>
          )}
        </div>

        {/* Resumo de Status */}
        <div style={styles.profileHeader}>
          <h2 style={styles.profileName}>{vet.name}</h2>
          <p style={styles.vetId}>ID: {vet.id}</p>
          <div style={{ marginTop: '12px' }}>
            {getStatusBadge()}
          </div>
        </div>

        {/* Informações Rápidas */}
        <div style={styles.quickInfo}>
          <div style={styles.quickInfoItem}>
            <Mail size={16} color="#737373" />
            <span style={styles.quickInfoText}>{vet.email}</span>
          </div>
          {vet.phone && (
            <div style={styles.quickInfoItem}>
              <Phone size={16} color="#737373" />
              <span style={styles.quickInfoText}>{vet.phone}</span>
            </div>
          )}
          {vet.crmv && (
            <div style={styles.quickInfoItem}>
              <Shield size={16} color="#737373" />
              <span style={styles.quickInfoText}>CRMV: {vet.crmv}</span>
            </div>
          )}
        </div>

        {/* Ações de Moderação */}
        <div style={styles.moderationSection}>
          <h3 style={styles.moderationTitle}>Ações de Moderação</h3>
          <div style={styles.moderationButtons}>
            {vet.approval_status === 'pending_approval' && (
              <button
                onClick={handleApprove}
                disabled={processing}
                style={{
                  ...styles.approveButton,
                  ...(processing ? styles.buttonDisabled : {}),
                }}
              >
                <CheckCircle size={18} />
                Aprovar Perfil
              </button>
            )}
            {vet.approval_status === 'pending_approval' && (
              <button
                onClick={handleReject}
                disabled={processing}
                style={{
                  ...styles.rejectButton,
                  ...(processing ? styles.buttonDisabled : {}),
                }}
              >
                <XCircle size={18} />
                Rejeitar
              </button>
            )}
            <button
              onClick={() => navigate(`/admin/vets/${vet.id}`)}
              style={styles.viewButton}
            >
              <FileText size={18} />
              Ver Detalhes
            </button>
          </div>
        </div>
      </aside>

      {/* Lado Direito Scrollável */}
      <main style={styles.rightContent}>
        {/* Informações Completas */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Informações Completas</h2>
          
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <label style={styles.label}>Nome Completo</label>
              <p style={styles.value}>{vet.name}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>Email</label>
              <p style={styles.value}>{vet.email}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>Telefone</label>
              <p style={styles.value}>{vet.phone || 'Não informado'}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>CRMV</label>
              <p style={styles.value}>{vet.crmv || 'Não informado'}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>Tipo de Documento</label>
              <p style={styles.value}>{vet.document_type || 'Não informado'}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>Número do Documento</label>
              <p style={styles.value}>
                {vet.document_number
                  ? vet.document_number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                  : 'Não informado'}
              </p>
            </div>
            
            <div style={styles.infoItemFull}>
              <label style={styles.label}>Endereço Completo</label>
              <p style={styles.value}>{vet.address || 'Não informado'}</p>
            </div>
          </div>
        </div>

        {/* Especialidades */}
        {vet.specialties && vet.specialties.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Especialidades</h2>
            <div style={styles.tagContainer}>
              {vet.specialties.map((spec, index) => (
                <span key={index} style={styles.tag}>
                  {labelForSpecialty(spec)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Certificados */}
        {vet.certificates && vet.certificates.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Certificados</h2>
            <div style={styles.tagContainer}>
              {vet.certificates.map((cert, index) => (
                <span key={index} style={styles.certTag}>
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Biografia */}
        {vet.bio && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Biografia</h2>
            <p style={styles.value}>{vet.bio}</p>
          </div>
        )}

        {/* Experiência */}
        {vet.experience && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Experiência</h2>
            <p style={styles.value}>{vet.experience}</p>
          </div>
        )}

        {/* Informações da Conta */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Informações da Conta</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <label style={styles.label}>
                <Calendar size={16} style={{ marginRight: '8px' }} />
                Conta criada em
              </label>
              <p style={styles.value}>{formatDate(vet.created_at)}</p>
            </div>
            
            <div style={styles.infoItem}>
              <label style={styles.label}>
                <Calendar size={16} style={{ marginRight: '8px' }} />
                Última atualização
              </label>
              <p style={styles.value}>{formatDate(vet.updated_at)}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  twoColumnContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    padding: '24px',
    minHeight: 'calc(100vh - 120px)',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '33%',
    minWidth: '300px',
    maxWidth: '400px',
    position: 'sticky',
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    flex: '0 0 auto',
  },
  rightContent: {
    flex: 1,
    minWidth: '400px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '32px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 120px)',
  },
  photoSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  photoImage: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '4px solid #e5e5e5',
  },
  photoPlaceholder: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid #e5e5e5',
  },
  profileHeader: {
    textAlign: 'center',
  },
  profileName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  vetId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#9ca3af',
    margin: 0,
  },
  quickInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  quickInfoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  quickInfoText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#262626',
  },
  moderationSection: {
    marginTop: 'auto',
    padding: '16px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fee2e2',
  },
  moderationTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
    marginTop: 0,
  },
  moderationButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  approveButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: '#22c55e',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  viewButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  section: {
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '20px',
    marginTop: 0,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoItemFull: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  value: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    margin: 0,
    lineHeight: '1.6',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    padding: '6px 12px',
    backgroundColor: '#e5e7eb',
    color: '#262626',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
  },
  certTag: {
    padding: '8px 14px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #fbbf24',
  },
};

export default VetProfileAdminView;

