import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import FloatingActionButton from '../components/FloatingActionButton';
import { usePermissions } from '../hooks/usePermissions';
import { useUnit } from '../contexts/UnitContext';

// Import role-specific dashboard components
import AdminDashboard from '../components/dashboard/clinic/AdminDashboard';
import ManagerDashboard from '../components/dashboard/clinic/ManagerDashboard';
import AssistantDashboard from '../components/dashboard/clinic/AssistantDashboard';
import VetInternalDashboard from '../components/dashboard/clinic/VetInternalDashboard';

const ClinicDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { role: clinicRole, loading: permissionsLoading } = usePermissions();
  const { selectedUnit } = useUnit();
  const [activeSection, setActiveSection] = useState('resumo');

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id) {
      navigate('/login');
      return;
    }
    
    // Allow both 'clinic' users and those with clinic_user roles
    if (userRole !== 'clinic') {
      // Check if user has a clinic_user role
      const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || '{}');
      if (!clinicUser.role) {
        navigate('/vet-dashboard');
      }
    }
  }, [navigate]);

  // Get configuration based on clinic role
  const getDashboardConfig = () => {
    switch (clinicRole) {
      case 'CADMIN':
        return {
          title: 'Painel do Administrador',
          menuItems: getAdminMenuItems(),
          fabOptions: getAdminFabOptions(),
          component: <AdminDashboard activeSection={activeSection} />,
        };
      
      case 'CMANAGER':
        return {
          title: selectedUnit ? `Painel - ${selectedUnit.name}` : 'Painel do Gestor',
          menuItems: getManagerMenuItems(),
          fabOptions: getManagerFabOptions(),
          component: <ManagerDashboard activeSection={activeSection} />,
        };
      
      case 'CASSISTANT':
        return {
          title: 'Painel do Assistente',
          menuItems: getAssistantMenuItems(),
          fabOptions: getAssistantFabOptions(),
          component: <AssistantDashboard activeSection={activeSection} />,
        };
      
      case 'CVET_INTERNAL':
        return {
          title: 'Meu Painel',
          menuItems: getVetInternalMenuItems(),
          fabOptions: getVetInternalFabOptions(),
          component: <VetInternalDashboard activeSection={activeSection} />,
        };
      
      default:
        // Default for clinic owners without specific clinic_user role
        return {
          title: 'Dashboard da Clínica',
          menuItems: getDefaultMenuItems(),
          fabOptions: getDefaultFabOptions(),
          component: <AdminDashboard activeSection={activeSection} />,
        };
    }
  };

  // Menu items for CADMIN
  const getAdminMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Visão Geral',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'units',
      label: 'Gerenciar Unidades',
      icon: '🏥',
      action: 'navigate',
      path: '/units',
    },
    {
      id: 'users',
      label: 'Gerenciar Usuários',
      icon: '👥',
      action: 'navigate',
      path: '/users',
    },
    {
      id: 'demandas',
      label: 'Todas as Demandas',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'audit',
      label: 'Logs de Auditoria',
      icon: '🔍',
      action: 'section',
      sectionId: 'audit',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  // Menu items for CMANAGER
  const getManagerMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Resumo da Unidade',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'profissionais',
      label: 'Profissionais',
      icon: '👩‍⚕️',
      action: 'section',
      sectionId: 'profissionais',
    },
    {
      id: 'users',
      label: 'Equipe da Unidade',
      icon: '👥',
      action: 'navigate',
      path: '/users',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  // Menu items for CASSISTANT
  const getAssistantMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Resumo',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  // Menu items for CVET_INTERNAL
  const getVetInternalMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Meu Resumo',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas Disponíveis',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      icon: '📝',
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'avaliacoes',
      label: 'Minhas Avaliações',
      icon: '⭐',
      action: 'section',
      sectionId: 'avaliacoes',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  // Default menu items (for clinic owners without clinic_user role)
  const getDefaultMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Resumo das Demandas',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Ver Todas Demandas',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
    },
  ];

  // FAB options for CADMIN
  const getAdminFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: '📋',
      path: '/create-demand',
      color: '#7c3aed',
    },
    {
      id: 'create-unit',
      label: 'Nova Unidade',
      icon: '🏥',
      path: '/units',
      color: '#3b82f6',
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: '🛒',
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // FAB options for CMANAGER
  const getManagerFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: '📋',
      path: '/create-demand',
      color: '#7c3aed',
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: '🛒',
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // FAB options for CASSISTANT
  const getAssistantFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: '📋',
      path: '/create-demand',
      color: '#7c3aed',
    },
  ];

  // FAB options for CVET_INTERNAL
  const getVetInternalFabOptions = () => [
    {
      id: 'view-demands',
      label: 'Ver Demandas',
      icon: '📋',
      path: '/demands',
      color: '#7c3aed',
    },
  ];

  // Default FAB options
  const getDefaultFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: '📋',
      path: '/create-demand',
      color: '#7c3aed',
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: '🛒',
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  if (permissionsLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p>Carregando...</p>
      </div>
    );
  }

  const config = getDashboardConfig();

  return (
    <DashboardLayout 
      pageName={config.title}
      menuItems={config.menuItems}
      notificationCount={0}
    >
      {config.component}
      <FloatingActionButton options={config.fabOptions} />
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: 'Inter, sans-serif',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f4f6',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

export default ClinicDashboardPage;
