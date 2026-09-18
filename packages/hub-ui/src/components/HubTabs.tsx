import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import '../pages/clientes/clientes.css';

export type HubTabNavItem = {
  to: string;
  label: string;
  end?: boolean;
  /** Se definido, decide se a aba fica ativa (ex.: rotas filhas do Consultório). */
  isActivePath?: (pathname: string) => boolean;
};

export type HubTabButtonItem = {
  id: string;
  label: string;
  /** Contagem opcional (ex.: pendências). Fica visual; não altera o nome acessível da aba. */
  badge?: number | string | null;
  /** Agrupa abas secundárias (ex.: Ajustes, Comissões) após um separador visual. */
  secondary?: boolean;
};

export type HubTabItem = HubTabNavItem | HubTabButtonItem;

function isNavItem(item: HubTabItem): item is HubTabNavItem {
  return 'to' in item;
}

export type HubTabsProps = {
  items: HubTabItem[];
  /** Para abas com botão: id da aba ativa. */
  activeId?: string;
  onTabChange?: (id: string) => void;
  ariaLabel: string;
  /**
   * `page` — mesmo visual de /hub/clientes (Tutores / Empresas).
   * `detail` — abas em painéis laterais (Resumo, Pets, etc.), mesmas cores.
   */
  variant?: 'page' | 'detail';
  className?: string;
};

const navTabClassName = ({ isActive }: { isActive: boolean }) =>
  ['hub-clientes__tab', isActive ? 'hub-clientes__tab--active' : ''].filter(Boolean).join(' ');

/**
 * Abas Hub — reutiliza as classes de {@link ../pages/clientes/clientes.css} (sem alterar cores nem modelo).
 */
export const HubTabs: React.FC<HubTabsProps> = ({
  items,
  activeId,
  onTabChange,
  ariaLabel,
  variant = 'page',
  className = '',
}) => {
  const { pathname } = useLocation();
  const isDetail = variant === 'detail';
  const containerClass = [
    isDetail ? 'hub-clientes__detail-tabs' : 'hub-clientes__tabs',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const buttonTabClass = (active: boolean) =>
    [
      isDetail ? 'hub-clientes__detail-tab' : 'hub-clientes__tab',
      active
        ? isDetail
          ? 'hub-clientes__detail-tab--active'
          : 'hub-clientes__tab--active'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <nav className={containerClass} aria-label={ariaLabel}>
      {items.map((item, index) => {
        if (isNavItem(item)) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                navTabClassName({
                  isActive: item.isActivePath ? item.isActivePath(pathname) : isActive,
                })
              }
            >
              {item.label}
            </NavLink>
          );
        }
        const active = item.id === activeId;
        const badgeRaw = item.badge;
        const badgeNum = typeof badgeRaw === 'number' ? badgeRaw : Number(badgeRaw);
        const showBadge =
          badgeRaw != null &&
          badgeRaw !== '' &&
          !(typeof badgeRaw === 'number' && badgeRaw <= 0) &&
          !(Number.isFinite(badgeNum) && badgeNum <= 0);
        const prev = index > 0 ? items[index - 1] : null;
        const showSecondarySep =
          Boolean(item.secondary) && !(prev && !isNavItem(prev) && prev.secondary);
        return (
          <React.Fragment key={item.id}>
            {showSecondarySep ? (
              <span className="hub-clientes__tabs-sep" aria-hidden="true" />
            ) : null}
            <button
              type="button"
              className={[
                buttonTabClass(active),
                item.secondary ? 'hub-clientes__tab--secondary' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={active ? 'page' : undefined}
              onClick={() => onTabChange?.(item.id)}
            >
              <span className="hub-clientes__tab-label">{item.label}</span>
              {showBadge ? (
                <span className="hub-clientes__tab-badge" aria-hidden="true">
                  {badgeRaw}
                </span>
              ) : null}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default HubTabs;
