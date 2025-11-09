import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import CollapsibleSection from '../components/admin/CollapsibleSection';
import { adminApi, PendingUnit } from '../services/adminApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';
import colors from '../styles/colors';

interface PendingVet {
  id: string;
  name: string;
  email: string;
  crmv: string;
  specialties?: string[];
  created_at: string;
  updated_at: string;
}

interface PendingFreelancer {
  id: string;
  name: string;
  email: string;
  document_type: 'CPF' | 'CNPJ';
  document_number: string;
  created_at: string;
  updated_at: string;
}

const AdminPendingAllPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [units, setUnits] = useState<PendingUnit[]>([]);
  const [vets, setVets] = useState<PendingVet[]>([]);
  const [freelancers, setFreelancers] = useState<PendingFreelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [modalType, setModalType] = useState<'unit' | 'vet' | 'freelancer'>('unit');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    { id: 'freelancers', label: 'Freelancers', icon: <Briefcase size={20} color={colors.primary} />, action: 'navigate', path: '/admin/freelancers' },
    { id: 'pending-all', label: 'Todos Pendentes', icon: <Clock size={20} color={colors.primary} />, action: 'navigate', path: '/admin/pending-all' },
  ];

  useEffect(() => {
    loadAllPending();
  }, []);

  const loadAllPending = async () => {
    try {
      setLoading(true);
      const [unitsResult, vetsResult, freelancersResult] = await Promise.all([
        adminApi.getPendingUnits().catch(() => ({ units: [] })),
        adminApi.getPendingVets().catch(() => ({ vets: [] })),
        adminApi.getPendingFreelancers().catch(() => ({ freelancers: [] })),
      ]);

      setUnits(unitsResult.units || []);
      setVets(vetsResult.vets || []);
      setFreelancers(freelancersResult.freelancers || []);
    } catch (error: any) {
      console.error('Error loading pending items:', error);
      showError('Erro ao carregar pendências: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item: any, type: 'unit' | 'vet' | 'freelancer', action: 'approve' | 'reject') => {
    setSelectedItem(item);
    setModalType(type);
    setModalAction(action);
    setRejectionReason('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedItem(null);
    setRejectionReason('');
  };

  const handleConfirm = async () => {
    if (!selectedItem) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      if (modalType === 'unit') {
        await adminApi.reviewUnit(selectedItem.id, modalAction === 'approve', rejectionReason);
        showSuccess(modalAction === 'approve' ? 'Unidade aprovada com sucesso!' : 'Unidade reprovada.');
      } else if (modalType === 'vet') {
        if (modalAction === 'approve') {
          await adminApi.approveVet(selectedItem.id);
        } else {
          await adminApi.rejectVet(selectedItem.id, rejectionReason);
        }
        showSuccess(modalAction === 'approve' ? 'Veterinário aprovado com sucesso!' : 'Veterinário reprovado.');
      } else if (modalType === 'freelancer') {
        if (modalAction === 'approve') {
          await adminApi.approveFreelancer(selectedItem.id);
        } else {
          await adminApi.rejectFreelancer(selectedItem.id, rejectionReason);
        }
        showSuccess(modalAction === 'approve' ? 'Freelancer aprovado com sucesso!' : 'Freelancer reprovado.');
      }

      handleCloseModal();
      loadAllPending();
    } catch (error: any) {
      console.error('Error processing action:', error);
      showError(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'reprovar'}: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <>
      <DashboardLayout pageName="Todos os Pendentes" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>⏳ Cadastros Pendentes de Aprovação</h1>
            <p style={styles.subtitle}>
              Revise e aprove ou reprove os cadastros pendentes do sistema.
            </p>
          </div>

          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Carregando pendências...</p>
            </div>
          ) : (
            <div style={styles.sections}>
              {/* Clínicas/Unidades */}
              <CollapsibleSection
                title="Clínicas"
                count={units.length}
                icon={<Building2 size={24} color={colors.primary} />}
                defaultOpen={units.length > 0}
              >
                {units.length === 0 ? (
                  <div style={styles.emptySection}>
                    <p style={styles.emptyText}>Nenhuma clínica pendente</p>
                  </div>
                ) : (
                  <div style={styles.cardsGrid}>
                    {units.map((unit) => (
                      <div key={unit.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div>
                            <h3 style={styles.cardTitle}>
                              {unit.name}
                              {unit.nickname && <span style={styles.nicknameText}> ({unit.nickname})</span>}
                            </h3>
                            {unit.is_main && (
                              <span style={styles.mainBadge}>🏆 Unidade Principal</span>
                            )}
                          </div>
                          <span style={styles.statusBadge}>Pendente</span>
                        </div>
                        <div style={styles.cardBody}>
                          <div style={styles.infoRow}>
                            <strong>Clínica:</strong> {unit.clinic.name}
                          </div>
                          <div style={styles.infoRow}>
                            <strong>Email:</strong> {unit.clinic.email}
                          </div>
                          {unit.city && unit.state && (
                            <div style={styles.infoRow}>
                              <strong>Localização:</strong> {unit.city} - {unit.state}
                            </div>
                          )}
                          <div style={styles.infoRow}>
                            <strong>Criado em:</strong> {formatDate(unit.created_at)}
                          </div>
                        </div>
                        <div style={styles.cardFooter}>
                          <button
                            onClick={() => handleOpenModal(unit, 'unit', 'reject')}
                            style={styles.rejectButton}
                          >
                            <XCircle size={16} />
                            Reprovar
                          </button>
                          <button
                            onClick={() => handleOpenModal(unit, 'unit', 'approve')}
                            style={styles.approveButton}
                          >
                            <CheckCircle size={16} />
                            Aprovar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Veterinários */}
              <CollapsibleSection
                title="Veterinários"
                count={vets.length}
                icon={<Stethoscope size={24} color={colors.primary} />}
                defaultOpen={vets.length > 0}
              >
                {vets.length === 0 ? (
                  <div style={styles.emptySection}>
                    <p style={styles.emptyText}>Nenhum veterinário pendente</p>
                  </div>
                ) : (
                  <div style={styles.cardsGrid}>
                    {vets.map((vet) => (
                      <div key={vet.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div>
                            <h3 style={styles.cardTitle}>{vet.name}</h3>
                            {vet.crmv && (
                              <span style={styles.crmvBadge}>CRMV: {vet.crmv}</span>
                            )}
                          </div>
                          <span style={styles.statusBadge}>Pendente</span>
                        </div>
                        <div style={styles.cardBody}>
                          <div style={styles.infoRow}>
                            <strong>Email:</strong> {vet.email}
                          </div>
                          {vet.specialties && vet.specialties.length > 0 && (
                            <div style={styles.infoRow}>
                              <strong>Especialidades:</strong> {vet.specialties.slice(0, 3).join(', ')}
                              {vet.specialties.length > 3 && '...'}
                            </div>
                          )}
                          <div style={styles.infoRow}>
                            <strong>Criado em:</strong> {formatDate(vet.created_at)}
                          </div>
                        </div>
                        <div style={styles.cardFooter}>
                          <button
                            onClick={() => handleOpenModal(vet, 'vet', 'reject')}
                            style={styles.rejectButton}
                          >
                            <XCircle size={16} />
                            Reprovar
                          </button>
                          <button
                            onClick={() => handleOpenModal(vet, 'vet', 'approve')}
                            style={styles.approveButton}
                          >
                            <CheckCircle size={16} />
                            Aprovar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Freelancers */}
              <CollapsibleSection
                title="Freelancers"
                count={freelancers.length}
                icon={<Briefcase size={24} color={colors.primary} />}
                defaultOpen={freelancers.length > 0}
              >
                {freelancers.length === 0 ? (
                  <div style={styles.emptySection}>
                    <p style={styles.emptyText}>Nenhum freelancer pendente</p>
                  </div>
                ) : (
                  <div style={styles.cardsGrid}>
                    {freelancers.map((freelancer) => (
                      <div key={freelancer.id} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <div>
                            <h3 style={styles.cardTitle}>{freelancer.name}</h3>
                            <span style={styles.documentBadge}>
                              {freelancer.document_type}: {freelancer.document_number}
                            </span>
                          </div>
                          <span style={styles.statusBadge}>Pendente</span>
                        </div>
                        <div style={styles.cardBody}>
                          <div style={styles.infoRow}>
                            <strong>Email:</strong> {freelancer.email}
                          </div>
                          <div style={styles.infoRow}>
                            <strong>Criado em:</strong> {formatDate(freelancer.created_at)}
                          </div>
                        </div>
                        <div style={styles.cardFooter}>
                          <button
                            onClick={() => handleOpenModal(freelancer, 'freelancer', 'reject')}
                            style={styles.rejectButton}
                          >
                            <XCircle size={16} />
                            Reprovar
                          </button>
                          <button
                            onClick={() => handleOpenModal(freelancer, 'freelancer', 'approve')}
                            style={styles.approveButton}
                          >
                            <CheckCircle size={16} />
                            Aprovar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Confirmation Modal */}
      {showModal && selectedItem && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === 'approve' ? '✅ Aprovar' : '❌ Reprovar'} {modalType === 'unit' ? 'Unidade' : modalType === 'vet' ? 'Veterinário' : 'Freelancer'}
            </h2>

            <div style={styles.modalBody}>
              <p style={styles.modalText}>
                <strong>Nome:</strong> {selectedItem.name}
              </p>
              {modalType === 'unit' && selectedItem.clinic && (
                <p style={styles.modalText}>
                  <strong>Clínica:</strong> {selectedItem.clinic.name}
                </p>
              )}

              {modalAction === 'reject' && (
                <>
                  <div style={styles.warningBox}>
                    <span style={styles.warningIcon}>⚠️</span>
                    <div>
                      <strong>O que vai acontecer:</strong>
                      <ul style={styles.infoList}>
                        <li>Cadastro será marcado como "rejeitado"</li>
                        <li>Usuário será notificado sobre a rejeição</li>
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

              {modalAction === 'approve' && (
                <div style={styles.infoBox}>
                  <span style={styles.infoIcon}>ℹ️</span>
                  <div>
                    <strong>O que vai acontecer:</strong>
                    <ul style={styles.infoList}>
                      <li>Cadastro será aprovado e ativado</li>
                      <li>Usuário receberá notificação de aprovação</li>
                      <li>Acesso completo ao sistema será liberado</li>
                    </ul>
                  </div>
                </div>
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
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#262626',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#737373',
    margin: 0,
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
  },
  loadingText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#737373',
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px',
    marginTop: '16px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  },
  cardHeader: {
    padding: '20px',
    borderBottom: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  nicknameText: {
    fontSize: '14px',
    color: '#737373',
    fontWeight: '400',
  },
  mainBadge: {
    display: 'inline-block',
    fontSize: '12px',
    color: '#f59e0b',
    backgroundColor: '#fffbeb',
    padding: '4px 8px',
    borderRadius: '4px',
    marginTop: '4px',
  },
  crmvBadge: {
    display: 'inline-block',
    fontSize: '12px',
    color: '#3b82f6',
    backgroundColor: '#eff6ff',
    padding: '4px 8px',
    borderRadius: '4px',
    marginTop: '4px',
  },
  documentBadge: {
    display: 'inline-block',
    fontSize: '12px',
    color: '#8b5cf6',
    backgroundColor: '#f5f3ff',
    padding: '4px 8px',
    borderRadius: '4px',
    marginTop: '4px',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#f59e0b',
    backgroundColor: '#fffbeb',
    padding: '4px 12px',
    borderRadius: '12px',
  },
  cardBody: {
    padding: '20px',
  },
  infoRow: {
    fontSize: '14px',
    color: '#525252',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  cardFooter: {
    padding: '16px 20px',
    borderTop: '1px solid #f3f4f6',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  approveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  emptySection: {
    padding: '40px',
    textAlign: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginTop: '16px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
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
    borderRadius: '12px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    padding: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  modalBody: {
    padding: '24px',
  },
  modalText: {
    fontSize: '14px',
    color: '#525252',
    marginBottom: '16px',
  },
  warningBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  warningIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#525252',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
  },
  required: {
    color: '#ef4444',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e5e5',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#e5e5e5',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  confirmApproveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmRejectButton: {
    padding: '10px 20px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default AdminPendingAllPage;

