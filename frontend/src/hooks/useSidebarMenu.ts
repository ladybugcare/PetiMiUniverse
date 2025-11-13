import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Role } from '../utils/authHelpers';
import { SidebarMenuService } from '../services/sidebarMenuService';
import { MenuItem } from '../components/DashboardSidebar';
import { useAuth } from '../AuthContext';
import { usePermissions } from './usePermissions';
import { hasPermission } from '../utils/permissions';
import { Role as UnitsRole } from '../types/units';

/**
 * Hook para gerenciar menus do sidebar
 * Retorna menus filtrados, ordenados e com item ativo detectado
 */
export const useSidebarMenu = (role: Role | string, currentPath?: string) => {
  const location = useLocation();
  const activePath = currentPath || location.pathname;
  const { user } = useAuth();
  const userId = user?.id;
  
  // Obter permissões do usuário
  const { hasPermission: checkPermission, role: userRole } = usePermissions();
  
  // Estado para badges
  const [badges, setBadges] = useState<Record<string, number>>({});
  const lastRequestTimeRef = useRef<Record<string, number>>({});
  const isLoadingRef = useRef<Record<string, boolean>>({});

  // Função helper para carregar badge com debounce
  const loadBadge = useCallback(async (badgeKey: string, loader: () => Promise<number>) => {
    if (!userId) return 0;

    const now = Date.now();
    const lastRequest = lastRequestTimeRef.current[badgeKey] || 0;
    
    // Debounce: não fazer requisição se a última foi há menos de 30 segundos
    if (now - lastRequest < 30000) {
      return badges[badgeKey] || 0;
    }

    // Se já está carregando, retornar valor atual
    if (isLoadingRef.current[badgeKey]) {
      return badges[badgeKey] || 0;
    }

    isLoadingRef.current[badgeKey] = true;
    lastRequestTimeRef.current[badgeKey] = now;

    try {
      const count = await loader();
      setBadges(prev => ({ ...prev, [badgeKey]: count }));
      return count;
    } catch (error) {
      console.error(`[useSidebarMenu] Error loading badge ${badgeKey}:`, error);
      return badges[badgeKey] || 0;
    } finally {
      isLoadingRef.current[badgeKey] = false;
    }
  }, [userId, badges]);

  // Carregar badges dinamicamente
  useEffect(() => {
    if (!userId) return;

    const loadBadges = async () => {
      // Carregar badges apenas uma vez ao montar ou quando userId mudar
      const badgeLoaders: Array<{ key: string; loader: () => Promise<number> }> = [];

      // Badge de mensagens (para todos os roles)
      // Tentar marketplace messages primeiro, depois messages gerais
      badgeLoaders.push({
        key: 'messages',
        loader: async () => {
          try {
            // Tentar marketplace messages
            const { marketplaceMessagesApi } = await import('../services/marketplaceMessagesApi');
            const marketplaceResult = await marketplaceMessagesApi.getUnreadCount(userId);
            return marketplaceResult.unread_count || 0;
          } catch {
            // Se falhar, tentar messages gerais (se existir)
            try {
              // Por enquanto, retornar 0 se não houver API de messages gerais
              return 0;
            } catch {
              return 0;
            }
          }
        },
      });

      // Badge de tickets de suporte
      badgeLoaders.push({
        key: 'support-tickets',
        loader: async () => {
          try {
            const { supportTicketsApi } = await import('../services/supportTicketsApi');
            const result = await supportTicketsApi.getUnreadCount(userId);
            return result.unread_count || 0;
          } catch {
            return 0;
          }
        },
      });

      // Badge de notificações
      badgeLoaders.push({
        key: 'notifications',
        loader: async () => {
          try {
            const { notificationsApi } = await import('../services/notificationsApi');
            return await notificationsApi.getUnreadCount(userId);
          } catch {
            return 0;
          }
        },
      });

      // Carregar todos os badges em paralelo
      await Promise.all(badgeLoaders.map(({ key, loader }) => loadBadge(key, loader)));
    };

    loadBadges();

    // Polling a cada 30 segundos
    const interval = setInterval(loadBadges, 30000);
    return () => clearInterval(interval);
  }, [userId, role, loadBadge]);

  // Obter menus base para a role
  const baseMenuItems = useMemo(() => {
    try {
      return SidebarMenuService.getMenuItemsForRole(role);
    } catch (error) {
      console.error('[useSidebarMenu] Error getting menu items for role:', role, error);
      return [];
    }
  }, [role]);

  // Filtrar itens por permissões e aplicar badges
  const menuItemsWithBadges = useMemo(() => {
    const filterAndApplyBadgesRecursive = (items: MenuItem[]): MenuItem[] => {
      return items
        .filter(item => {
          // Se o item tem permissão definida, verificar se o usuário tem acesso
          if (item.permission) {
            // Para roles de clínica, usar usePermissions
            if (userRole) {
              return checkPermission(item.permission);
            }
            // Para outros roles (ADMIN, VET, FREELANCER), usar hasPermission diretamente
            // hasPermission espera UnitsRole, mas ADMIN/VET/FREELANCER não estão nesse tipo
            // Então vamos verificar se é role de clínica primeiro
            if (role === 'ADMIN' || role === 'VET' || role === 'FREELANCER') {
              // Para esses roles, não há sistema de permissões granular, então mostrar o item
              return true;
            }
            // Se for role de clínica mas não foi capturado acima, tentar usar hasPermission
            return hasPermission(role as UnitsRole, item.permission);
          }
          // Se não tem permissão definida, mostrar o item
          return true;
        })
        .map(item => {
          // Aplicar badge baseado no id do item
          let badgeCount = 0;
          
          // Mapear IDs para badges
          if (item.id === 'messages') {
            badgeCount = badges['messages'] || 0;
          } else if (item.id === 'support-tickets' || item.id === 'support') {
            badgeCount = badges['support-tickets'] || 0;
          } else if (item.id === 'notifications') {
            badgeCount = badges['notifications'] || 0;
          }

          // Aplicar badge se houver
          const itemWithBadge = badgeCount > 0 
            ? { ...item, badge: badgeCount }
            : item;

          // Aplicar filtro e badges recursivamente em subitens
          if (item.subItems) {
            const filteredSubItems = filterAndApplyBadgesRecursive(item.subItems);
            // Se todos os subitens foram filtrados, ocultar o item pai também
            if (filteredSubItems.length === 0) {
              return null;
            }
            return { ...itemWithBadge, subItems: filteredSubItems };
          }

          return itemWithBadge;
        })
        .filter((item): item is MenuItem => item !== null);
    };

    return filterAndApplyBadgesRecursive(baseMenuItems);
  }, [baseMenuItems, badges, userRole, checkPermission, role]);

  // Ordenar e agrupar itens
  const menuItems = useMemo(() => {
    // Ordenar por grupo e depois por order
    const sorted = [...menuItemsWithBadges].sort((a, b) => {
      const groupOrder = ['Principal', 'Gerenciamento', 'Operacional', 'Suporte', 'Perfil'];
      const aGroupIndex = groupOrder.indexOf(a.group || '');
      const bGroupIndex = groupOrder.indexOf(b.group || '');
      
      if (aGroupIndex !== bGroupIndex) {
        return aGroupIndex - bGroupIndex;
      }
      
      return (a.order || 0) - (b.order || 0);
    });

    return sorted;
  }, [menuItemsWithBadges]);

  // Detectar item ativo baseado na rota atual
  const isItemActive = (item: MenuItem): boolean => {
    // Se tem path e corresponde à rota atual
    if (item.path && activePath === item.path) {
      return true;
    }

    // Se tem subitens, verificar se algum subitem está ativo
    if (item.subItems) {
      return item.subItems.some(subItem => isItemActive(subItem));
    }

    return false;
  };

  return {
    menuItems,
    isItemActive,
  };
};

