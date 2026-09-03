import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeftRight,
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
  Syringe,
  Trophy,
  UserX,
  UserMinus,
  Wallet,
} from 'lucide-react';
import {
  HUB_REPORT_CATEGORIES,
  HUB_REPORT_LINKS,
  HUB_REPORTS,
  reportAllowed,
  type HubReportCategoryId,
  type HubReportId,
} from './hubRelatoriosConfig';

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
};

type HubRelatoriosCatalogProps = {
  hasPermission: (p: string) => boolean;
  onSelectReport: (id: HubReportId) => void;
};

export const HubRelatoriosCatalog: React.FC<HubRelatoriosCatalogProps> = ({ hasPermission, onSelectReport }) => {
  const reports = useMemo(
    () => HUB_REPORTS.filter((r) => reportAllowed(hasPermission, r.permission)),
    [hasPermission],
  );
  const links = useMemo(
    () => HUB_REPORT_LINKS.filter((r) => reportAllowed(hasPermission, r.permission)),
    [hasPermission],
  );

  const byCategory = useMemo(() => {
    const map = new Map<HubReportCategoryId, { reports: typeof reports; links: typeof links }>();
    for (const cat of Object.keys(HUB_REPORT_CATEGORIES) as HubReportCategoryId[]) {
      map.set(cat, {
        reports: reports.filter((r) => r.category === cat),
        links: links.filter((l) => l.category === cat),
      });
    }
    return map;
  }, [reports, links]);

  if (reports.length === 0 && links.length === 0) {
    return <p className="hub-clientes__muted">Nenhum relatório disponível para o seu perfil de acesso.</p>;
  }

  return (
    <div className="hub-relatorios__catalog">
      {(Object.keys(HUB_REPORT_CATEGORIES) as HubReportCategoryId[]).map((categoryId) => {
        const group = byCategory.get(categoryId);
        if (!group || (group.reports.length === 0 && group.links.length === 0)) return null;
        return (
          <section key={categoryId} className="hub-relatorios__category">
            <h2 className="hub-relatorios__category-title">{HUB_REPORT_CATEGORIES[categoryId]}</h2>
            <div className="hub-relatorios__grid">
              {group.reports.map((report) => {
                const Icon = REPORT_ICONS[report.id];
                return (
                  <button
                    key={report.id}
                    type="button"
                    className="hub-relatorios__card"
                    onClick={() => onSelectReport(report.id)}
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
              {group.links.map((link) => (
                <Link key={link.id} to={link.to} className="hub-relatorios__card hub-relatorios__card--link">
                  <span className="hub-relatorios__card-icon" aria-hidden>
                    <Package size={22} strokeWidth={2} />
                  </span>
                  <span className="hub-relatorios__card-body">
                    <span className="hub-relatorios__card-title">{link.title}</span>
                    <span className="hub-relatorios__card-desc">{link.description}</span>
                  </span>
                  <ExternalLink size={18} className="hub-relatorios__card-arrow" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default HubRelatoriosCatalog;
