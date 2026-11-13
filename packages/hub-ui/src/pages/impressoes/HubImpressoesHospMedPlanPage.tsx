import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi, type HubHospMedDose } from '../../api/hubClinicalApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import { formatDateLongPt, toYmdLocal } from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import { formatHmFromIso } from '../clinica/hospital/hospMedPlan';
import '../clientes/clientes.css';

const HubImpressoesHospMedPlanPage: React.FC = () => {
  const { hospitalizationId } = useParams<{ hospitalizationId: string }>();
  const [searchParams] = useSearchParams();
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const canRead = hasPermission('hub.clinic.read');

  const dateYmd = useMemo(() => {
    const raw = searchParams.get('date');
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : toYmdLocal(new Date());
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [issuedAt, setIssuedAt] = useState<string>('');
  const [hospLabel, setHospLabel] = useState({
    pet: '',
    species: '',
    bed: '',
    tutor: '',
  });
  const [orderLines, setOrderLines] = useState<string[]>([]);
  const [doses, setDoses] = useState<HubHospMedDose[]>([]);

  useEffect(() => {
    if (!clinicId || !hospitalizationId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await hubClinicalApi.getHospMedPrintModel(hospitalizationId, clinicId, dateYmd);
        if (cancelled) return;
        setIssuedAt(res.issued_at);
        const h = res.hospitalization;
        setHospLabel({
          pet: h.hub_pets?.name || 'Pet',
          species: h.hub_pets?.species?.trim() || '—',
          bed: h.hub_hospital_beds?.label || h.hub_hospital_beds?.code || 'Sem leito',
          tutor: h.hub_guardians?.full_name || '—',
        });
        setOrderLines(
          (res.active_orders ?? []).map((o) => {
            const name = String(o.medication_name ?? '');
            const dose = String(o.dose_label ?? `${o.dose_value ?? ''} ${o.dose_unit ?? ''}`.trim());
            const ver = o.version_no != null ? `v${o.version_no}` : '';
            const when = o.prescribed_at
              ? new Date(String(o.prescribed_at)).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : '';
            const by = (o.prescribed_by as { full_name?: string } | null)?.full_name ?? '';
            return [name, dose, ver, when, by].filter(Boolean).join(' · ');
          }),
        );
        setDoses(res.doses ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar folha');
          setDoses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, hospitalizationId, dateYmd, canRead, permLoading, showError]);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  if (!hospitalizationId) {
    return <Navigate to="/hub/impressoes/internacoes" replace />;
  }

  const issuedLabel = issuedAt
    ? new Date(issuedAt).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

  return (
    <HubPrintLayout
      title={`Plano de medicação — ${hospLabel.pet || 'Internação'}`}
      subtitle={`Leito ${hospLabel.bed} · ${formatDateLongPt(dateYmd)} · Emissão ${issuedLabel}`}
      backTo={clinicId ? `/hub/clinica/internacoes/${hospitalizationId}` : '/hub/impressoes/internacoes'}
      backLabel="Voltar à ficha"
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando folha…" />
      ) : (
        <>
          <div className="hub-print-hosp-med__id">
            <p className="hub-print-hosp-med__pet">{hospLabel.pet}</p>
            <p>
              {hospLabel.species} · Leito {hospLabel.bed}
              {hospLabel.tutor !== '—' ? ` · Tutor ${hospLabel.tutor}` : ''}
            </p>
          </div>

          {orderLines.length > 0 ? (
            <section className="hub-print-section">
              <h2 className="hub-print-section__title">Prescrição vigente</h2>
              <ul className="hub-print-hosp-med__orders">
                {orderLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="hub-print-section">
            <h2 className="hub-print-section__title">Doses do dia</h2>
            {doses.length === 0 ? (
              <p className="hub-print-sheet__empty">Nenhuma dose para esta data.</p>
            ) : (
              <div className="hub-print-table-wrap">
                <table className="hub-print-table">
                  <thead>
                    <tr>
                      <th>Horário</th>
                      <th>Medicamento</th>
                      <th>Dose</th>
                      <th>Via</th>
                      <th className="hub-print-table__check" aria-label="Feito">
                        Feito
                      </th>
                      <th>Rubrica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doses.map((d) => (
                      <tr key={d.id}>
                        <td>{formatHmFromIso(d.scheduled_for)}</td>
                        <td>{d.version?.medication_name ?? '—'}</td>
                        <td>{d.dose_label ?? '—'}</td>
                        <td>{d.version?.route ?? '—'}</td>
                        <td className="hub-print-table__check">
                          <span className="hub-print-checkbox" aria-hidden />
                        </td>
                        <td className="hub-print-hosp-med__sign"> </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="hub-print-hosp-med__foot">
            Não substitui o registro digital. Doses não administradas exigem motivo no sistema.
            {' '}
            <Link to={`/hub/clinica/internacoes/${hospitalizationId}`} className="hub-print-no-print">
              Abrir ficha
            </Link>
          </p>
        </>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesHospMedPlanPage;
