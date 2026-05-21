import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import FloatingActionButton, { FABOption } from '../components/FloatingActionButton';
import ClinicStatusBanner from '../components/ClinicStatusBanner';
import DashboardBlockedOverlay from '../components/DashboardBlockedOverlay';
import LoadingOverlay from '../components/LoadingOverlay';
import { usePermissions } from '../hooks/usePermissions';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../AuthContext';
import { getUserRole, getDashboardPathForRole, getStoredClinicId } from '../utils/authHelpers';
import { API_BASE_URL } from '../services/api';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import colors from '../styles/colors';
import { BarChart2, Building2, Users, ClipboardList, ShoppingCart, Search, User, MessageSquare, Stethoscope, Star, FileText, MessageCircle } from 'lucide-react';

// Import role-specific dashboard components
import AdminDashboard from '../components/dashboard/clinic/AdminDashboard';
import ManagerDashboard from '../components/dashboard/clinic/ManagerDashboard';
import AssistantDashboard from '../components/dashboard/clinic/AssistantDashboard';
import VetInternalDashboard from '../components/dashboard/clinic/VetInternalDashboard';

const clinicPageStyles: { shell: React.CSSProperties } = {
  shell: {
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 clamp(16px, 3vw, 28px) 56px',
    boxSizing: 'border-box',
  },
};

const ClinicDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, session, role: userRole, loading: authLoading } = useAuth();
  const { role: clinicRole, loading: permissionsLoading } = usePermissions();
  const { selectedUnit, units, loading: unitsLoading } = useUnit();
  const [activeSection, setActiveSection] = useState('resumo');
  const [clinicStatus, setClinicStatus] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Check authentication and clinic status
  useEffect(() => {
    // Aguardar carregamento da autenticação
    if (authLoading) return;
    
    // Se não há usuário, redirecionar para login
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Dono de clínica (metadata role "clinic") sem clinic_id persistido → primeira unidade
    const rawMetaRole = user?.user_metadata?.role;
    if (
      String(rawMetaRole || '').toLowerCase() === 'clinic' &&
      !getStoredClinicId()
    ) {
      navigate('/units/create-first', { replace: true });
      return;
    }
    
    // Usar getUserRole() para detecção robusta da role
    const role = getUserRole(user);
    
    // Verificar se o usuário é clinic (CADMIN ou CMANAGER)
    // Se não for clinic, redirecionar para dashboard apropriado
    if (role !== 'CADMIN' && role !== 'CMANAGER') {
      // Verificar se tem clinic_user (usuário pode ser vet que trabalha em clínica)
      const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || 'null');
      if (!clinicUser || !clinicUser.role) {
        // Não é clinic e não tem clinic_user, redirecionar para dashboard correto
        const dashboardPath = getDashboardPathForRole(role);
        console.log('[ClinicDashboardPage] Usuário não é clinic, redirecionando para:', dashboardPath);
        navigate(dashboardPath, { replace: true });
        return;
      }
      // Se tem clinic_user, pode continuar (é um vet trabalhando em clínica)
    }

    // Check clinic status
    const checkClinicStatus = async () => {
      if (!user) return; // Se não há usuário, não fazer requisição
      
      try {
        const clinicId = getStoredClinicId();
        
        if (!clinicId) {
          setCheckingStatus(false);
          return;
        }
        
        const headers: Record<string, string> = {};
        const accessToken = session?.access_token;
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const response = await fetch(`${API_BASE_URL}/clinics/${clinicId}`, {
          headers,
        });
        
        if (response.ok) {
          const data = await response.json();
          setClinicStatus(data.clinic?.status || null);
        } else if (response.status === 404) {
          // Clinic doesn't exist yet, that's okay - não logar erro
          setClinicStatus(null);
        } else {
          // Outros erros (403, 500, etc) - logar apenas em modo debug
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error checking clinic status:', response.status);
          }
        }
      } catch (error) {
        // Silently handle errors - clinic might not exist yet
        // Não logar erro para evitar spam no console
        if (process.env.NODE_ENV === 'development') {
          console.warn('Error checking clinic status:', error);
        }
      } finally {
        setCheckingStatus(false);
      }
    };
    
    checkClinicStatus();
  }, [navigate, user, session, authLoading]);

  // Get menu items using hook
  // clinicRole vem do usePermissions e pode ser CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL
  // Se não tiver clinicRole, usar getUserRole que retorna CADMIN/CMANAGER/VET
  const role = clinicRole || getUserRole(user);
  const { menuItems } = useSidebarMenu(role as any);

  // Get configuration based on clinic role
  const getDashboardConfig = () => {
    switch (clinicRole) {
      case 'CADMIN':
        return {
          title: 'Painel do Administrador',
          fabOptions: getAdminFabOptions(),
          component: <AdminDashboard activeSection={activeSection} />,
        };
      
      case 'CMANAGER':
        return {
          title: selectedUnit ? `Painel - ${selectedUnit.name}` : 'Painel do Gestor',
          fabOptions: getManagerFabOptions(),
          component: <ManagerDashboard activeSection={activeSection} />,
        };
      
      case 'CASSISTANT':
        return {
          title: 'Painel do Assistente',
          fabOptions: getAssistantFabOptions(),
          component: <AssistantDashboard activeSection={activeSection} />,
        };
      
      case 'CVET_INTERNAL':
        return {
          title: 'Meu Painel',
          fabOptions: getVetInternalFabOptions(),
          component: <VetInternalDashboard activeSection={activeSection} />,
        };
      
      default:
        // Default for clinic owners without specific clinic_user role
        return {
          title: 'Dashboard da Clínica',
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
      icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'units',
      label: 'Gerenciar Unidades',
      icon: <Building2 size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/units',
    },
    {
      id: 'users',
      label: 'Gerenciar Usuários',
      icon: <Users size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/users',
    },
    {
      id: 'my-demands',
      label: 'Minhas Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-demands',
    },
    {
      id: 'demandas',
      label: 'Todas as Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'audit',
      label: 'Logs de Auditoria',
      icon: <Search size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'audit',
    },
    {
      id: 'support',
      label: 'Meus Tickets',
      icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/my-support-tickets',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.brand.primary[500]} />,
    //   action: 'logout',
    // },
  ];

  // Menu items for CMANAGER
  const getManagerMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Resumo da Unidade',
      icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'units',
      label: 'Gerenciar Unidades',
      icon: <Building2 size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/units',
    },
    {
      id: 'demandas',
      label: 'Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'profissionais',
      label: 'Profissionais',
      icon: <Stethoscope size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'profissionais',
    },
    {
      id: 'users',
      label: 'Equipe da Unidade',
      icon: <Users size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/users',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'support',
      label: 'Meus Tickets',
      icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/my-support-tickets',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.brand.primary[500]} />,
    //   action: 'logout',
    // },
  ];

  // Menu items for CASSISTANT
  const getAssistantMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Resumo',
      icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'support',
      label: 'Meus Tickets',
      icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/my-support-tickets',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.brand.primary[500]} />,
    //   action: 'logout',
    // },
  ];

  // Menu items for CVET_INTERNAL
  const getVetInternalMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Meu Resumo',
      icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas Disponíveis',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      icon: <FileText size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'avaliacoes',
      label: 'Minhas Avaliações',
      icon: <Star size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'avaliacoes',
    },
    {
      id: 'support',
      label: 'Meus Tickets',
      icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/my-support-tickets',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      icon: <User size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.brand.primary[500]} />,
    //   action: 'logout',
    // },
  ];

  // Default menu items (for clinic owners without clinic_user role)
  const getDefaultMenuItems = (): MenuItem[] => [
    {
      id: 'resumo',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'units',
      label: 'Gerenciar Unidades',
      icon: <Building2 size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/units',
    },
    {
      id: 'users',
      label: 'Gerenciar Usuários',
      icon: <Users size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/users',
    },
    {
      id: 'my-demands',
      label: 'Minhas Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-demands',
    },
    {
      id: 'demandas',
      label: 'Ver Todas Demandas',
      icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User size={20} color={colors.brand.primary[500]} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.brand.primary[500]} />,
    //   action: 'logout',
    // },
  ];

  // FAB options for CADMIN
  const getAdminFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: <ClipboardList size={20} color="#ffffff" />,
      path: '/create-demand',
      color: colors.brand.primary[500],
    },
    {
      id: 'create-unit',
      label: 'Nova Unidade',
      icon: <Building2 size={20} color="#ffffff" />,
      path: '/units',
      color: '#3b82f6',
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: <ShoppingCart size={20} color="#ffffff" />,
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // FAB options for CMANAGER
  const getManagerFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: <ClipboardList size={20} color="#ffffff" />,
      path: '/create-demand',
      color: colors.brand.primary[500],
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: <ShoppingCart size={20} color="#ffffff" />,
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // FAB options for CASSISTANT
  const getAssistantFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: <ClipboardList size={20} color="#ffffff" />,
      path: '/create-demand',
      color: colors.brand.primary[500],
    },
  ];

  // FAB options for CVET_INTERNAL
  const getVetInternalFabOptions = () => [
    {
      id: 'view-demands',
      label: 'Ver Demandas',
      icon: <ClipboardList size={20} color="#ffffff" />,
      path: '/demands',
      color: colors.brand.primary[500],
    },
  ];

  // Default FAB options
  const getDefaultFabOptions = () => [
    {
      id: 'create-demand',
      label: 'Criar Demanda',
      icon: <ClipboardList size={20} color="#ffffff" />,
      path: '/create-demand',
      color: colors.brand.primary[500],
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: <ShoppingCart size={20} color="#ffffff" />,
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // Use overlay instead of blank screen to evitar "piscadas" enquanto carrega

  // Bloquear só quando ainda não existe nenhuma unidade (status legacy `pending_unit` pode persistir após o cadastro)
  if (
    clinicStatus === 'pending_unit' &&
    !checkingStatus &&
    !unitsLoading &&
    units.length === 0
  ) {
    return <DashboardBlockedOverlay />;
  }

  const config = getDashboardConfig();

  return (
    <>
      <DashboardLayout 
        pageName={config.title}
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      >
        <div style={clinicPageStyles.shell}>
          <ClinicStatusBanner />
          {config.component}
        </div>
        <FloatingActionButton options={config.fabOptions} />
      </DashboardLayout>
      <LoadingOverlay
        visible={
          permissionsLoading ||
          checkingStatus ||
          (clinicStatus === 'pending_unit' && unitsLoading)
        }
      />
    </>
  );
};

export default ClinicDashboardPage;
