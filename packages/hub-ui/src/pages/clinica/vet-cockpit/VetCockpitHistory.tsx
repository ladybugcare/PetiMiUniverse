import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, History, Search } from 'lucide-react';
import { HubLoading, HubRefreshingBanner } from '../../../components/HubLoading';
import {
  hubClinicalApi,
  hubEncountersApi,
  type HubEncounter,
  type HubHospitalization,
  type HubSurgery,
} from '../../../api/hubClinicalApi';
import { formatHospDate } from '../hospital/hospDisplay';
import { petInitials } from './vetCockpitUtils';
import {
  buildCockpitHistoryRows,
  displayHistoryTitle,
  filterCockpitHistoryRows,
  HISTORY_KIND_LABEL,
  HISTORY_PERIOD_LABEL,
  historyStatusTone,
  type CockpitHistoryKind,
  type CockpitHistoryPeriod,
} from './cockpitHistoryRows';

type Props = {
  clinicId: string;
  staffId?: string | null;
};

const KIND_FILTERS: Array<{ id: CockpitHistoryKind | 'all'; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'encounter', label: 'Atendimentos' },
  { id: 'surgery', label: 'Cirurgias' },
  { id: 'hospitalization', label: 'Internações' },
];

const PERIOD_FILTERS: Array<{ id: CockpitHistoryPeriod; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
];

function formatHistoryTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const VetCockpitHistory: React.FC<Props> = ({ clinicId, staffId }) => {
  const navigate = useNavigate();
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [surgeries, setSurgeries] = useState<HubSurgery[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HubHospitalization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<CockpitHistoryKind | 'all'>('all');
  const [period, setPeriod] = useState<CockpitHistoryPeriod>('30d');
  const [query, setQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(Boolean(staffId));

  const loadedRef = useRef(false);
  const load = useCallback(async () => {
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const staffFilter = mineOnly && staffId ? staffId : undefined;
      const [encRes, surgRes, hospRes] = await Promise.allSettled([
        hubEncountersApi.list(clinicId, { status: 'completed', staffId: staffFilter }),
        hubClinicalApi.listSurgeries(clinicId),
        hubClinicalApi.listHospitalizations(clinicId),
      ]);
      setEncounters(encRes.status === 'fulfilled' ? encRes.value.encounters ?? [] : []);
      let surgRows = surgRes.status === 'fulfilled' ? surgRes.value.surgeries ?? [] : [];
      let hospRows = hospRes.status === 'fulfilled' ? hospRes.value.hospitalizations ?? [] : [];
      if (staffFilter) {
        surgRows = surgRows.filter((s) => !s.hub_staff_member_id || s.hub_staff_member_id === staffFilter);
      }
      setSurgeries(surgRows);
      setHospitalizations(hospRows);
      loadedRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId, mineOnly, staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const builtRows = useMemo(
    () => buildCockpitHistoryRows({ encounters, surgeries, hospitalizations }),
    [encounters, surgeries, hospitalizations],
  );

  const periodRows = useMemo(
    () => filterCockpitHistoryRows(builtRows, { kind: 'all', query: '', period }),
    [builtRows, period],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<CockpitHistoryKind | 'all', number> = {
      all: periodRows.length,
      encounter: 0,
      surgery: 0,
      hospitalization: 0,
    };
    for (const row of periodRows) counts[row.kind] += 1;
    return counts;
  }, [periodRows]);

  const rows = useMemo(
    () => filterCockpitHistoryRows(builtRows, { kind, query, period }),
    [builtRows, kind, query, period],
  );

  return (
    <div className="vet-cockpit-history hub-loading-host">
      <HubRefreshingBanner show={refreshing} label="Atualizando histórico…" />

      <div className="vet-cockpit-history__toolbar">
        <div className="vet-cockpit-history__filter-groups">
          <div className="vet-cockpit-history__seg" role="group" aria-label="Tipo">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`vet-cockpit-history__seg-btn${kind === f.id ? ' vet-cockpit-history__seg-btn--active' : ''}`}
                onClick={() => setKind(f.id)}
              >
                {f.label}
                <span className="vet-cockpit-history__seg-count">{kindCounts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="vet-cockpit-history__seg" role="group" aria-label="Período">
            {PERIOD_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`vet-cockpit-history__seg-btn${period === f.id ? ' vet-cockpit-history__seg-btn--active' : ''}`}
                onClick={() => setPeriod(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="vet-cockpit-history__tools">
          <label className="vet-cockpit-history__search">
            <Search size={16} aria-hidden />
            <input
              className="hub-clientes__input"
              type="search"
              placeholder="Buscar pet ou procedimento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {staffId ? (
            <button
              type="button"
              className={`vet-cockpit-history__mine-btn${mineOnly ? ' vet-cockpit-history__mine-btn--active' : ''}`}
              aria-pressed={mineOnly}
              onClick={() => setMineOnly((v) => !v)}
            >
              Só os meus
            </button>
          ) : null}
        </div>
      </div>

      {!loading || rows.length > 0 ? (
        <div className="vet-cockpit-history__meta" aria-live="polite">
          <span>
            {rows.length === 0
              ? 'Nenhum registro'
              : `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`}
          </span>
          <span className="vet-cockpit-history__meta-sep" aria-hidden>
            ·
          </span>
          <span>{HISTORY_PERIOD_LABEL[period]}</span>
          {mineOnly ? (
            <>
              <span className="vet-cockpit-history__meta-sep" aria-hidden>
                ·
              </span>
              <span>somente os meus</span>
            </>
          ) : null}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <HubLoading variant="block" label="Carregando histórico…" />
      ) : rows.length === 0 ? (
        <div className="vet-cockpit-history__empty">
          <div className="vet-cockpit-history__empty-icon" aria-hidden>
            <History size={22} strokeWidth={1.75} />
          </div>
          <h3 className="vet-cockpit-history__empty-title">Nada encerrado neste filtro</h3>
          <p className="vet-cockpit-history__empty-text">
            Amplie o período, limpe a busca ou troque o tipo para ver atendimentos, cirurgias e
            internações finalizados.
          </p>
        </div>
      ) : (
        <div className="hub-clientes__table-wrap vet-cockpit-history__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table vet-cockpit-history__table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Pet</th>
                <th>Procedimento</th>
                <th>Status</th>
                <th className="hub-clientes__th-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const title = displayHistoryTitle(row.title, row.petName);
                const tone = historyStatusTone(row.status);
                return (
                  <tr
                    key={row.key}
                    className="hub-dayboard__row-click vet-cockpit-history__row"
                    onClick={() => navigate(row.href)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(row.href);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Abrir ${HISTORY_KIND_LABEL[row.kind]} de ${row.petName}`}
                  >
                    <td className="vet-cockpit-history__when">
                      <span className="vet-cockpit-history__when-date">{formatHospDate(row.at)}</span>
                      <span className="vet-cockpit-history__when-time">{formatHistoryTime(row.at)}</span>
                    </td>
                    <td>
                      <span className={`vet-cockpit-history__kind vet-cockpit-history__kind--${row.kind}`}>
                        {HISTORY_KIND_LABEL[row.kind]}
                      </span>
                    </td>
                    <td>
                      <div className="hub-clientes__tutor-cell">
                        <span className="hub-clientes__avatar">{petInitials(row.petName)}</span>
                        {row.petId ? (
                          <Link
                            to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(row.petId)}`}
                            className="hub-clientes__link vet-cockpit-history__pet-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.petName}
                          </Link>
                        ) : (
                          <span className="hub-clientes__tutor-name">{row.petName}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="vet-cockpit-history__title" title={title}>
                        {title}
                      </span>
                    </td>
                    <td>
                      <span className={`vet-cockpit-history__status vet-cockpit-history__status--${tone}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                      {row.caseId ? (
                        <Link
                          to={`/hub/clinica/casos/${row.caseId}`}
                          className="vet-cockpit-history__case-btn"
                          title="Abrir caso clínico vinculado"
                          aria-label={`Abrir caso clínico de ${row.petName}`}
                        >
                          <FileText size={14} strokeWidth={2} aria-hidden />
                          Ver caso
                        </Link>
                      ) : (
                        <span className="vet-cockpit-history__no-case">Sem caso</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VetCockpitHistory;
