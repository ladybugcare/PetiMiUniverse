import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clinicsApi } from '../services/clinicsApi';
import { unitsApi } from '../services/unitsApi';
import { Construction, Clock, AlertTriangle } from 'lucide-react';
import IconWrapper from './IconWrapper';
import colors from '../styles/colors';

const ClinicStatusBanner: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [hasApprovedUnit, setHasApprovedUnit] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
          setLoading(false);
          return;
        }
        
        const user = JSON.parse(userStr);
        const userRole = user?.user_metadata?.role || user?.role;
        
        // Only check status for clinic users
        if (userRole !== 'clinic' && userRole !== 'CADMIN') {
          setLoading(false);
          return;
        }
        
        // Get clinic ID - same logic as other components
        let clinicId: string | null = null;
        if (userRole === 'clinic' || userRole === 'CADMIN') {
          clinicId = user.id;
        } else {
          const clinicUserStr = localStorage.getItem('clinic_user');
          if (clinicUserStr) {
            try {
              const clinicUser = JSON.parse(clinicUserStr);
              clinicId = clinicUser?.clinic_id;
            } catch (error) {
              console.warn('Failed to parse clinic_user:', error);
            }
          }
        }
        
        if (!clinicId) {
          setLoading(false);
          return;
        }
        
        const { clinic } = await clinicsApi.getById(clinicId);
        const clinicStatus = clinic.status || 'active';
        
        // Check if there are any approved units
        try {
          const { units } = await unitsApi.getByClinic(clinicId);
          const approvedUnits = units.filter((unit: any) => 
            unit.status === 'approved' || unit.status === 'active'
          );
          setHasApprovedUnit(approvedUnits.length > 0);
        } catch (error) {
          console.warn('Error loading units:', error);
          setHasApprovedUnit(false);
        }
        
        setStatus(clinicStatus);
      } catch (error: any) {
        // Silently handle 404 - clinic might not exist yet
        if (error.message?.includes('não encontrada') || error.message?.includes('Not Found')) {
          // Clinic doesn't exist yet, that's okay
          setStatus(null);
        } else {
        console.error('Error loading clinic status:', error);
        }
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
          <div style={styles.bannerIconContainer}>
            <IconWrapper icon={Construction} size={24} color={colors.warning} />
          </div>
          <div style={styles.bannerText}>
            <strong style={styles.bannerTitle}>Ação necessária:</strong>
            <span style={styles.bannerMessage}> Crie sua primeira unidade para ativar sua conta.</span>
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
  
  if (status === 'pending_approval' && !hasApprovedUnit) {
    return (
      <div style={styles.bannerInfo}>
        <div style={styles.bannerContent}>
          <div style={styles.bannerIconContainer}>
            <IconWrapper icon={Clock} size={24} color="#f59e0b" />
          </div>
          <div style={styles.bannerText}>
            <strong style={styles.bannerTitle}>Aguardando aprovação:</strong>
            <span style={styles.bannerMessage}> Sua unidade está em análise pelo ADMIN. Você poderá criar demandas e anúncios após a aprovação.</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (status === 'rejected') {
    return (
      <div style={styles.bannerError}>
        <div style={styles.bannerContent}>
          <div style={styles.bannerIconContainer}>
            <IconWrapper icon={AlertTriangle} size={24} color={colors.danger} />
          </div>
          <div style={styles.bannerText}>
            <strong style={styles.bannerTitle}>Sua unidade foi reprovada.</strong>
            <span style={styles.bannerMessage}> Verifique os motivos e crie uma nova unidade para análise.</span>
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
          <div style={styles.bannerIconContainer}>
            <IconWrapper icon={AlertTriangle} size={24} color={colors.danger} />
          </div>
          <div style={styles.bannerText}>
            <strong style={styles.bannerTitle}>Conta suspensa:</strong>
            <span style={styles.bannerMessage}> Sua clínica está temporariamente suspensa. Entre em contato com o suporte.</span>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

const styles: { [key: string]: React.CSSProperties } = {
  bannerWarning: {
    backgroundColor: colors.warningLight,
    border: `1px solid ${colors.warning}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
    marginTop: '0',
    marginLeft: '0',
    marginRight: '0',
    width: '100%',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  bannerInfo: {
    backgroundColor: '#dbeafe', // Light blue background
    border: '1px solid #3b82f6',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
    marginTop: '0',
    marginLeft: '0',
    marginRight: '0',
    width: '100%',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  bannerError: {
    backgroundColor: colors.dangerLight,
    border: `1px solid ${colors.danger}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
    marginTop: '0',
    marginLeft: '0',
    marginRight: '0',
    width: '100%',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  bannerIconContainer: {
    flexShrink: 0,
    marginTop: '2px',
  },
  bannerIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  bannerText: {
    flex: 1,
    fontSize: '14px',
    lineHeight: '1.6',
    color: colors.text,
  },
  bannerTitle: {
    display: 'inline',
    fontSize: '14px',
    fontWeight: '600',
    color: colors.text,
  },
  bannerMessage: {
    fontSize: '14px',
    color: colors.textSecondary,
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

