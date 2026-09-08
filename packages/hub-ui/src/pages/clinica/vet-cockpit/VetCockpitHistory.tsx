import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { HubLoading, HubRefreshingBanner } from '../../../components/HubLoading';
import {
  hubClinicalApi,
  hubEncountersApi,
  type HubEncounter,
  type HubHospitalization,
  type HubSurgery,
} from '../../../api/hubClinicalApi';
import { formatHospDateTime } from '../hospital/hospDisplay';
import { petInitials } from './vetCockpitUtils';
import {
  buildCockpitHistoryRows,
  filterCockpitHistoryRows,
  HISTORY_KIND_LABEL,
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

const VetCockpitHistory: React.FC<Props> = ({ clinicId, staffId }) => {
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [surgeries, setSurgeries] = useState<HubSurgery[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HubHospitalization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<CockpitHistoryKind | 'all'>('all');
  const [period, setPeriod] = useState<CockpitHistoryPeriod>('7d');
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

  const rows = useMemo(
    () =>
      filterCockpitHistoryRows(buildCockpitHistoryRows({ encounters, surgeries, hospitalizations }), {
        kind,
        query,
        period,
      }),
    [encounters, surgeries, hospitalizations, kind, query, period],
  );

  return (
    <div className="vet-cockpit-history hub-loading-host">
      <HubRefreshingBanner show={refreshing} label="Atualizando histórico…" />
      <div className="vet-cockpit-history__filters">
        <div className="hub-dayboard__status-filters" role="group" aria-label="Tipo">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hub-dayboard__toggle-btn${kind === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setKind(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="hub-dayboard__status-filters" role="group" aria-label="Período">
          {PERIOD_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hub-dayboard__toggle-btn${period === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setPeriod(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
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
          <label className="vet-cockpit-history__mine">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Só os meus
          </label>
        ) : null}
      </div>

      {loading && rows.length === 0 ? (
        <HubLoading variant="block" label="Carregando histórico…" />
      ) : rows.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum item encerrado neste filtro.</p>
      ) : (
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Pet</th>
                <th>O quê</th>
                <th>Status</th>
                <th className="hub-clientes__th-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="hub-dayboard__time-cell">{formatHospDateTime(row.at)}</td>
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
                          className="hub-clientes__link"
                        >
                          {row.petName}
                        </Link>
                      ) : (
                        row.petName
                      )}
                    </div>
                  </td>
                  <td>{row.title}</td>
                  <td>
                    <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${row.status}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="hub-clientes__td-actions">
                    <div className="hub-clientes__td-actions-inner">
                      <Link to={row.href} className="hub-clientes__link">
                        Abrir
                      </Link>
                      {row.caseId ? (
                        <Link to={`/hub/clinica/casos/${row.caseId}`} className="hub-clientes__link">
                          Caso
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VetCockpitHistory;
