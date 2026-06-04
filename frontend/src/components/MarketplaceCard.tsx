import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, ShoppingBag } from 'lucide-react';
import { MarketplaceItem } from '../services/marketplaceApi';

interface MarketplaceCardProps {
  item: MarketplaceItem;
}

const MarketplaceCard: React.FC<MarketplaceCardProps> = ({ item }) => {
  const navigate = useNavigate();

  const getConditionLabel = (condition: string) => {
    const labels = {
      new: 'Novo',
      used: 'Usado',
      refurbished: 'Remanufaturado',
    };
    return labels[condition as keyof typeof labels] || condition;
  };

  const getConditionColor = (condition: string) => {
    const colors = {
      new: '#10b981',
      used: '#f59e0b',
      refurbished: '#3b82f6',
    };
    return colors[condition as keyof typeof colors] || '#737373';
  };

  const handleClick = () => {
    navigate(`/marketplace/${item.id}`);
  };

  const mainImage = item.images && item.images.length > 0
    ? item.images[0]
    : '/placeholder-image.png'; // You should add a placeholder image

  return (
    <div
      style={styles.card}
      onClick={handleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      }}
    >
      {/* Image */}
      <div style={styles.imageContainer}>
        <img
          src={mainImage}
          alt={item.title}
          style={styles.image}
          onError={(e) => {
            // Fallback if image fails to load
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Sem+Imagem';
          }}
        />
        
        {/* Listing Type Badge */}
        <div
          style={{
            ...styles.badge,
            ...styles.typeBadge,
            backgroundColor: item.listing_type === 'sale' ? '#10b981' : '#3b82f6',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {item.listing_type === 'sale' ? (
            <>
              <ShoppingBag size={14} color="#fff" aria-hidden />
              Venda
            </>
          ) : (
            <>
              <Search size={14} color="#fff" aria-hidden />
              Procura
            </>
          )}
        </div>

        {/* Condition Badge (only for sales) */}
        {item.listing_type === 'sale' && (
          <div
            style={{
              ...styles.badge,
              ...styles.conditionBadge,
              backgroundColor: getConditionColor(item.condition),
            }}
          >
            {getConditionLabel(item.condition)}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={styles.content}>
        <h3 style={styles.title}>{item.title}</h3>
        
        <p style={styles.description}>
          {item.description.length > 100
            ? item.description.substring(0, 100) + '...'
            : item.description}
        </p>

        {/* Price */}
        {item.listing_type === 'sale' && item.price && (
          <div style={styles.priceContainer}>
            <span style={styles.price}>
              R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            {item.negotiable && (
              <span style={styles.negotiableBadge}>Negociável</span>
            )}
          </div>
        )}

        {/* Location */}
        {(item.city || item.state) && (
          <div style={{ ...styles.location, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} color="#6b7280" aria-hidden />
            {[item.city, item.state].filter(Boolean).join(', ')}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.quantity}>
            Qtd: {item.quantity_available}
          </span>
          <span style={styles.date}>
            {new Date(item.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    paddingTop: '75%', // 4:3 aspect ratio
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  badge: {
    position: 'absolute',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
  },
  typeBadge: {
    top: '12px',
    left: '12px',
  },
  conditionBadge: {
    top: '12px',
    right: '12px',
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    lineHeight: '1.5',
  },
  priceContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  price: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '700',
    color: '#10b981',
  },
  negotiableBadge: {
    padding: '4px 8px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  location: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
    borderTop: '1px solid #e5e5e5',
    marginTop: 'auto',
  },
  quantity: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
  },
  date: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#a3a3a3',
  },
};

export default MarketplaceCard;

