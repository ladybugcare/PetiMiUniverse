import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { adminApi } from '../services/adminApi';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import { useAlert } from '../hooks/useAlert';
import { Home, Building2, Stethoscope, ClipboardList, Clock, User, LogOut, CheckCircle, XCircle, Briefcase } from 'lucide-react';
import colors from '../styles/colors';

interface PendingFreelancer {
  id: string;
  name: string;
  email: string;
  document_type: 'CPF' | 'CNPJ';
  document_number: string;
  address: string;
  specialties?: string[];
  service_regions?: string[];
  experience_year?: number;
  experience?: string;
  bio?: string;
  photo_url?: string;
  onboarding_completed: boolean;
  approval_status: string;
  created_at: string;
  updated_at: string;
}

const AdminPendingFreelancersPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const [freelancers, setFreelancers] = useState<PendingFreelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFreelancer, setSelectedFreelancer] = useState<PendingFreelancer | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    { id: 'freelancers', label: 'Freelancers', icon: <Briefcase size={20} color={colors.primary} />, action: 'navigate', path: '/admin/freelancers' },
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    { id: 'pending-units', label: 'Aprovações Pendentes', icon: <Clock size={20} color={colors.primary} />, action: 'navigate', path: '/admin/pending-units' },
    { id: 'pending-vets', label: 'Vets Pendentes', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/pending-vets' },
    { id: 'pending-freelancers', label: 'Freelancers Pendentes', icon: <Briefcase size={20} color={colors.primary} />, action: 'navigate', path: '/admin/pending-freelancers' },
    { id: 'profile', label: 'Perfil', icon: <User size={20} color={colors.primary} />, action: 'navigate', path: '/admin-profile' },
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  useEffect(() => {
    loadSpecialties();
    loadPendingFreelancers();
  }, []);

  const loadSpecialties = async () => {
    try {
      const { specialties } = await specialtiesApi.getAll();
      const map = new Map<string, string>();
      specialties.forEach((spec: Specialty) => {
        map.set(spec.id, spec.name);
      });
      setSpecialtiesMap(map);
    } catch (error) {
      console.error('Erro ao carregar especialidades:', error);
    }
  };

  const loadPendingFreelancers = async () => {
    try {
      setLoading(true);
      const { freelancers: pendingFreelancers } = await adminApi.getPendingFreelancers();
      setFreelancers(pendingFreelancers);
    } catch (error: any) {
      console.error('Error loading pending freelancers:', error);
      showError('Erro ao carregar freelancers pendentes: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (freelancer: PendingFreelancer, action: 'approve' | 'reject') => {
    setSelectedFreelancer(freelancer);
    setModalAction(action);
    setRejectionReason('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedFreelancer(null);
    setRejectionReason('');
  };

  const handleConfirm = async () => {
    if (!selectedFreelancer) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      if (modalAction === 'approve') {
        await adminApi.approveFreelancer(selectedFreelancer.id);
        showSuccess('✅ Freelancer aprovado com sucesso!');
      } else {
        await adminApi.rejectFreelancer(selectedFreelancer.id, rejectionReason);
        showSuccess('❌ Freelancer rejeitado. Email com motivo foi enviado.');
      }

      handleCloseModal();
      loadPendingFreelancers();
    } catch (error: any) {
      console.error('Error reviewing freelancer:', error);
      showError(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'rejeitar'} freelancer: ${error.message || 'Tente novamente'}`);
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

  const formatDocument = (docType: string, docNumber: string) => {
    const normalized = docNumber.replace(/[^\d]/g, '');
    if (docType === 'CPF') {
      return normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      return normalized.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
  };

  return (
    <>
      <DashboardLayout pageName="Aprovações de Freelancers" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>⏳ Freelancers Pendentes de Aprovação</h1>
            <p style={styles.subtitle}>
              Analise os cadastros de freelancers que completaram o onboarding e aprove ou reprove.
            </p>
          </div>

          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Carregando freelancers pendentes...</p>
            </div>
          ) : freelancers.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>✅</span>
              <h3 style={styles.emptyTitle}>Nenhum freelancer pendente</h3>
              <p style={styles.emptyText}>Todos os freelancers foram analisados!</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {freelancers.map((freelancer) => (
                <div key={freelancer.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardHeaderLeft}>
                      {freelancer.photo_url ? (
                        <img src={freelancer.photo_url} alt={freelancer.name} style={styles.freelancerPhoto} />
                      ) : (
                        <div style={styles.freelancerPhotoPlaceholder}>
                          <Briefcase size={24} color={colors.primary} />
                        </div>
                      )}
                      <div>
                        <h3 style={styles.cardTitle}>{freelancer.name}</h3>
                        <p style={styles.cardEmail}>{freelancer.email}</p>
                        <p style={styles.cardDocument}>
                          {freelancer.document_type}: {formatDocument(freelancer.document_type, freelancer.document_number)}
                        </p>
                      </div>
                    </div>
                    <span style={styles.statusBadge}>Pendente</span>
                  </div>

                  <div style={styles.cardBody}>
                    {freelancer.specialties && freelancer.specialties.length > 0 && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📋 Especialidades</h4>
                        <div style={styles.badgesContainer}>
                          {freelancer.specialties.map((specId, idx) => {
                            const specName = specialtiesMap.get(specId) || specId;
                            return (
                              <span key={idx} style={styles.badge}>
                                {specName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {freelancer.service_regions && freelancer.service_regions.length > 0 && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📍 Regiões de Atendimento</h4>
                        <div style={styles.badgesContainer}>
                          {freelancer.service_regions.slice(0, 3).map((region, idx) => (
                            <span key={idx} style={styles.badge}>
                              {region}
                            </span>
                          ))}
                          {freelancer.service_regions.length > 3 && (
                            <span style={styles.moreBadge}>+{freelancer.service_regions.length - 3} mais</span>
                          )}
                        </div>
                      </div>
                    )}

                    {freelancer.experience && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>💼 Experiência</h4>
                        <p style={styles.text}>{freelancer.experience}</p>
                        {freelancer.experience_year && (
                          <p style={styles.textSmall}>Desde {freelancer.experience_year}</p>
                        )}
                      </div>
                    )}

                    {freelancer.bio && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📝 Descrição</h4>
                        <p style={styles.text}>{freelancer.bio}</p>
                      </div>
                    )}

                    {freelancer.address && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📍 Endereço</h4>
                        <p style={styles.text}>{freelancer.address}</p>
                      </div>
                    )}

                    <div style={styles.divider}></div>

                    <div style={styles.section}>
                      <p style={styles.dateText}>
                        Onboarding completo em: {formatDate(freelancer.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <button
                      onClick={() => handleOpenModal(freelancer, 'reject')}
                      style={styles.rejectButton}
                    >
                      ❌ Reprovar
                    </button>
                    <button
                      onClick={() => handleOpenModal(freelancer, 'approve')}
                      style={styles.approveButton}
                    >
                      ✅ Aprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Confirmation Modal */}
      {showModal && selectedFreelancer && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === 'approve' ? '✅ Aprovar Freelancer' : '❌ Reprovar Freelancer'}
            </h2>

            <div style={styles.modalBody}>
              <p style={styles.modalText}>
                <strong>Freelancer:</strong> {selectedFreelancer.name}
              </p>
              <p style={styles.modalText}>
                <strong>Email:</strong> {selectedFreelancer.email}
              </p>
              <p style={styles.modalText}>
                <strong>Documento:</strong> {selectedFreelancer.document_type} {formatDocument(selectedFreelancer.document_type, selectedFreelancer.document_number)}
              </p>

              {modalAction === 'approve' ? (
                <div style={styles.infoBox}>
                  <span style={styles.infoIcon}>ℹ️</span>
                  <div>
                    <strong>O que vai acontecer:</strong>
                    <ul style={styles.infoList}>
                      <li>Freelancer será marcado como "aprovado"</li>
                      <li>Status será alterado para "active"</li>
                      <li>Freelancer poderá acessar o dashboard e ver demandas</li>
                      <li>Email de aprovação será enviado</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <>
                  <div style={styles.warningBox}>
                    <span style={styles.warningIcon}>⚠️</span>
                    <div>
                      <strong>O que vai acontecer:</strong>
                      <ul style={styles.infoList}>
                        <li>Freelancer será marcado como "rejeitado"</li>
                        <li>Status será alterado para "inactive"</li>
                        <li>Freelancer não poderá acessar demandas</li>
                        <li>Email com motivo será enviado</li>
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
  emptyIcon: {
    fontSize: '64px',
    display: 'block',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
  },
  cardHeaderLeft: {
    display: 'flex',
    gap: '16px',
    flex: 1,
  },
  freelancerPhoto: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  freelancerPhotoPlaceholder: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    margin: '0 0 4px 0',
  },
  cardEmail: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 4px 0',
  },
  cardDocument: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: 0,
  },
  statusBadge: {
    padding: '4px 12px',
    backgroundColor: '#f59e0b',
    color: '#ffffff',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  cardBody: {
    padding: '20px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  badgesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  badge: {
    padding: '4px 12px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  moreBadge: {
    padding: '4px 12px',
    backgroundColor: '#e5e7eb',
    color: '#6b7280',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  text: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
    margin: 0,
  },
  textSmall: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
    margin: 0,
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '20px 0',
  },
  dateText: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  rejectButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  approveButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
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
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '20px',
  },
  modalBody: {
    marginBottom: '24px',
  },
  modalText: {
    fontSize: '14px',
    color: '#4b5563',
    marginBottom: '12px',
    lineHeight: '1.6',
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#eff6ff',
    borderRadius: '8px',
    marginTop: '16px',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.8',
  },
  warningBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    marginTop: '16px',
  },
  warningIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  formGroup: {
    marginTop: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  required: {
    color: '#ef4444',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '100px',
  },
  modalFooter: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
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
    transition: 'background-color 0.2s',
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
    transition: 'background-color 0.2s',
  },
};

export default AdminPendingFreelancersPage;

