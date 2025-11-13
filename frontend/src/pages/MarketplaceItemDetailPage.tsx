import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { marketplaceApi, MarketplaceItem } from '../services/marketplaceApi';
import { marketplaceMessagesApi } from '../services/marketplaceMessagesApi';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

const MarketplaceItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'VET';
  const { menuItems } = useSidebarMenu(userRole);

  useEffect(() => {
    if (id) {
      loadItem();
    }
  }, [id]);

  const loadItem = async () => {
    try {
      setLoading(true);
      const result = await marketplaceApi.getById(id!);
      setItem(result.item);
    } catch (error: any) {
      console.error('Error loading item:', error);
      alert('Erro ao carregar item: ' + error.message);
      navigate('/marketplace');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !item) return;

    try {
      setSendingMessage(true);
      const user = JSON.parse(localStorage.getItem('user') || '');
      
      await marketplaceMessagesApi.send({
        item_id: item.id,
        receiver_id: item.seller_id,
        sender_id: user.id,
        message: message.trim(),
      });

      alert('Mensagem enviada com sucesso!');
      setMessage('');
      setShowMessageModal(false);
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert('Erro ao enviar mensagem: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleMarkAsSold = async () => {
    if (!item || !window.confirm('Deseja marcar este item como vendido?')) return;

    try {
      await marketplaceApi.markAsSold(item.id);
      alert('Item marcado como vendido!');
      loadItem();
    } catch (error: any) {
      console.error('Error marking as sold:', error);
      alert('Erro ao marcar como vendido: ' + error.message);
    }
  };

  if (loading) {
    return (
      <DashboardLayout pageName="Carregando..." menuItems={menuItems}>
        <div style={styles.loading}>Carregando item...</div>
      </DashboardLayout>
    );
  }

  if (!item) {
    return (
      <DashboardLayout pageName="Item não encontrado" menuItems={menuItems}>
        <div style={styles.notFound}>Item não encontrado</div>
      </DashboardLayout>
    );
  }

  const images = item.images && item.images.length > 0
    ? item.images
    : ['https://via.placeholder.com/800x600?text=Sem+Imagem'];

  const isOwner = user?.id === item.seller_id;

  return (
    <DashboardLayout pageName={item.title} menuItems={menuItems}>
      <div style={styles.container}>
        <button onClick={() => navigate('/marketplace')} style={styles.backButton}>
          ← Voltar ao Marketplace
        </button>

        <div style={styles.content}>
          {/* Left: Images */}
          <div style={styles.leftColumn}>
            <div style={styles.mainImageContainer}>
              <img
                src={images[selectedImageIndex]}
                alt={item.title}
                style={styles.mainImage}
              />
              {item.listing_type === 'sale' && item.status === 'sold' && (
                <div style={styles.soldBadge}>VENDIDO</div>
              )}
            </div>
            
            {images.length > 1 && (
              <div style={styles.thumbnailsContainer}>
                {images.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt={`Thumbnail ${index + 1}`}
                    style={{
                      ...styles.thumbnail,
                      border: selectedImageIndex === index ? '3px solid #7c3aed' : '2px solid #e5e5e5',
                    }}
                    onClick={() => setSelectedImageIndex(index)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div style={styles.rightColumn}>
            <div style={styles.header}>
              <div style={styles.badges}>
                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: item.listing_type === 'sale' ? '#10b981' : '#3b82f6',
                  }}
                >
                  {item.listing_type === 'sale' ? '🛍️ Venda' : '🔍 Procura'}
                </span>
                {item.listing_type === 'sale' && (
                  <span style={{...styles.badge, backgroundColor: '#f59e0b'}}>
                    {item.condition === 'new' ? 'Novo' : item.condition === 'used' ? 'Usado' : 'Remanufaturado'}
                  </span>
                )}
              </div>
              
              <h1 style={styles.title}>{item.title}</h1>

              {item.listing_type === 'sale' && item.price && (
                <div style={styles.priceSection}>
                  <span style={styles.price}>
                    R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  {item.negotiable && (
                    <span style={styles.negotiableBadge}>Negociável</span>
                  )}
                </div>
              )}
            </div>

            <div style={styles.description}>
              <h3 style={styles.sectionTitle}>Descrição</h3>
              <p style={styles.descriptionText}>{item.description}</p>
            </div>

            <div style={styles.details}>
              <h3 style={styles.sectionTitle}>Detalhes</h3>
              <div style={styles.detailsGrid}>
                {item.brand && (
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Marca:</span>
                    <span style={styles.detailValue}>{item.brand}</span>
                  </div>
                )}
                {item.model && (
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Modelo:</span>
                    <span style={styles.detailValue}>{item.model}</span>
                  </div>
                )}
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Quantidade:</span>
                  <span style={styles.detailValue}>{item.quantity_available}</span>
                </div>
                {(item.city || item.state) && (
                  <div style={styles.detailItem}>
                    <span style={styles.detailLabel}>Localização:</span>
                    <span style={styles.detailValue}>
                      📍 {[item.city, item.state].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                <div style={styles.detailItem}>
                  <span style={styles.detailLabel}>Publicado em:</span>
                  <span style={styles.detailValue}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={styles.actions}>
              {!isOwner && item.status === 'active' && (
                <button
                  onClick={() => setShowMessageModal(true)}
                  style={styles.contactButton}
                >
                  💬 Contatar Vendedor
                </button>
              )}
              
              {isOwner && item.status === 'active' && item.listing_type === 'sale' && (
                <button onClick={handleMarkAsSold} style={styles.soldButton}>
                  ✓ Marcar como Vendido
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message Modal */}
        {showMessageModal && (
          <div style={styles.modalOverlay} onClick={() => setShowMessageModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>Enviar Mensagem</h2>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                style={styles.messageTextarea}
                rows={6}
              />
              <div style={styles.modalActions}>
                <button
                  onClick={() => setShowMessageModal(false)}
                  style={styles.cancelButton}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendingMessage}
                  style={{
                    ...styles.sendButton,
                    opacity: !message.trim() || sendingMessage ? 0.5 : 1,
                  }}
                >
                  {sendingMessage ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  backButton: {
    padding: '8px 16px',
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    cursor: 'pointer',
    marginBottom: '24px',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '48px',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  mainImageContainer: {
    position: 'relative',
    width: '100%',
    paddingTop: '75%',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  mainImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  soldBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-15deg)',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    color: '#ffffff',
    padding: '24px 48px',
    fontSize: '48px',
    fontWeight: '900',
    fontFamily: 'Poppins, sans-serif',
    borderRadius: '12px',
    border: '4px solid #ffffff',
  },
  thumbnailsContainer: {
    display: 'flex',
    gap: '12px',
    overflowX: 'auto',
  },
  thumbnail: {
    width: '100px',
    height: '100px',
    objectFit: 'cover',
    borderRadius: '8px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  badges: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  badge: {
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 16px 0',
  },
  priceSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  price: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '36px',
    fontWeight: '700',
    color: '#10b981',
  },
  negotiableBadge: {
    padding: '6px 12px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  description: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 16px 0',
  },
  descriptionText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#525252',
    lineHeight: '1.6',
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  details: {},
  detailsGrid: {
    display: 'grid',
    gap: '12px',
  },
  detailItem: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr',
    gap: '16px',
  },
  detailLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
  },
  detailValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  contactButton: {
    flex: 1,
    padding: '16px 32px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  soldButton: {
    flex: 1,
    padding: '16px 32px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
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
    maxWidth: '500px',
    width: '90%',
  },
  modalTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 24px 0',
  },
  messageTextarea: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    resize: 'vertical',
    marginBottom: '24px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  sendButton: {
    padding: '12px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  notFound: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
};

export default MarketplaceItemDetailPage;

