import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import {
  HUB_TERM_CATEGORY_LABELS,
  hubClinicalTermTemplatesApi,
  type HubClinicalTermTemplate,
  type HubTermCategory,
} from '../../api/hubClinicalTermTemplatesApi';
import './hub-clinical-terms-quick.css';

const CONFIG_TERMS_PATH = '/hub/configuracoes-sistema/termos-clinicos';

export type HubClinicalTermsQuickListProps = {
  clinicId: string;
  /** Se informado, só mostra termos dessas categorias. */
  categories?: HubTermCategory[];
  title?: string;
  hint?: string;
  /** Quando false, oculta o bloco se não houver permissão de leitura. Default: true. */
  hideWithoutPermission?: boolean;
};

function openFile(row: HubClinicalTermTemplate) {
  window.open(row.storage_path, '_blank', 'noopener,noreferrer');
}

function downloadFile(row: HubClinicalTermTemplate) {
  const a = document.createElement('a');
  a.href = row.storage_path;
  a.download = row.file_name || `${row.title}.pdf`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const HubClinicalTermsQuickList: React.FC<HubClinicalTermsQuickListProps> = ({
  clinicId,
  categories,
  title = 'Termos clínicos',
  hint,
  hideWithoutPermission = true,
}) => {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');

  const [rows, setRows] = useState<HubClinicalTermTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);

  const categoryKey = useMemo(
    () => (categories?.length ? [...categories].sort().join(',') : ''),
    [categories],
  );

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!clinicId || !canRead) return;
      setLoading(true);
      setError(null);
      try {
        const res = await hubClinicalTermTemplatesApi.list(clinicId);
        if (signal?.cancelled) return;
        setRows(res.term_templates ?? []);
        setSchemaHint(res.schema_ready === false ? res.migration_hint ?? null : null);
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        setRows([]);
        setError((e as Error)?.message || 'Erro ao carregar termos');
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [clinicId, canRead],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, categoryKey]);

  const filtered = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    if (!categories?.length) return active;
    const allowed = new Set(categories);
    return active.filter((r) => allowed.has(r.category));
  }, [rows, categories]);

  if (!canRead) {
    if (hideWithoutPermission) return null;
    return (
      <div className="hub-ct-quick" role="region" aria-label={title}>
        <p className="hub-ct-quick__status">Sem permissão para ver termos clínicos.</p>
      </div>
    );
  }

  const emptyLabel =
    categories?.length === 1
      ? HUB_TERM_CATEGORY_LABELS[categories[0]!]
      : categories && categories.length > 1
        ? categories.map((c) => HUB_TERM_CATEGORY_LABELS[c]).join(', ')
        : null;

  return (
    <div className="hub-ct-quick" role="region" aria-label={title}>
      <div className="hub-ct-quick__head">
        <h3 className="hub-ct-quick__title">{title}</h3>
        {hint ? <p className="hub-ct-quick__hint">{hint}</p> : null}
      </div>

      {schemaHint ? (
        <p className="hub-ct-quick__status" role="status">
          {schemaHint}
        </p>
      ) : loading && filtered.length === 0 ? (
        <p className="hub-ct-quick__status">Carregando termos…</p>
      ) : error ? (
        <p className="hub-ct-quick__status" role="alert">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <p className="hub-ct-quick__empty">
          {emptyLabel
            ? `Nenhum termo ativo de ${emptyLabel}. `
            : 'Nenhum termo clínico ativo. '}
          Cadastre em{' '}
          <Link to={CONFIG_TERMS_PATH}>Configurações → Termos clínicos</Link>.
        </p>
      ) : (
        <ul className="hub-ct-quick__list">
          {filtered.map((row) => (
            <li key={row.id} className="hub-ct-quick__item">
              <div className="hub-ct-quick__item-main">
                <FileText size={16} strokeWidth={2} className="hub-ct-quick__item-icon" aria-hidden />
                <div className="hub-ct-quick__item-text">
                  <span className="hub-ct-quick__item-title">{row.title}</span>
                  <span className="hub-ct-quick__item-meta">
                    {HUB_TERM_CATEGORY_LABELS[row.category] ?? row.category}
                    {row.file_name ? ` · ${row.file_name}` : ''}
                  </span>
                </div>
              </div>
              <div className="hub-ct-quick__actions">
                <button
                  type="button"
                  className="hub-ct-quick__icon-btn"
                  title="Abrir"
                  aria-label={`Abrir ${row.title}`}
                  onClick={() => openFile(row)}
                >
                  <Eye size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="hub-ct-quick__icon-btn"
                  title="Baixar"
                  aria-label={`Baixar ${row.title}`}
                  onClick={() => downloadFile(row)}
                >
                  <Download size={16} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HubClinicalTermsQuickList;
