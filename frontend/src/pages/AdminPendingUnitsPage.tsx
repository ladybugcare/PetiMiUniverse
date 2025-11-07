import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { Home, Building2, Stethoscope, ClipboardList, Clock, User, LogOut } from 'lucide-react';
import colors from '../styles/colors';
import { adminApi, PendingUnit } from '../services/adminApi';

const AdminPendingUnitsPage: React.FC = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState<PendingUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<PendingUnit | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const menuItems: MenuItem[] = [
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'pending-units', label: 'Aprovações Pendentes', icon: <Clock size={20} color={colors.primary} />, action: 'navigate', path: '/admin/pending-units' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'profile', label: 'Perfil', icon: <User size={20} color={colors.primary} />, action: 'navigate', path: '/admin-profile' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  useEffect(() => {
    loadPendingUnits();
  }, []);

  const loadPendingUnits = async () => {
    try {
      setLoading(true);
      const { units: pendingUnits } = await adminApi.getPendingUnits();
      setUnits(pendingUnits);
    } catch (error) {
      console.error('Error loading pending units:', error);
      alert('Erro ao carregar unidades pendentes.');
    } finally {
      setLoading(false);
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
      alert('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      const approved = modalAction === 'approve';
      await adminApi.reviewUnit(selectedUnit.id, approved, rejectionReason);

      alert(
        approved
          ? '✅ Unidade aprovada com sucesso! A clínica foi ativada.'
          : '❌ Unidade reprovada. A clínica foi notificada.'
      );

      handleCloseModal();
      loadPendingUnits(); // Reload list
    } catch (error: any) {
      console.error('Error reviewing unit:', error);
      alert(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'reprovar'} unidade: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <DashboardLayout pageName="Aprovações Pendentes" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>⏳ Unidades Pendentes de Aprovação</h1>
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
              <span style={styles.emptyIcon}>✅</span>
              <h3 style={styles.emptyTitle}>Nenhuma unidade pendente</h3>
              <p style={styles.emptyText}>Todas as unidades foram analisadas!</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {units.map((unit) => (
                <div key={unit.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div>
                      <h3 style={styles.cardTitle}>
                        {unit.name}
                        {unit.nickname && <span style={styles.nicknameText}> ({unit.nickname})</span>}
                      </h3>
                      <p style={styles.cardSubtitle}>
                        {unit.is_main && <span style={styles.mainBadge}>🏆 Unidade Principal</span>}
                      </p>
                    </div>
                    <span style={styles.statusBadge}>Pendente</span>
                  </div>

                  <div style={styles.cardBody}>
                    <div style={styles.section}>
                      <h4 style={styles.sectionTitle}>📍 Localização</h4>
                      <p style={styles.text}>{unit.address}</p>
                      <p style={styles.text}>
                        {unit.city} - {unit.state}
                      </p>
                    </div>

                    {unit.phone && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📞 Telefone</h4>
                        <p style={styles.text}>{unit.phone}</p>
                      </div>
                    )}

                    {unit.cnpj && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>🏢 CNPJ</h4>
                        <p style={styles.text}>{unit.cnpj}</p>
                      </div>
                    )}

                    {unit.technical_manager && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>👨‍⚕️ Responsável Técnico</h4>
                        <p style={styles.text}>{unit.technical_manager}</p>
                      </div>
                    )}

                    <div style={styles.divider}></div>

                    <div style={styles.section}>
                      <h4 style={styles.sectionTitle}>🏥 Dados da Clínica</h4>
                      <p style={styles.text}>
                        <strong>Nome:</strong> {unit.clinic.name}
                      </p>
                      <p style={styles.text}>
                        <strong>Email:</strong> {unit.clinic.email}
                      </p>
                      {unit.clinic.phone && (
                        <p style={styles.text}>
                          <strong>Telefone:</strong> {unit.clinic.phone}
                        </p>
                      )}
                      {unit.clinic.cnpj && (
                        <p style={styles.text}>
                          <strong>CNPJ:</strong> {unit.clinic.cnpj}
                        </p>
                      )}
                    </div>

                    <div style={styles.section}>
                      <p style={styles.dateText}>
                        Criado em: {new Date(unit.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <button
                      onClick={() => handleOpenModal(unit, 'reject')}
                      style={styles.rejectButton}
                    >
                      ❌ Reprovar
                    </button>
                    <button
                      onClick={() => handleOpenModal(unit, 'approve')}
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
      {showModal && selectedUnit && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === 'approve' ? '✅ Aprovar Unidade' : '❌ Reprovar Unidade'}
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
                  <span style={styles.infoIcon}>ℹ️</span>
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
                    <span style={styles.warningIcon}>⚠️</span>
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
    marginBottom: '16px',
    display: 'block',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
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
  cardSubtitle: {
    fontSize: '13px',
    color: '#6b7280',
  },
  mainBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
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
  },
  text: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
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
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  warningIcon: {
    fontSize: '20px',
    flexShrink: 0,
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

