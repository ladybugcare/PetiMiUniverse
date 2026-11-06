import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeftRight,
  AlertTriangle,
  BarChart3,
  Building2,
  Cake,
  Clock,
  ExternalLink,
  FileWarning,
  Layers,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  Repeat,
  Scissors,
  Search,
  Syringe,
  FlaskConical,
  Trophy,
  UserX,
  UserMinus,
  Wallet,
  WalletCards,
  Boxes,
  Users,
  Activity,
} from 'lucide-react';
import {
  HUB_REPORT_CATEGORIES,
  HUB_REPORT_LINKS,
  HUB_REPORTS,
  reportAllowed,
  type HubReportCategoryId,
  type HubReportId,
} from './hubRelatoriosConfig';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';

const REPORT_ICONS: Record<HubReportId, React.ElementType> = {
  'finance-overview': BarChart3,
  'pending-payments': Clock,
  'sales-adjustments': Receipt,
  commissions: Percent,
  unbilled: FileWarning,
  'cash-flow': Wallet,
  'top-clients': Trophy,
  'client-cohorts': RefreshCw,
  birthdays: Cake,
  packages: Package,
  'stock-position': Package,
  'stock-movements': ArrowLeftRight,
  'stock-abc': Layers,
  'stock-turnover': Repeat,
  'absent-clients': UserX,
  'no-shows': UserMinus,
  'boarding-occupancy': Building2,
  'grooming-productivity': Scissors,
  'vaccines-due': Syringe,
  'exams-requested': FlaskConical,
};

const LINK_ICONS: Record<string, React.ElementType> = {
  'stock-alerts': AlertTriangle,
};

const CATEGORY_ICONS: Record<HubReportCategoryId, React.ElementType> = {
  financeiro: WalletCards,
  estoque: Boxes,
  clientes: Users,
  operacional: Activity,
};

const CATEGORY_ORDER = Object.keys(HUB_REPORT_CATEGORIES) as HubReportCategoryId[];

type HubRelatoriosCatalogProps = {
  hasPermission: (p: string) => boolean;
  onSelectReport: (id: HubReportId) => void;
};

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const HubRelatoriosCatalog: React.FC<HubRelatoriosCatalogProps> = ({
  hasPermission,
  onSelectReport,
}) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<HubReportCategoryId | 'all'>('all');

  const reports = useMemo(
    () => HUB_REPORTS.filter((r) => reportAllowed(hasPermission, r.permission)),
    [hasPermission],
  );
  const links = useMemo(
    () => HUB_REPORT_LINKS.filter((r) => reportAllowed(hasPermission, r.permission)),
    [hasPermission],
  );

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<HubReportCategoryId, number>;
    for (const cat of CATEGORY_ORDER) counts[cat] = 0;
    for (const r of reports) counts[r.category] += 1;
    for (const l of links) counts[l.category] += 1;
    return counts;
  }, [reports, links]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const matchText = (title: string, description: string) => {
      if (!q) return true;
      return normalizeSearch(`${title} ${description}`).includes(q);
    };

    const nextReports = reports.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      return matchText(r.title, r.description);
    });
    const nextLinks = links.filter((l) => {
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      return matchText(l.title, l.description);
    });
    return { reports: nextReports, links: nextLinks };
  }, [reports, links, query, categoryFilter]);

  const byCategory = useMemo(() => {
    const map = new Map<HubReportCategoryId, { reports: typeof reports; links: typeof links }>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, {
        reports: filtered.reports.filter((r) => r.category === cat),
        links: filtered.links.filter((l) => l.category === cat),
      });
    }
    return map;
  }, [filtered]);

  const totalAvailable = reports.length + links.length;
  const totalVisible = filtered.reports.length + filtered.links.length;

  if (totalAvailable === 0) {
    return (
      <HubRelatoriosEmpty
        title="Nenhum relatório disponível"
        description="Seu perfil de acesso não inclui relatórios nesta clínica. Peça permissão a um administrador se precisar."
      />
    );
  }

  return (
    <div className="hub-relatorios__catalog">
      <div className="hub-relatorios__catalog-toolbar">
        <div className="hub-clientes__search hub-relatorios__search">
          <Search size={16} className="hub-clientes__search-icon" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar relatório…"
            aria-label="Buscar relatório"
            autoComplete="off"
          />
        </div>
        <div className="hub-relatorios__category-chips" role="tablist" aria-label="Categorias">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            className={
              categoryFilter === 'all'
                ? 'hub-relatorios__chip hub-relatorios__chip--active'
                : 'hub-relatorios__chip'
            }
            onClick={() => setCategoryFilter('all')}
          >
            Todos
            <span className="hub-relatorios__chip-count">{totalAvailable}</span>
          </button>
          {CATEGORY_ORDER.map((categoryId) => {
            const count = categoryCounts[categoryId];
            if (!count) return null;
            const Icon = CATEGORY_ICONS[categoryId];
            return (
              <button
                key={categoryId}
                type="button"
                role="tab"
                aria-selected={categoryFilter === categoryId}
                className={
                  categoryFilter === categoryId
                    ? `hub-relatorios__chip hub-relatorios__chip--active hub-relatorios__chip--${categoryId}`
                    : `hub-relatorios__chip hub-relatorios__chip--${categoryId}`
                }
                onClick={() => setCategoryFilter(categoryId)}
              >
                <Icon size={14} aria-hidden />
                {HUB_REPORT_CATEGORIES[categoryId]}
                <span className="hub-relatorios__chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {totalVisible === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhum relatório encontrado"
          description="Tente outro termo ou limpe o filtro de categoria."
        />
      ) : (
        CATEGORY_ORDER.map((categoryId) => {
          const group = byCategory.get(categoryId);
          if (!group || (group.reports.length === 0 && group.links.length === 0)) return null;
          const CategoryIcon = CATEGORY_ICONS[categoryId];
          const itemCount = group.reports.length + group.links.length;
          return (
            <section
              key={categoryId}
              className={`hub-relatorios__category hub-relatorios__category--${categoryId}`}
              aria-labelledby={`relatorios-cat-${categoryId}`}
            >
              <div className="hub-relatorios__category-head">
                <span className="hub-relatorios__category-icon" aria-hidden>
                  <CategoryIcon size={16} strokeWidth={2} />
                </span>
                <h2 id={`relatorios-cat-${categoryId}`} className="hub-relatorios__category-title">
                  {HUB_REPORT_CATEGORIES[categoryId]}
                </h2>
                <span className="hub-relatorios__category-count">
                  {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <div className="hub-relatorios__grid">
                {group.reports.map((report) => {
                  const Icon = REPORT_ICONS[report.id];
                  return (
                    <button
                      key={report.id}
                      type="button"
                      className="hub-relatorios__card"
                      onClick={() => onSelectReport(report.id)}
                      aria-label={`${report.title}. ${report.description}`}
                    >
                      <span className="hub-relatorios__card-icon" aria-hidden>
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <span className="hub-relatorios__card-body">
                        <span className="hub-relatorios__card-title">{report.title}</span>
                        <span className="hub-relatorios__card-desc">{report.description}</span>
                      </span>
                      <ArrowRight size={18} className="hub-relatorios__card-arrow" aria-hidden />
                    </button>
                  );
                })}
                {group.links.map((link) => {
                  const Icon = LINK_ICONS[link.id] ?? Package;
                  return (
                    <Link
                      key={link.id}
                      to={link.to}
                      className="hub-relatorios__card hub-relatorios__card--link"
                      aria-label={`${link.title}. ${link.description}. Abre em outra página.`}
                    >
                      <span className="hub-relatorios__card-icon" aria-hidden>
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <span className="hub-relatorios__card-body">
                        <span className="hub-relatorios__card-title-row">
                          <span className="hub-relatorios__card-title">{link.title}</span>
                          <span className="hub-relatorios__card-badge">Página</span>
                        </span>
                        <span className="hub-relatorios__card-desc">{link.description}</span>
                      </span>
                      <ExternalLink size={18} className="hub-relatorios__card-arrow" aria-hidden />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};

export default HubRelatoriosCatalog;
