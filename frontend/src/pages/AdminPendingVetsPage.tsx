import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { adminApi } from '../services/adminApi';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import { useAlert } from '../hooks/useAlert';
import { API_BASE_URL } from '../services/api';
import { supabase } from '../services/supabase';
import { Eye, CheckCircle, XCircle, FileText, Download, Stethoscope } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

interface PendingVet {
  id: string;
  name: string;
  email: string;
  crmv: string;
  specialties: string[];
  service_regions: string[];
  experience_year: number;
  experience: string;
  bio: string;
  crmv_file_url?: string;
  photo_url?: string;
  onboarding_completed: boolean;
  approval_status: string;
  created_at: string;
  updated_at: string;
}

const AdminPendingVetsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useAlert();
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  
  const [vets, setVets] = useState<PendingVet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVet, setSelectedVet] = useState<PendingVet | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  useEffect(() => {
    loadSpecialties();
    loadPendingVets();
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

  const loadPendingVets = async () => {
    try {
      setLoading(true);
      const { vets: pendingVets } = await adminApi.getPendingVets();
      setVets(pendingVets);
    } catch (error: any) {
      console.error('Error loading pending vets:', error);
      showError('Erro ao carregar veterinários pendentes: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (vet: PendingVet, action: 'approve' | 'reject') => {
    setSelectedVet(vet);
    setModalAction(action);
    setRejectionReason('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedVet(null);
    setRejectionReason('');
  };

  const handleConfirm = async () => {
    if (!selectedVet) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      if (modalAction === 'approve') {
        await adminApi.approveVet(selectedVet.id);
        showSuccess('✅ Veterinário aprovado com sucesso!');
      } else {
        await adminApi.rejectVet(selectedVet.id, rejectionReason);
        showSuccess('❌ Veterinário rejeitado. Email com motivo foi enviado.');
      }

      handleCloseModal();
      loadPendingVets();
    } catch (error: any) {
      console.error('Error reviewing vet:', error);
      showError(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'rejeitar'} veterinário: ${error.message || 'Tente novamente'}`);
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

  // Extrair path da URL do Supabase Storage
  const extractDocumentPath = (crmvFileUrl: string): string | null => {
    try {
      const url = new URL(crmvFileUrl);
      const pathMatch = url.pathname.match(/\/vet-documents\/(.+)$/);
      
      if (pathMatch && pathMatch[1]) {
        return decodeURIComponent(pathMatch[1]);
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao extrair path da URL:', error);
      return null;
    }
  };

  // Fazer download do documento
  const handleDownloadDocument = async (crmvFileUrl: string, vetId: string) => {
    if (downloadingDocId === vetId) return; // Evitar múltiplos cliques
    
    setDownloadingDocId(vetId);
    
    try {
      const filePath = extractDocumentPath(crmvFileUrl);
      
      if (!filePath) {
        showError('Não foi possível extrair o caminho do documento.');
        return;
      }

      // Obter token de autenticação
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        showError('Você precisa estar autenticado para baixar o documento.');
        return;
      }

      // Fazer requisição para baixar o arquivo
      const url = `${API_BASE_URL}/admin/vets/${vetId}/document?path=${encodeURIComponent(filePath)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      // Obter o blob do arquivo
      const blob = await response.blob();
      
      // Extrair nome do arquivo do header Content-Disposition ou usar padrão
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = 'documento.pdf';
      
      if (contentDisposition) {
        // Suporta: filename="arquivo.pdf" ou filename=arquivo.pdf
        const fileNameMatch = contentDisposition.match(/filename[*]?=['"]?([^'";]+)['"]?/i);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1].trim();
        }
      }
      
      // Fallback: usar nome do path se não conseguir extrair do header
      if (fileName === 'documento.pdf') {
        const pathParts = filePath.split('/');
        const pathFileName = pathParts[pathParts.length - 1];
        if (pathFileName) {
          fileName = pathFileName;
        }
      }

      // Criar link temporário para download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      showSuccess('Documento baixado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao baixar documento:', error);
      showError(`Erro ao baixar documento: ${error.message || 'Tente novamente'}`);
    } finally {
      setDownloadingDocId(null);
    }
  };

  return (
    <>
      <DashboardLayout pageName="Aprovações de Veterinários" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>⏳ Veterinários Pendentes de Aprovação</h1>
            <p style={styles.subtitle}>
              Analise os cadastros de veterinários que completaram o onboarding e aprove ou reprove.
            </p>
          </div>

          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Carregando veterinários pendentes...</p>
            </div>
          ) : vets.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>✅</span>
              <h3 style={styles.emptyTitle}>Nenhum veterinário pendente</h3>
              <p style={styles.emptyText}>Todos os veterinários foram analisados!</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {vets.map((vet) => (
                <div key={vet.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardHeaderLeft}>
                      {vet.photo_url ? (
                        <img src={vet.photo_url} alt={vet.name} style={styles.vetPhoto} />
                      ) : (
                        <div style={styles.vetPhotoPlaceholder}>
                          <Stethoscope size={24} color={colors.brand.primary[500]} />
                        </div>
                      )}
                      <div>
                        <h3 style={styles.cardTitle}>{vet.name}</h3>
                        <p style={styles.cardEmail}>{vet.email}</p>
                        <p style={styles.cardCrmv}>CRMV: {vet.crmv}</p>
                      </div>
                    </div>
                    <span style={styles.statusBadge}>Pendente</span>
                  </div>

                  <div style={styles.cardBody}>
                    {vet.specialties && vet.specialties.length > 0 && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📋 Especialidades</h4>
                        <div style={styles.badgesContainer}>
                          {vet.specialties.map((specId, idx) => {
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

                    {vet.service_regions && vet.service_regions.length > 0 && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📍 Regiões de Atendimento</h4>
                        <div style={styles.badgesContainer}>
                          {vet.service_regions.slice(0, 3).map((region, idx) => (
                            <span key={idx} style={styles.badge}>
                              {region}
                            </span>
                          ))}
                          {vet.service_regions.length > 3 && (
                            <span style={styles.moreBadge}>+{vet.service_regions.length - 3} mais</span>
                          )}
                        </div>
                      </div>
                    )}

                    {vet.experience && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>💼 Experiência</h4>
                        <p style={styles.text}>{vet.experience}</p>
                        {vet.experience_year && (
                          <p style={styles.textSmall}>Desde {vet.experience_year}</p>
                        )}
                      </div>
                    )}

                    {vet.bio && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📝 Descrição</h4>
                        <p style={styles.text}>{vet.bio}</p>
                      </div>
                    )}

                    {vet.crmv_file_url && (
                      <div style={styles.section}>
                        <h4 style={styles.sectionTitle}>📄 CRMV</h4>
                        <button
                          onClick={() => handleDownloadDocument(vet.crmv_file_url!, vet.id)}
                          disabled={downloadingDocId === vet.id}
                          style={{
                            ...styles.downloadButton,
                            ...(downloadingDocId === vet.id ? styles.downloadButtonDisabled : {}),
                          }}
                        >
                          <Download size={16} />
                          {downloadingDocId === vet.id ? 'Baixando...' : 'Baixar Documento'}
                        </button>
                      </div>
                    )}

                    <div style={styles.divider}></div>

                    <div style={styles.section}>
                      <p style={styles.dateText}>
                        Onboarding completo em: {formatDate(vet.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <button
                      onClick={() => handleOpenModal(vet, 'reject')}
                      style={styles.rejectButton}
                    >
                      ❌ Reprovar
                    </button>
                    <button
                      onClick={() => handleOpenModal(vet, 'approve')}
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
      {showModal && selectedVet && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === 'approve' ? '✅ Aprovar Veterinário' : '❌ Reprovar Veterinário'}
            </h2>

            <div style={styles.modalBody}>
              <p style={styles.modalText}>
                <strong>Veterinário:</strong> {selectedVet.name}
              </p>
              <p style={styles.modalText}>
                <strong>Email:</strong> {selectedVet.email}
              </p>
              <p style={styles.modalText}>
                <strong>CRMV:</strong> {selectedVet.crmv}
              </p>

              {modalAction === 'approve' ? (
                <div style={styles.infoBox}>
                  <span style={styles.infoIcon}>ℹ️</span>
                  <div>
                    <strong>O que vai acontecer:</strong>
                    <ul style={styles.infoList}>
                      <li>Veterinário será marcado como "aprovado"</li>
                      <li>Status será alterado para "active"</li>
                      <li>Veterinário poderá acessar o dashboard e ver demandas</li>
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
                        <li>Veterinário será marcado como "rejeitado"</li>
                        <li>Status será alterado para "inactive"</li>
                        <li>Veterinário não poderá acessar demandas</li>
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
  },
  vetPhoto: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  vetPhotoPlaceholder: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: colors.brand.primary[100],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  },
  cardEmail: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  cardCrmv: {
    fontSize: '13px',
    color: '#9ca3af',
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
  },
  moreBadge: {
    padding: '4px 10px',
    backgroundColor: colors.neutral[100],
    color: colors.textSecondary,
    borderRadius: '12px',
    fontSize: '12px',
    fontStyle: 'italic',
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
  },
  fileLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: colors.brand.primary[100],
    color: colors.brand.primary[500],
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
  downloadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: colors.brand.primary[100],
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  downloadButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '16px 0',
  },
  dateText: {
    fontSize: '13px',
    color: '#9ca3af',
    fontStyle: 'italic',
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

export default AdminPendingVetsPage;

