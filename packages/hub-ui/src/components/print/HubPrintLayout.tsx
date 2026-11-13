import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatGeneratedAtPt, useHubClinicDisplayName } from './printUtils';
import '../../pages/clientes/clientes.css';
import './hub-print.css';

export type HubPrintLayoutProps = {
  title: string;
  /** Ex.: data do dia ou “Internações ativas”. */
  subtitle?: string;
  backTo: string;
  backLabel?: string;
  clinicName?: string;
  children: ReactNode;
  /** Conteúdo extra na toolbar (ex.: seletor de data na hub page não usa isto). */
  toolbarExtra?: ReactNode;
  /** Filtros (só tela; some na impressão). */
  filters?: ReactNode;
  /** Linha extra no meta do papel (ex.: filtros ativos). */
  filterSummary?: string | null;
};

export const HubPrintLayout: React.FC<HubPrintLayoutProps> = ({
  title,
  subtitle,
  backTo,
  backLabel = 'Voltar',
  clinicName: clinicNameProp,
  children,
  toolbarExtra,
  filters,
  filterSummary,
}) => {
  const fetchedName = useHubClinicDisplayName();
  const clinicName = clinicNameProp?.trim() || fetchedName;

  const onPrint = () => {
    window.print();
  };

  return (
    <div className="hub-print-page">
      <div className="hub-print-toolbar hub-print-no-print">
        <Link to={backTo} className="hub-clientes__btn hub-clientes__btn--ghost">
          <ArrowLeft size={16} aria-hidden />
          {backLabel}
        </Link>
        {toolbarExtra}
        <span className="hub-print-toolbar__spacer" />
        <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onPrint}>
          <Printer size={16} aria-hidden />
          Imprimir
        </button>
      </div>
      {filters}

      <article className="hub-print-sheet">
        <header className="hub-print-sheet__header">
          <p className="hub-print-sheet__clinic">{clinicName}</p>
          <h1 className="hub-print-sheet__title">{title}</h1>
          <p className="hub-print-sheet__meta">
            {subtitle ? `${subtitle} · ` : null}
            Gerado em {formatGeneratedAtPt()}
            {filterSummary ? ` · ${filterSummary}` : null}
          </p>
        </header>
        {children}
      </article>
    </div>
  );
};

export default HubPrintLayout;
