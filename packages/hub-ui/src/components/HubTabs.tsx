import React from 'react';
import { NavLink } from 'react-router-dom';
import '../pages/clientes/clientes.css';

export type HubTabNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

export type HubTabButtonItem = {
  id: string;
  label: string;
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
      {items.map((item) => {
        if (isNavItem(item)) {
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={navTabClassName}>
              {item.label}
            </NavLink>
          );
        }
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={buttonTabClass(active)}
            aria-current={active ? 'page' : undefined}
            onClick={() => onTabChange?.(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
};

export default HubTabs;
