import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import { adminApi, PendingUnit } from '../services/adminApi';
import { SuccessModal } from '../components/SuccessModal';
import { useAlert } from '../hooks/useAlert';
import {
  AlertTriangle,
  Building,
  Building2,
  CheckCircle,
  CheckCircle2,
  Hourglass,
  Info,
  Landmark,
  MapPin,
  Phone,
  Trophy,
  User,
  XCircle,
} from 'lucide-react';

const AdminPendingUnitsPage: React.FC = () => {
  const { user } = useAuth();
  const { showError } = useAlert();
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  
  const [units, setUnits] = useState<PendingUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<PendingUnit | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const isLoadingRef = useRef(false);

  useEffect(() => {
    // Prevenir requisições duplicadas causadas por React.StrictMode
    if (isLoadingRef.current) {
      return;
    }
    
    loadPendingUnits();
    
    // Cleanup: resetar flag quando componente desmontar
    return () => {
      isLoadingRef.current = false;
    };
  }, []);

  const loadPendingUnits = async () => {
    // Prevenir requisições simultâneas
    if (isLoadingRef.current) {
      return;
    }
    
    isLoadingRef.current = true;
    
    try {
      setLoading(true);
      const { units: pendingUnits } = await adminApi.getPendingUnits();
      setUnits(pendingUnits);
    } catch (error) {
      console.error('Error loading pending units:', error);
      showError('Erro ao carregar unidades pendentes.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleOpenModal = (unit: PendingUnit, action: 'approve' | 'reject') => {
    setSelectedUnit(unit);
    setModalAction(action);
    setRejectionReason('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedUnit(null);
    setRejectionReason('');
  };

  const handleConfirm = async () => {
    if (!selectedUnit) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      const approved = modalAction === 'approve';
      await adminApi.reviewUnit(selectedUnit.id, approved, rejectionReason);

      setSuccessMessage(
        approved
          ? 'Unidade aprovada com sucesso! A clínica foi ativada.'
          : 'Unidade reprovada. A clínica foi notificada.'
      );
      setShowSuccessModal(true);

      handleCloseModal();
      loadPendingUnits(); // Reload list
    } catch (error: any) {
      console.error('Error reviewing unit:', error);
      showError(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'reprovar'} unidade: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      {/* Success Modal */}
      {showSuccessModal && (
        <SuccessModal
          isOpen={showSuccessModal}
          message={successMessage}
          onClose={() => setShowSuccessModal(false)}
        />
      )}

      <DashboardLayout pageName="Aprovações Pendentes" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>
              <Hourglass
                size={28}
                color={colors.brand.primary[600]}
                strokeWidth={2}
                aria-hidden
                style={{ flexShrink: 0 }}
              />
              <span>Unidades pendentes de aprovação</span>
            </h1>
            <p style={styles.subtitle}>
              Analise as unidades criadas por novas clínicas e aprove ou reprove.
            </p>
          </div>

          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Carregando unidades pendentes...</p>
            </div>
          ) : units.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIconWrap} aria-hidden>
                <CheckCircle2 size={56} color={colors.success[500]} strokeWidth={1.75} />
              </div>
              <h3 style={styles.emptyTitle}>Nenhuma unidade pendente</h3>
              <p style={styles.emptyText}>Todas as unidades foram analisadas!</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {units.map((unit) => {
                const displayCnpj = unit.cnpj || unit.clinic.cnpj;
                return (
                <div key={unit.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardHeaderLeft}>
                      <div style={styles.unitIconPlaceholder}>
                        <Building2 size={24} color={colors.brand.primary[500]} aria-hidden />
                      </div>
                      <div>
                        <h3 style={styles.cardTitle}>
                          {unit.name}
                          {unit.nickname && <span style={styles.nicknameText}> ({unit.nickname})</span>}
                        </h3>
                        <p style={styles.cardEmail}>{unit.clinic.email}</p>
                        {displayCnpj && (
                          <p style={styles.cardCnpj}>CNPJ: {displayCnpj}</p>
                        )}
                        {unit.is_main && (
                          <div style={styles.badgesContainer}>
                            <span style={styles.badge}>
                              <Trophy size={14} color={colors.brand.primary[500]} aria-hidden style={{ flexShrink: 0 }} />
                              Unidade principal
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={styles.statusBadge}>Pendente</span>
                  </div>

                  <div style={styles.cardBody}>
                    <div style={styles.section}>
                      <h4 style={styles.sectionTitle}>
                        <MapPin size={16} color="#374151" aria-hidden />
                        <span>Localização</span>
                      </h4>
                      <p style={styles.text}>{unit.address}</p>
                      <p style={styles.text}>
                        {unit.city} - {unit.state}
                      </p>
                    </div>

                    {unit.phone && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>
                          <Phone size={16} color="#374151" aria-hidden />
                          <span>Telefone da unidade</span>
                        </h4>
                        <p style={styles.text}>{unit.phone}</p>
                      </div>
                    )}

                    {unit.cnpj && unit.clinic.cnpj && unit.cnpj !== unit.clinic.cnpj && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>
                          <Landmark size={16} color="#374151" aria-hidden />
                          <span>CNPJ da unidade</span>
                        </h4>
                        <p style={styles.text}>{unit.cnpj}</p>
                      </div>
                    )}

                    {unit.technical_manager && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>
                          <User size={16} color="#374151" aria-hidden />
                          <span>Responsável técnico</span>
                        </h4>
                        <p style={styles.text}>{unit.technical_manager}</p>
                      </div>
                    )}

                    <div style={styles.divider}></div>

                    <div style={styles.section}>
                      <h4 style={styles.sectionTitle}>
                        <Building size={16} color="#374151" aria-hidden />
                        <span>Clínica</span>
                      </h4>
                      <p style={styles.text}>{unit.clinic.name}</p>
                      {unit.clinic.phone && (
                        <p style={styles.textSmall}>Telefone: {unit.clinic.phone}</p>
                      )}
                    </div>

                    <div style={styles.section}>
                      <p style={styles.dateText}>Cadastro recebido em: {formatDate(unit.created_at)}</p>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <button
                      type="button"
                      onClick={() => handleOpenModal(unit, 'reject')}
                      style={styles.rejectButton}
                    >
                      <XCircle size={18} color="#ef4444" aria-hidden />
                      Reprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenModal(unit, 'approve')}
                      style={styles.approveButton}
                    >
                      <CheckCircle size={18} color="#ffffff" aria-hidden />
                      Aprovar
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Confirmation Modal */}
      {showModal && selectedUnit && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === 'approve' ? (
                <>
                  <CheckCircle size={22} color="#059669" aria-hidden style={{ flexShrink: 0 }} />
                  <span>Aprovar unidade</span>
                </>
              ) : (
                <>
                  <XCircle size={22} color="#dc2626" aria-hidden style={{ flexShrink: 0 }} />
                  <span>Reprovar unidade</span>
                </>
              )}
            </h2>

            <div style={styles.modalBody}>
              <p style={styles.modalText}>
                <strong>Unidade:</strong> {selectedUnit.name}
              </p>
              <p style={styles.modalText}>
                <strong>Clínica:</strong> {selectedUnit.clinic.name}
              </p>

              {modalAction === 'approve' ? (
                <div style={styles.infoBox}>
                  <Info size={20} color="#1d4ed8" aria-hidden style={styles.boxLeadIcon} />
                  <div>
                    <strong>O que vai acontecer:</strong>
                    <ul style={styles.infoList}>
                      <li>Unidade será marcada como "aprovada"</li>
                      <li>Clínica será ativada (status: active)</li>
                      <li>Usuários da clínica serão ativados</li>
                      <li>Clínica poderá criar demandas e anúncios</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <>
                  <div style={styles.warningBox}>
                    <AlertTriangle size={20} color="#b91c1c" aria-hidden style={styles.boxLeadIcon} />
                    <div>
                      <strong>O que vai acontecer:</strong>
                      <ul style={styles.infoList}>
                        <li>Unidade será marcada como "rejeitada"</li>
                        <li>Clínica voltará a ter status "pending_unit"</li>
                        <li>Clínica precisará criar uma nova unidade</li>
                      </ul>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Motivo da Rejeição <span style={styles.required}>*</span>
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explique o motivo da rejeição..."
                      style={styles.textarea}
                      rows={4}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={handleCloseModal}
                style={styles.cancelButton}
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                style={
                  modalAction === 'approve'
                    ? styles.confirmApproveButton
                    : styles.confirmRejectButton
                }
                disabled={processing}
              >
                {processing
                  ? 'Processando...'
                  : modalAction === 'approve'
                  ? 'Confirmar Aprovação'
                  : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: '#6b7280',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyIconWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  unitIconPlaceholder: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: colors.brand.primary[100],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  },
  nicknameText: {
    fontSize: '16px',
    fontWeight: '400',
    color: '#6b7280',
  },
  cardEmail: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  cardCnpj: {
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '8px',
  },
  badgesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  badge: {
    padding: '4px 10px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
  },
  cardBody: {
    padding: '20px',
    flex: 1,
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
    marginTop: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  text: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
    lineHeight: '1.5',
  },
  textSmall: {
    fontSize: '13px',
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: '4px',
  },
  dateText: {
    fontSize: '13px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '16px 0',
  },
  cardFooter: {
    padding: '16px 20px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  rejectButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    color: '#ef4444',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  approveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
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
    padding: '20px',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1f2937',
    padding: '24px 24px 16px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: 0,
  },
  modalBody: {
    padding: '24px',
  },
  modalText: {
    fontSize: '14px',
    color: '#374151',
    marginBottom: '12px',
  },
  infoBox: {
    backgroundColor: '#dbeafe',
    borderLeft: '4px solid #3b82f6',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#1e40af',
    marginTop: '16px',
  },
  warningBox: {
    backgroundColor: '#fee2e2',
    borderLeft: '4px solid #ef4444',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#991b1b',
    marginTop: '16px',
    marginBottom: '16px',
  },
  boxLeadIcon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  textarea: {
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical',
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmApproveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmRejectButton: {
    padding: '10px 20px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default AdminPendingUnitsPage;

