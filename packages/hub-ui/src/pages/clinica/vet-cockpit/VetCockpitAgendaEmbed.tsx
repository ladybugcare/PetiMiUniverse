import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hubAgendaApi, type HubAppointment } from '../../../api/hubAgendaApi';
import { dayRangeIsoLocal } from '../../agenda/agendaFilters';
import { HubLoading } from '../../../components/HubLoading';

type Props = {
  clinicId: string;
  staffMemberId: string;
};

function formatHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const VetCockpitAgendaEmbed: React.FC<Props> = ({ clinicId, staffMemberId }) => {
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<HubAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubAgendaApi.list({
        clinic_id: clinicId,
        from: dayRange.from,
        to: dayRange.to,
        hub_staff_member_id: staffMemberId,
      });
      const clinical = (res.appointments ?? []).filter((a) => a.status !== 'cancelled');
      clinical.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      setItems(clinical);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dayRange.from, dayRange.to, staffMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dateLabel = cursor.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="vet-cockpit-agenda">
      <div className="vet-cockpit-agenda__toolbar">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--icon" onClick={() => setCursor((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })} aria-label="Dia anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="vet-cockpit-agenda__date">{dateLabel}</span>
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--icon" onClick={() => setCursor((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })} aria-label="Próximo dia">
          <ChevronRight size={18} />
        </button>
        <Link to="/hub/appointments" className="hub-clientes__link vet-cockpit-agenda__full-link">
          Abrir agenda completa
        </Link>
      </div>
      {loading ? (
        <HubLoading variant="inline" label="Carregando agenda…" />
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum agendamento clínico neste dia.</p>
      ) : (
        <ul className="vet-cockpit-agenda__list">
          {items.map((a) => (
            <li key={a.id} className="vet-cockpit-agenda__item">
              <span className="vet-cockpit-agenda__time">{formatHm(a.starts_at)}</span>
              <div>
                <strong>{a.pet?.name || a.title || 'Agendamento'}</strong>
                <p className="hub-clientes__muted">{a.service_type?.name || a.title || '—'}</p>
              </div>
              <span className="vet-cockpit-agenda__status">{a.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VetCockpitAgendaEmbed;
