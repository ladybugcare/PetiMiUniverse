import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import colors from '../styles/colors';
import { useAlert } from '../hooks/useAlert';
import { usePermissions } from '../hooks/usePermissions';
import { useUnit } from '../contexts/UnitContext';
import { unitsApi } from '../services/unitsApi';
import { Unit, CreateUnitData } from '../types/units';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

const UnitsManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { canCreateUnit, canEditUnit, canDeleteUnit } = usePermissions();
  const { units, loadUnits, loading: unitsLoading } = useUnit();

  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [formData, setFormData] = useState<Partial<CreateUnitData>>({
    name: '',
    nickname: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    phone: '',
    technical_manager: '',
  });

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  // Redirect to CreateFirstUnitPage if no units exist (após carregar do contexto)
  useEffect(() => {
    if (unitsLoading) return;
    if (units.length === 0) {
      navigate('/units/create-first');
    }
  }, [units, unitsLoading, navigate]);

  const handleOpenModal = (unit?: Unit) => {
    // If trying to create a new unit but no units exist, redirect to first unit flow
    if (!unit && !unitsLoading && units.length === 0) {
      navigate('/units/create-first');
      return;
    }

    if (unit) {
      setEditingUnit(unit);
      setFormData({
        name: unit.name,
        nickname: unit.nickname || '',
        cnpj: unit.cnpj || '',
        address: unit.address,
        city: unit.city,
        state: unit.state,
        phone: unit.phone || '',
        technical_manager: unit.technical_manager || '',
      });
    } else {
      setEditingUnit(null);
      setFormData({
        name: '',
        nickname: '',
        cnpj: '',
        address: '',
        city: '',
        state: '',
        phone: '',
        technical_manager: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUnit(null);
    setFormData({
      name: '',
      nickname: '',
      cnpj: '',
      address: '',
      city: '',
      state: '',
      phone: '',
      technical_manager: '',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.address || !formData.city || !formData.state) {
      showError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      setLoading(true);

      if (editingUnit) {
        // Update
        await unitsApi.update(editingUnit.id, formData);
        showSuccess('Unidade atualizada com sucesso!');
      } else {
        // Create
        const clinicId = user.id;
        await unitsApi.create({
          ...formData as CreateUnitData,
          clinic_id: clinicId,
        });
        showSuccess('Unidade criada com sucesso!');
      }

      await loadUnits();
      handleCloseModal();
    } catch (error: any) {
      showError('Erro ao salvar unidade: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (unit: Unit) => {
    showConfirm(
      `Tem certeza que deseja deletar a unidade "${unit.name}"?`,
      async () => {
        try {
          await unitsApi.delete(unit.id);
          showSuccess('Unidade deletada com sucesso!');
          await loadUnits();
        } catch (error: any) {
          showError('Erro ao deletar unidade: ' + (error.message || 'Tente novamente'));
        }
      },
      'Deletar Unidade'
    );
  };

  return (
    <>
      <DashboardLayout pageName="Gerenciar Unidades" menuItems={menuItems}>
        <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Unidades</h1>
            <p style={styles.subtitle}>Gerencie as unidades da sua clínica</p>
          </div>
          {canCreateUnit && (
            <button onClick={() => handleOpenModal()} style={styles.createButton}>
              + Nova Unidade
            </button>
          )}
        </div>

        {units.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Nenhuma unidade cadastrada</p>
            {canCreateUnit && (
              <button onClick={() => handleOpenModal()} style={styles.createButton}>
                Criar Primeira Unidade
              </button>
            )}
          </div>
        ) : (
          <div style={styles.grid}>
            {units.map((unit) => (
              <div key={unit.id} style={styles.card}>
                {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
                <h3 style={styles.unitName}>
                  {unit.name}
                  {unit.nickname && <span style={styles.nicknameText}> ({unit.nickname})</span>}
                </h3>
                <div style={styles.unitInfo}>
                  <p><strong>CNPJ:</strong> {unit.cnpj || 'N/A'}</p>
                  <p><strong>Endereço:</strong> {unit.address}</p>
                  <p><strong>Cidade/Estado:</strong> {unit.city}/{unit.state}</p>
                  <p><strong>Telefone:</strong> {unit.phone || 'N/A'}</p>
                  <p><strong>Responsável Técnico:</strong> {unit.technical_manager || 'N/A'}</p>
                </div>
                <div style={styles.actions}>
                  {canEditUnit && (
                    <button onClick={() => navigate(`/units/${unit.id}`)} style={styles.editButton}>
                      Visualizar
                    </button>
                  )}
                  {canDeleteUnit && !unit.is_main && (
                    <button onClick={() => handleDelete(unit)} style={styles.deleteButton}>
                      Deletar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={styles.modalOverlay} onClick={handleCloseModal}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>
                {editingUnit ? 'Editar Unidade' : 'Nova Unidade'}
              </h2>
              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Nome da Unidade *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Apelido da Unidade *</label>
                  <input
                    type="text"
                    name="nickname"
                    value={formData.nickname}
                    onChange={handleChange}
                    placeholder="Ex: Granja Viana, Centro, Unidade 1"
                    style={styles.input}
                    required
                    maxLength={100}
                  />
                  <small style={styles.helpText}>
                    Use o bairro ou ponto de referência para diferenciar unidades
                  </small>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>CNPJ</label>
                  <input
                    type="text"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Endereço *</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.row}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Cidade *</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Estado *</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      style={styles.input}
                      maxLength={2}
                      required
                    />
                  </div>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Telefone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Responsável Técnico</label>
                  <input
                    type="text"
                    name="technical_manager"
                    value={formData.technical_manager}
                    onChange={handleChange}
                    style={styles.input}
                  />
                </div>
                <div style={styles.modalActions}>
                  <button type="button" onClick={handleCloseModal} style={styles.cancelButton}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} style={styles.submitButton}>
                    {loading ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/units/create')}
        style={styles.fab}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        aria-label="Nova Unidade"
      >
        <span style={styles.fabIcon}>+</span>
      </button>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  subtitle: {
    fontSize: '16px',
    color: '#737373',
    marginTop: '8px',
  },
  createButton: {
    padding: '12px 24px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 32px',
  },
  emptyText: {
    fontSize: '18px',
    color: '#737373',
    marginBottom: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
    position: 'relative',
  },
  mainBadge: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
  },
  unitName: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  nicknameText: {
    fontSize: '18px',
    fontWeight: '400',
    color: '#737373',
  },
  unitInfo: {
    fontSize: '14px',
    color: '#525252',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  editButton: {
    flex: '1',
    padding: '10px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  deleteButton: {
    flex: '1',
    padding: '10px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
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
  row: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
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
  },
  helpText: {
    fontSize: '12px',
    color: '#737373',
    marginTop: '4px',
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
  },
  submitButton: {
    flex: '1',
    padding: '12px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  fab: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, colors.brand.primary[500] 0%, colors.brand.primary[800] 100%)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 16px rgba(196, 108, 106, 0.3), 0 4px 8px rgba(0, 0, 0, 0.2)',
    transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    zIndex: 999,
  },
  fabIcon: {
    fontSize: '32px',
    color: '#ffffff',
    fontWeight: '300',
    lineHeight: 1,
  },
};

export default UnitsManagementPage;

