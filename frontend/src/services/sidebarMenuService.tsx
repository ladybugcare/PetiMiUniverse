import React from 'react';
import {
  BarChart2,
  Building2,
  Users,
  ClipboardList,
  MessageCircle,
  Settings,
  Stethoscope,
  Briefcase,
  ShoppingCart,
  Search,
  User,
  FileText,
  Star,
  MessageSquare,
  TrendingUp,
  PlusCircle,
  Package,
} from 'lucide-react';
import colors from '../styles/colors';
import { Role } from '../utils/authHelpers';
import { MenuItem } from '../components/DashboardSidebar';

/**
 * Serviço centralizado para gerenciar menus do sidebar por role
 */
export class SidebarMenuService {
  /**
   * Retorna os itens do menu para uma role específica
   */
  static getMenuItemsForRole(role: Role | string): MenuItem[] {
    // Normalizar role para uppercase
    const normalizedRole = String(role).trim().toUpperCase();
    
    switch (normalizedRole) {
      case 'ADMIN':
        return this.getAdminMenuItems();
      case 'CADMIN':
        return this.getClinicAdminMenuItems();
      case 'CMANAGER':
        return this.getClinicManagerMenuItems();
      case 'CASSISTANT':
        return this.getAssistantMenuItems();
      case 'CVET_INTERNAL':
        return this.getVetInternalMenuItems();
      case 'VET':
        return this.getVetMenuItems();
      case 'FREELANCER':
        return this.getFreelancerMenuItems();
      default:
        // Fallback: tentar detectar se é role de clínica
        if (normalizedRole.includes('CLINIC') || normalizedRole === 'CLINICA') {
          return this.getClinicAdminMenuItems();
        }
        return [];
    }
  }

  /**
   * Menu para ADMIN (Administrador do Sistema)
   */
  private static getAdminMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin-dashboard',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'users',
        label: 'Usuários',
        icon: <Users size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin/users',
        group: 'Gerenciamento',
        order: 1,
        subItems: [
          {
            id: 'users-all',
            label: 'Todos',
            icon: <Users size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/admin/users',
            group: 'Gerenciamento',
          },
          {
            id: 'users-freelancers',
            label: 'Freelancers',
            icon: <Briefcase size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/admin/freelancers',
            group: 'Gerenciamento',
          },
          {
            id: 'users-vets',
            label: 'Veterinários',
            icon: <Stethoscope size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/admin/vets',
            group: 'Gerenciamento',
          },
          {
            id: 'users-clinics',
            label: 'Clínicas',
            icon: <Building2 size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/admin/clinics',
            group: 'Gerenciamento',
          },
        ],
      },
      {
        id: 'demands',
        label: 'Demandas',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin/demands',
        group: 'Operacional',
        order: 1,
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'reports',
        label: 'Relatórios',
        icon: <TrendingUp size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin/reports',
        group: 'Operacional',
        order: 3,
      },
      {
        id: 'support-tickets',
        label: 'Tickets de Suporte',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin/support-tickets',
        group: 'Suporte',
        order: 1,
      },
      {
        id: 'settings',
        label: 'Configurações',
        icon: <Settings size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/admin/settings',
        group: 'Suporte',
        order: 2,
      },
    ];
  }

  /**
   * Menu para CADMIN (Administrador da Clínica)
   */
  private static getClinicAdminMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/clinic-dashboard',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'units',
        label: 'Unidades',
        icon: <Building2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/units',
        group: 'Gerenciamento',
        order: 1,
        subItems: [
          {
            id: 'units-list',
            label: 'Listar Unidades',
            icon: <Building2 size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/units',
            group: 'Gerenciamento',
          },
          {
            id: 'units-create',
            label: 'Criar Unidade',
            icon: <Building2 size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/units/create',
            group: 'Gerenciamento',
          },
        ],
      },
      {
        id: 'users',
        label: 'Usuários',
        icon: <Users size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/users',
        group: 'Gerenciamento',
        order: 2,
      },
      {
        id: 'demands',
        label: 'Demandas',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/demands',
        group: 'Operacional',
        order: 1,
        subItems: [
          {
            id: 'demands-my',
            label: 'Minhas Demandas',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/clinic-demands',
            group: 'Operacional',
          },
          {
            id: 'demands-all',
            label: 'Todas as Demandas',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/demands',
            group: 'Operacional',
          },
          {
            id: 'demands-create',
            label: 'Criar Demanda',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/create-demand',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/marketplace',
        group: 'Operacional',
        order: 3,
        subItems: [
          {
            id: 'marketplace-view',
            label: 'Ver Anúncios',
            icon: <ShoppingCart size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace',
            group: 'Operacional',
          },
          {
            id: 'marketplace-create',
            label: 'Criar Anúncio',
            icon: <PlusCircle size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/create',
            group: 'Operacional',
          },
          {
            id: 'marketplace-my-listings',
            label: 'Meus Anúncios',
            icon: <Package size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/my-listings',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'audit',
        label: 'Auditoria',
        icon: <Search size={20} color={colors.brand.primary[500]} />,
        action: 'section',
        sectionId: 'audit',
        group: 'Operacional',
        order: 4,
      },
      {
        id: 'support-tickets',
        label: 'Tickets',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-support-tickets',
        group: 'Suporte',
        order: 1,
      },
    ];
  }

  /**
   * Menu para CMANAGER (Gerente de Unidade)
   */
  private static getClinicManagerMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/clinic-dashboard',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'demands',
        label: 'Demandas',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/demands',
        group: 'Operacional',
        order: 1,
        subItems: [
          {
            id: 'demands-my',
            label: 'Minhas Demandas',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/clinic-demands',
            group: 'Operacional',
          },
          {
            id: 'demands-create',
            label: 'Criar Demanda',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/create-demand',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'people',
        label: 'Pessoas',
        icon: <Users size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/users',
        group: 'Gerenciamento',
        order: 1,
        subItems: [
          {
            id: 'people-applications',
            label: 'Candidaturas',
            icon: <FileText size={18} color={colors.brand.primary[500]} />,
            action: 'section',
            sectionId: 'profissionais',
            group: 'Gerenciamento',
          },
          {
            id: 'people-team',
            label: 'Equipe',
            icon: <Users size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/users',
            group: 'Gerenciamento',
          },
        ],
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/marketplace',
        group: 'Operacional',
        order: 3,
        subItems: [
          {
            id: 'marketplace-view',
            label: 'Ver Anúncios',
            icon: <ShoppingCart size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace',
            group: 'Operacional',
          },
          {
            id: 'marketplace-create',
            label: 'Criar Anúncio',
            icon: <PlusCircle size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/create',
            group: 'Operacional',
          },
          {
            id: 'marketplace-my-listings',
            label: 'Meus Anúncios',
            icon: <Package size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/my-listings',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'support-tickets',
        label: 'Tickets',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-support-tickets',
        group: 'Suporte',
        order: 1,
      },
    ];
  }

  /**
   * Menu para VET (Veterinário)
   */
  private static getVetMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/clinic-dashboard',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'demands',
        label: 'Demandas',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/demands',
        group: 'Operacional',
        order: 1,
        subItems: [
          {
            id: 'demands-available',
            label: 'Disponíveis',
            icon: <ClipboardList size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/demands',
            group: 'Operacional',
          },
          {
            id: 'demands-applications',
            label: 'Minhas Candidaturas',
            icon: <FileText size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/my-applications',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'reviews',
        label: 'Avaliações',
        icon: <Star size={20} color={colors.brand.primary[500]} />,
        action: 'section',
        sectionId: 'avaliacoes',
        group: 'Operacional',
        order: 3,
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/marketplace',
        group: 'Operacional',
        order: 4,
        subItems: [
          {
            id: 'marketplace-view',
            label: 'Ver Anúncios',
            icon: <ShoppingCart size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace',
            group: 'Operacional',
          },
          {
            id: 'marketplace-create',
            label: 'Criar Anúncio',
            icon: <PlusCircle size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/create',
            group: 'Operacional',
          },
          {
            id: 'marketplace-my-listings',
            label: 'Meus Anúncios',
            icon: <Package size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/my-listings',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'support-tickets',
        label: 'Tickets',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-support-tickets',
        group: 'Suporte',
        order: 1,
      },
      {
        id: 'settings',
        label: 'Configurações',
        icon: <Settings size={20} color={colors.brand.primary[500]} />,
        action: 'section',
        sectionId: 'configuracoes',
        group: 'Perfil',
        order: 1,
      },
    ];
  }

  /**
   * Menu para CASSISTANT (Assistente/Secretário)
   */
  private static getAssistantMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/clinic-dashboard',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'demands',
        label: 'Demandas',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/demands',
        group: 'Operacional',
        order: 1,
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: <ShoppingCart size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/marketplace',
        group: 'Operacional',
        order: 3,
        subItems: [
          {
            id: 'marketplace-view',
            label: 'Ver Anúncios',
            icon: <ShoppingCart size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace',
            group: 'Operacional',
          },
          {
            id: 'marketplace-create',
            label: 'Criar Anúncio',
            icon: <PlusCircle size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/create',
            group: 'Operacional',
          },
          {
            id: 'marketplace-my-listings',
            label: 'Meus Anúncios',
            icon: <Package size={18} color={colors.brand.primary[500]} />,
            action: 'navigate',
            path: '/marketplace/my-listings',
            group: 'Operacional',
          },
        ],
      },
      {
        id: 'support-tickets',
        label: 'Tickets',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-support-tickets',
        group: 'Suporte',
        order: 1,
      },
    ];
  }

  /**
   * Menu para CVET_INTERNAL (Veterinário Interno)
   */
  private static getVetInternalMenuItems(): MenuItem[] {
    return [
      {
        id: 'dashboard',
        label: 'Meu Resumo',
        icon: <BarChart2 size={20} color={colors.brand.primary[500]} />,
        action: 'section',
        sectionId: 'resumo',
        group: 'Principal',
        order: 1,
      },
      {
        id: 'demands',
        label: 'Demandas Disponíveis',
        icon: <ClipboardList size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/demands',
        group: 'Operacional',
        order: 1,
      },
      {
        id: 'applications',
        label: 'Minhas Candidaturas',
        icon: <FileText size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-applications',
        group: 'Operacional',
        order: 2,
      },
      {
        id: 'messages',
        label: 'Mensagens',
        icon: <MessageSquare size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/messages',
        group: 'Operacional',
        order: 3,
      },
      {
        id: 'reviews',
        label: 'Minhas Avaliações',
        icon: <Star size={20} color={colors.brand.primary[500]} />,
        action: 'section',
        sectionId: 'avaliacoes',
        group: 'Operacional',
        order: 4,
      },
      {
        id: 'support-tickets',
        label: 'Meus Tickets',
        icon: <MessageCircle size={20} color={colors.brand.primary[500]} />,
        action: 'navigate',
        path: '/my-support-tickets',
        group: 'Suporte',
        order: 1,
      },
    ];
  }

  /**
   * Menu para FREELANCER (similar ao VET)
   */
  private static getFreelancerMenuItems(): MenuItem[] {
    // Por enquanto, usar o mesmo menu do VET
    // Pode ser customizado no futuro se necessário
    return this.getVetMenuItems();
  }
}

