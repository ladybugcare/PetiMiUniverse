import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clinicsApi } from '../services/clinicsApi';
import { Construction, Clock, AlertTriangle } from 'lucide-react';
import IconWrapper from './IconWrapper';
import colors from '../styles/colors';

const ClinicStatusBanner: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userRole = user?.user_metadata?.role || user?.role;
        
        // Only check status for clinic users
        if (userRole !== 'clinic') {
          setLoading(false);
          return;
        }
        
        const { clinic } = await clinicsApi.getById(user.id);
        setStatus(clinic.status || 'active');
      } catch (error) {
        console.error('Error loading clinic status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadStatus();
  }, []);
  
  if (loading || !status || status === 'active') return null;
  
  if (status === 'pending_unit') {
    return (
      <div style={styles.bannerWarning}>
        <div style={styles.bannerContent}>
          <span style={styles.bannerIcon}>
            <IconWrapper icon={Construction} size={24} color="#f59e0b" />
          </span>
          <div style={styles.bannerText}>
            <strong>Ação necessária:</strong> Crie sua primeira unidade para ativar sua conta.
          </div>
          <button 
            style={styles.bannerButton}
            onClick={() => navigate('/units/create-first')}
          >
            Criar Unidade
          </button>
        </div>
      </div>
    );
  }
  
  if (status === 'pending_approval') {
    return (
      <div style={styles.bannerInfo}>
        <div style={styles.bannerContent}>
          <span style={styles.bannerIcon}>
            <IconWrapper icon={Clock} size={24} color="#f59e0b" />
          </span>
          <div style={styles.bannerText}>
            <strong>Aguardando aprovação:</strong> Sua unidade está em análise pelo ADMIN. Você poderá criar demandas e anúncios após a aprovação.
          </div>
        </div>
      </div>
    );
  }
  
  if (status === 'rejected') {
    return (
      <div style={styles.bannerError}>
        <div style={styles.bannerContent}>
          <span style={styles.bannerIcon}>❌</span>
          <div style={styles.bannerText}>
            <strong>Sua unidade foi reprovada.</strong> Verifique os motivos e crie uma nova unidade para análise.
          </div>
          <button 
            style={styles.bannerButton}
            onClick={() => navigate('/units/create-first')}
          >
            Criar Nova Unidade
          </button>
        </div>
      </div>
    );
  }
  
  if (status === 'suspended') {
    return (
      <div style={styles.bannerError}>
        <div style={styles.bannerContent}>
          <span style={styles.bannerIcon}>⛔</span>
          <div style={styles.bannerText}>
            <strong>Conta suspensa:</strong> Sua clínica está temporariamente suspensa. Entre em contato com o suporte.
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

const styles: { [key: string]: React.CSSProperties } = {
  bannerWarning: {
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    padding: '16px 24px',
    marginBottom: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  bannerInfo: {
    backgroundColor: '#dbeafe',
    borderLeft: '4px solid #3b82f6',
    padding: '16px 24px',
    marginBottom: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  bannerError: {
    backgroundColor: '#fee2e2',
    borderLeft: '4px solid #ef4444',
    padding: '16px 24px',
    marginBottom: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  bannerIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  bannerText: {
    flex: 1,
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#1f2937',
    minWidth: '200px',
  },
  bannerButton: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    flexShrink: 0,
  },
};

export default ClinicStatusBanner;

