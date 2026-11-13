import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BedDouble, CalendarDays, Car, Hotel, Printer, Stethoscope } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import { HubDateField } from '../../components/HubDateField';
import { parseYmdLocal, toYmdLocal } from '../../components/print/printUtils';
import '../clientes/clientes.css';
import './impressoes-page.css';

type PrintCard = {
  id: string;
  label: string;
  description: string;
  permission: string;
  href: (dateYmd: string) => string;
  Icon: React.ElementType;
};

const CARDS: PrintCard[] = [
  {
    id: 'agenda',
    label: 'Agenda do dia',
    description: 'Lista cronológica — filtre por grupo ou serviço específico.',
    permission: 'hub.appointments.read',
    href: (date) => `/hub/impressoes/agenda?date=${encodeURIComponent(date)}`,
    Icon: CalendarDays,
  },
  {
    id: 'clinica',
    label: 'Clínica',
    description: 'Fila do dia: aguardando, em atendimento e finalizados.',
    permission: 'hub.clinic.read',
    href: (date) => `/hub/impressoes/clinica?date=${encodeURIComponent(date)}`,
    Icon: Stethoscope,
  },
  {
    id: 'boarding',
    label: 'Hotel & Creche',
    description: 'Hospedagens do dia — filtre por modalidade, vista e serviço.',
    permission: 'boarding.reservations.read',
    href: (date) => `/hub/impressoes/hotel-creche?date=${encodeURIComponent(date)}`,
    Icon: Hotel,
  },
  {
    id: 'pickup',
    label: 'Rotas de leva e traz',
    description: 'Paradas em ordem com endereço e telefone.',
    permission: 'pickup.routes.read',
    href: (date) => `/hub/impressoes/leva-e-traz?date=${encodeURIComponent(date)}`,
    Icon: Car,
  },
  {
    id: 'hospital',
    label: 'Internações ativas',
    description: 'Quadro atual: pet, leito, tutor, status e motivo.',
    permission: 'hub.clinic.read',
    href: () => '/hub/impressoes/internacoes',
    Icon: BedDouble,
  },
];

const HubImpressoesHubPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateYmd = useMemo(() => {
    const raw = searchParams.get('date');
    return toYmdLocal(parseYmdLocal(raw));
  }, [searchParams]);

  const visible = CARDS.filter((c) => hasPermission(c.permission));

  if (!permLoading && visible.length === 0) {
    return (
      <div className="hub-impressoes">
        <p className="hub-clientes__muted">
          Sem permissão para impressões operacionais. Peça acesso à agenda, clínica, hotel/creche ou
          leva e traz.
        </p>
      </div>
    );
  }

  return (
    <div className="hub-impressoes">
      <p className="hub-impressoes__intro">
        <Printer size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />
        Imprima listas para usar como plano B quando a internet ou a energia falharem. Escolha a
        data, abra a pré-visualização e filtre por serviço ou status antes de mandar para a
        impressora.
      </p>

      <div className="hub-impressoes__toolbar">
        <div className="hub-impressoes__field">
          <label htmlFor="hub-impressoes-date">Data de referência</label>
          <HubDateField
            id="hub-impressoes-date"
            valueIso={dateYmd}
            onChangeIso={(iso) => {
              if (!iso) return;
              const next = new URLSearchParams(searchParams);
              next.set('date', iso);
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
      </div>

      <div className="hub-impressoes__grid">
        {visible.map((card) => {
          const Icon = card.Icon;
          return (
            <Link key={card.id} to={card.href(dateYmd)} className="hub-impressoes__card">
              <div className="hub-impressoes__card-top">
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="hub-impressoes__card-label">{card.label}</span>
              </div>
              <p className="hub-impressoes__card-desc">{card.description}</p>
              <span className="hub-impressoes__card-cta">
                Abrir pré-visualização <ArrowRight size={14} aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default HubImpressoesHubPage;
