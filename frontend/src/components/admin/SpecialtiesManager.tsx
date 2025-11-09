import React, { useState, useEffect } from 'react';
import { specialtiesApi, Specialty, CreateSpecialtyData, UpdateSpecialtyData } from '../../services/specialtiesApi';
import { useAlert } from '../../hooks/useAlert';
import colors from '../../styles/colors';
import { Plus, Edit, Trash2, Search, X, Save } from 'lucide-react';
import IconWrapper from '../IconWrapper';

const SpecialtiesManager: React.FC = () => {
  const { showSuccess, showError, showConfirm } = useAlert();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [filteredSpecialties, setFilteredSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSpecialty, setEditingSpecialty] = useState<Specialty | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<CreateSpecialtyData>({
    name: '',
    category: 'vet',
    description: '',
  });

  const categories = [
    { value: 'all', label: 'Todas' },
    { value: 'vet', label: 'Veterinário' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'clinic', label: 'Clínica' },
    { value: 'other', label: 'Outras' },
  ];

  useEffect(() => {
    loadSpecialties();
  }, []);

  useEffect(() => {
    filterSpecialties();
  }, [specialties, searchQuery, categoryFilter]);

  const loadSpecialties = async () => {
    try {
      setLoading(true);
      const { specialties: data } = await specialtiesApi.getAll();
      setSpecialties(data);
    } catch (error: any) {
      showError('Erro ao carregar especialidades: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  const filterSpecialties = () => {
    let filtered = [...specialties];

    // Filtrar por categoria
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((s) => s.category === categoryFilter);
    }

    // Filtrar por busca
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }

    setFilteredSpecialties(filtered);
  };

  const handleOpenModal = (specialty?: Specialty) => {
    if (specialty) {
      setEditingSpecialty(specialty);
      setFormData({
        name: specialty.name,
        category: specialty.category as 'vet' | 'freelancer' | 'clinic' | 'other',
        description: specialty.description || '',
      });
    } else {
      setEditingSpecialty(null);
      setFormData({
        name: '',
        category: 'vet',
        description: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSpecialty(null);
    setFormData({
      name: '',
      category: 'vet',
      description: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    if (!formData.name.trim()) {
      showError('Nome da especialidade é obrigatório');
      return;
    }

    if (!formData.category) {
      showError('Categoria é obrigatória');
      return;
    }

    try {
      setSaving(true);

      if (editingSpecialty) {
        // Atualizar
        const updateData: UpdateSpecialtyData = {
          name: formData.name.trim(),
          category: formData.category,
          description: formData.description?.trim() || undefined,
        };
        await specialtiesApi.update(editingSpecialty.id, updateData);
        showSuccess('Especialidade atualizada com sucesso!');
      } else {
        // Criar
        await specialtiesApi.create({
          name: formData.name.trim(),
          category: formData.category,
          description: formData.description?.trim() || undefined,
        });
        showSuccess('Especialidade criada com sucesso!');
      }

      handleCloseModal();
      loadSpecialties();
    } catch (error: any) {
      showError('Erro ao salvar especialidade: ' + (error.message || 'Tente novamente'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (specialty: Specialty) => {
    showConfirm(
      `Tem certeza que deseja deletar a especialidade "${specialty.name}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await specialtiesApi.delete(specialty.id);
          showSuccess('Especialidade deletada com sucesso!');
          loadSpecialties();
        } catch (error: any) {
          showError('Erro ao deletar especialidade: ' + (error.message || 'Tente novamente'));
        }
      },
      'Deletar Especialidade'
    );
  };

  const getCategoryLabel = (category: string) => {
    const cat = categories.find((c) => c.value === category);
    return cat ? cat.label : category;
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Carregando especialidades...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header com ações */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>Gerenciar Especialidades</h2>
          <p style={styles.subtitle}>
            {filteredSpecialties.length} especialidade{filteredSpecialties.length !== 1 ? 's' : ''} encontrada{filteredSpecialties.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => handleOpenModal()} style={styles.addButton}>
          <IconWrapper icon={Plus} size={18} />
          Adicionar Especialidade
        </button>
      </div>

      {/* Filtros */}
      <div style={styles.filters}>
        <div style={styles.searchContainer}>
          <IconWrapper icon={Search} size={18} color={colors.textSecondary} />
          <input
            type="text"
            placeholder="Buscar especialidades..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <IconWrapper icon={X} size={16} />
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={styles.categoryFilter}
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de especialidades */}
      <div style={styles.tableContainer}>
        {filteredSpecialties.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhuma especialidade encontrada</p>
            {searchQuery || categoryFilter !== 'all' ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                }}
                style={styles.clearFiltersButton}
              >
                Limpar filtros
              </button>
            ) : (
              <button onClick={() => handleOpenModal()} style={styles.addFirstButton}>
                Criar primeira especialidade
              </button>
            )}
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Categoria</th>
                <th style={styles.th}>Descrição</th>
                <th style={styles.thActions}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpecialties.map((specialty) => (
                <tr key={specialty.id} style={styles.tr}>
                  <td style={styles.td}>
                    <strong>{specialty.name}</strong>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.categoryBadge}>{getCategoryLabel(specialty.category)}</span>
                  </td>
                  <td style={styles.td}>
                    {specialty.description || (
                      <span style={styles.noDescription}>Sem descrição</span>
                    )}
                  </td>
                  <td style={styles.tdActions}>
                    <button
                      onClick={() => handleOpenModal(specialty)}
                      style={styles.actionButton}
                      title="Editar"
                    >
                      <IconWrapper icon={Edit} size={16} color={colors.primary} />
                    </button>
                    <button
                      onClick={() => handleDelete(specialty)}
                      style={styles.actionButton}
                      title="Deletar"
                    >
                      <IconWrapper icon={Trash2} size={16} color={colors.danger} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de criação/edição */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {editingSpecialty ? 'Editar Especialidade' : 'Nova Especialidade'}
              </h3>
              <button onClick={handleCloseModal} style={styles.modalCloseButton}>
                <IconWrapper icon={X} size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Nome <span style={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Cirurgia"
                  style={styles.input}
                  required
                  autoFocus
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Categoria <span style={styles.required}>*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value as 'vet' | 'freelancer' | 'clinic' | 'other',
                    })
                  }
                  style={styles.select}
                  required
                >
                  <option value="vet">Veterinário</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="clinic">Clínica</option>
                  <option value="other">Outras</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição da especialidade (opcional)"
                  rows={4}
                  style={styles.textarea}
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={styles.cancelButton}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" style={styles.saveButton} disabled={saving}>
                  <IconWrapper icon={Save} size={18} />
                  {saving ? 'Salvando...' : editingSpecialty ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    color: colors.textSecondary,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: colors.text,
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  searchContainer: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    backgroundColor: '#ffffff',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: colors.text,
  },
  clearButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    color: colors.textSecondary,
  },
  categoryFilter: {
    padding: '10px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    minWidth: '150px',
  },
  tableContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
  },
  emptyState: {
    padding: '48px',
    textAlign: 'center',
    color: colors.textSecondary,
  },
  clearFiltersButton: {
    marginTop: '16px',
    padding: '8px 16px',
    backgroundColor: colors.surface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  addFirstButton: {
    marginTop: '16px',
    padding: '8px 16px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    borderBottom: `2px solid ${colors.border}`,
    backgroundColor: colors.surface,
  },
  thActions: {
    padding: '16px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    borderBottom: `2px solid ${colors.border}`,
    backgroundColor: colors.surface,
    width: '120px',
  },
  tr: {
    borderBottom: `1px solid ${colors.border}`,
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: colors.text,
  },
  tdActions: {
    padding: '16px',
    textAlign: 'center',
  },
  categoryBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  noDescription: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actionButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    margin: '0 4px',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: colors.text,
    margin: 0,
  },
  modalCloseButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.textSecondary,
  },
  form: {
    padding: '24px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '8px',
  },
  required: {
    color: colors.danger,
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#ffffff',
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default SpecialtiesManager;

