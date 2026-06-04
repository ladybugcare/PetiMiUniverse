import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageUploader from './ImageUploader';
import { marketplaceApi } from '../services/marketplaceApi';
import { BRAZILIAN_STATES, getCitiesByState } from '../utils/locationData';
import { colors } from '../styles/colors';

type ListingType = 'sale' | 'wanted';
type CategoryType = 'equipment' | 'medicine' | 'vaccine' | 'supplies';

interface MarketplaceFormStepProps {
  listingType: ListingType;
  category: CategoryType;
  onBack: () => void;
}

const getCategoryInfo = (category: CategoryType, listingType: ListingType) => {
  const isSale = listingType === 'sale';
  
  const categories = {
    equipment: {
      title: isSale ? 'Vender Equipamento' : 'Procurar Equipamento',
      subtitle: isSale ? 'Descreva o equipamento que você está vendendo' : 'Descreva o equipamento que você procura',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    medicine: {
      title: isSale ? 'Vender Medicamento' : 'Procurar Medicamento',
      subtitle: isSale ? 'Descreva o medicamento que você está vendendo' : 'Descreva o medicamento que você procura',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
    vaccine: {
      title: isSale ? 'Vender Vacina' : 'Procurar Vacina',
      subtitle: isSale ? 'Descreva a vacina que você está vendendo' : 'Descreva a vacina que você procura',
      gradient: 'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)',
    },
    supplies: {
      title: isSale ? 'Vender Suprimentos' : 'Procurar Suprimentos',
      subtitle: isSale ? 'Descreva os suprimentos que você está vendendo' : 'Descreva os suprimentos que você procura',
      gradient: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    },
  };

  return categories[category];
};

const MarketplaceFormStep: React.FC<MarketplaceFormStepProps> = ({
  listingType,
  category,
  onBack,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    condition: 'new' as 'new' | 'used' | 'refurbished',
    brand: '',
    model: '',
    price: '',
    quantity_available: '1',
    negotiable: false,
    state: '',
    city: '',
  });

  const categoryInfo = getCategoryInfo(category, listingType);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    // Handle checkbox
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({
        ...formData,
        [name]: checked,
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }

    // Load cities when state changes
    if (name === 'state' && value) {
      const stateCities = getCitiesByState(value);
      setCities(stateCities);
      setFormData({
        ...formData,
        state: value,
        city: '', // Reset city when state changes
      });
    }
  };

  const handleImagesChange = (files: File[]) => {
    setImageFiles(files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.title || !formData.description) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (listingType === 'sale') {
      if (!formData.price || parseFloat(formData.price) <= 0) {
        alert('Por favor, insira um preço válido.');
        return;
      }
      if (imageFiles.length === 0) {
        alert('Por favor, adicione pelo menos uma imagem do produto.');
        return;
      }
    }

    try {
      setLoading(true);

      const user = JSON.parse(localStorage.getItem('user') || '');
      const sellerId = user.id;
      const sellerType = user.user_metadata?.role || user.role;

      // Upload images first if there are any
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploadResult = await marketplaceApi.uploadImages(imageFiles);
        imageUrls = uploadResult.urls;
      }

      // Create listing
      await marketplaceApi.create({
        title: formData.title,
        description: formData.description,
        seller_id: sellerId,
        seller_type: sellerType,
        category,
        condition: formData.condition,
        brand: formData.brand || undefined,
        model: formData.model || undefined,
        price: listingType === 'sale' ? parseFloat(formData.price) : undefined,
        quantity_available: parseInt(formData.quantity_available),
        negotiable: formData.negotiable,
        images: imageUrls,
        listing_type: listingType,
        city: formData.city || undefined,
        state: formData.state || undefined,
      });

      alert('Anúncio criado com sucesso!');
      navigate('/marketplace');
    } catch (error: any) {
      console.error('Error creating listing:', error);
      alert('Erro ao criar anúncio: ' + (error.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Colored Header */}
      <div
        style={{
          ...styles.header,
          background: categoryInfo.gradient,
        }}
      >
        <h1 style={styles.headerTitle}>{categoryInfo.title}</h1>
        <p style={styles.headerSubtitle}>{categoryInfo.subtitle}</p>
      </div>

      {/* Form */}
      <div style={styles.formCard}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              {listingType === 'sale' ? 'Título do Anúncio' : 'O que você procura'} *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder={
                listingType === 'sale'
                  ? 'Ex: Ultrassom Veterinário Portátil'
                  : 'Ex: Preciso de ultrassom veterinário'
              }
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Descrição Detalhada *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder={
                listingType === 'sale'
                  ? 'Descreva o estado, especificações, ano de fabricação, motivo da venda...'
                  : 'Descreva o que você está procurando, especificações desejadas, orçamento...'
              }
              style={styles.textarea}
              required
            />
          </div>

          {listingType === 'sale' && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Condição *</label>
                <select
                  name="condition"
                  value={formData.condition}
                  onChange={handleChange}
                  style={styles.input}
                  required
                >
                  <option value="new">Novo</option>
                  <option value="used">Usado</option>
                  <option value="refurbished">Remanufaturado</option>
                </select>
              </div>

              <div style={styles.gridRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Marca</label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="Ex: Mindray"
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>Modelo</label>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="Ex: M5Vet"
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.gridRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Preço (R$) *</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={styles.input}
                    required
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>Quantidade Disponível *</label>
                  <input
                    type="number"
                    name="quantity_available"
                    value={formData.quantity_available}
                    onChange={handleChange}
                    min="1"
                    style={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="negotiable"
                    checked={formData.negotiable}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxText}>Preço negociável</span>
                </label>
              </div>
            </>
          )}

          {listingType === 'wanted' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Orçamento Máximo (R$)</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="Opcional"
                min="0"
                step="0.01"
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              {listingType === 'sale' ? 'Fotos do Produto *' : 'Fotos de Referência'}
            </label>
            <ImageUploader
              maxImages={5}
              maxSizeMB={5}
              onImagesChange={handleImagesChange}
            />
            <p style={styles.helperText}>
              {listingType === 'sale'
                ? 'Adicione fotos reais do produto. A primeira foto será a principal.'
                : 'Fotos são opcionais para anúncios de procura.'}
            </p>
          </div>

          <div style={styles.gridRow}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Estado</label>
              <select
                name="state"
                value={formData.state}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="">Selecione...</option>
                {BRAZILIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Cidade</label>
              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                style={styles.input}
                disabled={!formData.state}
              >
                <option value="">Selecione...</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={onBack}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
              }}
            >
              ← Voltar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Criando...' : `Publicar ${listingType === 'sale' ? 'Venda' : 'Procura'} →`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    padding: '40px 32px',
    borderRadius: '16px 16px 0 0',
    marginBottom: '0',
  },
  headerTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '8px',
    textShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  headerSubtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: '0 0 16px 16px',
    padding: '32px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    resize: 'vertical',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  checkboxGroup: {
    padding: '12px 0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  checkboxText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#404040',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    paddingTop: '16px',
  },
  button: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
  },
  helperText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    marginTop: '8px',
    fontStyle: 'italic',
  },
};

export default MarketplaceFormStep;

