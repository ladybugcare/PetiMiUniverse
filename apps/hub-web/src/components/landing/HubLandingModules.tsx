import React, { useId, useState } from 'react';
import { CalendarDays, Hotel, Scissors, Stethoscope, Wallet } from 'lucide-react';

type ModuleId = 'agenda' | 'clinica' | 'banho' | 'financeiro' | 'hotel';

type ModulePreview = {
  label: string;
  title: string;
  rows: { primary: string; secondary: string; active?: boolean }[];
};

type ModuleSpec = {
  id: ModuleId;
  name: string;
  icon: React.ElementType;
  benefit: string;
  description: string;
  points: string[];
  preview: ModulePreview;
};

const MODULES: ModuleSpec[] = [
  {
    id: 'agenda',
    name: 'Agenda',
    icon: CalendarDays,
    benefit: 'O dia da equipe, em dia, semana ou mês.',
    description:
      'Consultas, banho, hotel e os demais serviços agendados ficam na mesma agenda da unidade.',
    points: [
      'Visões de dia, semana e mês',
      'Serviços da clínica, do salão e da hospedagem',
      'Comanda do agendamento para cobrar no caixa',
    ],
    preview: {
      label: 'Agenda',
      title: 'Hoje',
      rows: [
        { primary: '09:00 · Consulta', secondary: 'Luna' },
        { primary: '11:30 · Banho', secondary: 'Thor', active: true },
        { primary: '15:00 · Creche', secondary: 'Mel' },
      ],
    },
  },
  {
    id: 'clinica',
    name: 'Clínica Veterinária',
    icon: Stethoscope,
    benefit: 'Do consultório ao prontuário do pet.',
    description:
      'A operação do dia e o histórico clínico ficam juntos: atendimento, receitas, exames e internação.',
    points: [
      'Consultório com a fila do dia',
      'Prontuário, receitas, exames e vacinas',
      'Internação e cirurgia no mesmo fluxo',
    ],
    preview: {
      label: 'Consultório',
      title: 'Fila do dia',
      rows: [
        { primary: 'Aguardando', secondary: 'Luna · consulta' },
        { primary: 'Em atendimento', secondary: 'Thor', active: true },
        { primary: 'Concluído', secondary: 'Mel' },
      ],
    },
  },
  {
    id: 'banho',
    name: 'Banho e Tosa',
    icon: Scissors,
    benefit: 'A fila do salão, do check-in à entrega.',
    description: 'Cada pet avança pela fila do dia, com checklist do serviço e uma visão para quem está no salão.',
    points: [
      'Fila do dia: chegando, em serviço e pronto',
      'Checklist do atendimento',
      'Minha fila para a equipe no celular',
    ],
    preview: {
      label: 'Banho e Tosa',
      title: 'Fila do dia',
      rows: [
        { primary: 'Fila', secondary: 'Bella' },
        { primary: 'Em serviço', secondary: 'Fred', active: true },
        { primary: 'Pronto', secondary: 'Nina' },
      ],
    },
  },
  {
    id: 'financeiro',
    name: 'Financeiro e Caixa',
    icon: Wallet,
    benefit: 'O serviço prestado chega ao caixa.',
    description:
      'A comanda nasce do atendimento ou do serviço e segue para recebimentos, despesas e fluxo de caixa.',
    points: [
      'Comandas no caixa, ligadas ao que foi feito',
      'Contas a receber, despesas e fluxo de caixa',
      'Comissões da equipe',
    ],
    preview: {
      label: 'Caixa',
      title: 'Comandas do dia',
      rows: [
        { primary: 'Comanda · Luna', secondary: 'Em aberto', active: true },
        { primary: 'Comanda · Thor', secondary: 'Recebida' },
        { primary: 'Despesa', secondary: 'Lançada no financeiro' },
      ],
    },
  },
  {
    id: 'hotel',
    name: 'Hotel e Creche',
    icon: Hotel,
    benefit: 'A estadia do pet, dia após dia.',
    description: 'Reservas, entrada, saída e o relatório da rotina ficam na fila do hotel e da creche.',
    points: [
      'Fila do dia e a fila de cada profissional',
      'Check-in e check-out da reserva',
      'Relatório diário da estadia',
    ],
    preview: {
      label: 'Hotel e Creche',
      title: 'Fila do dia',
      rows: [
        { primary: 'Hospedado', secondary: 'Mel', active: true },
        { primary: 'Check-in hoje', secondary: 'Nina' },
        { primary: 'Check-out hoje', secondary: 'Fred' },
      ],
    },
  },
];

const MORE = [
  {
    title: 'Clientes e Pets',
    text: 'Tutores, animais e o histórico de cada um.',
  },
  {
    title: 'Equipe',
    text: 'Convites, funções e permissões de acesso.',
  },
  {
    title: 'Orçamentos',
    text: 'Propostas comerciais e envio ao tutor.',
  },
  {
    title: 'Serviços e Estoque',
    text: 'Catálogo, pacotes, itens e movimentos.',
  },
  {
    title: 'Leva e Traz',
    text: 'Rotas do dia e paradas pendentes.',
  },
] as const;

function ModulePreview({ preview }: { preview: ModulePreview }) {
  return (
    <div className="hub-landing-preview" aria-hidden>
      <div className="hub-landing-preview__chrome">
        <span />
        <span />
        <span />
      </div>
      <div className="hub-landing-preview__body">
        <p className="hub-landing-preview__label">{preview.label}</p>
        <p className="hub-landing-preview__title">{preview.title}</p>
        <ul className="hub-landing-preview__rows">
          {preview.rows.map((row) => (
            <li
              key={row.primary}
              className={row.active ? 'hub-landing-preview__row hub-landing-preview__row--active' : 'hub-landing-preview__row'}
            >
              <span>{row.primary}</span>
              <span>{row.secondary}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const HubLandingModules: React.FC = () => {
  const [active, setActive] = useState<ModuleId>('agenda');
  const baseId = useId();
  const current = MODULES.find((module) => module.id === active) ?? MODULES[0];

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = MODULES.findIndex((module) => module.id === active);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % MODULES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + MODULES.length) % MODULES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MODULES.length - 1;
    else return;
    event.preventDefault();
    const id = MODULES[next].id;
    setActive(id);
    document.getElementById(`${baseId}-tab-${id}`)?.focus();
  };

  return (
    <div className="hub-landing-modules">
      <div className="hub-landing-section-intro">
        <h2 id="hub-landing-features-title" className="hub-landing-section-title">
          Conheça o PetMi Hub por dentro
        </h2>
        <p className="hub-landing-section-lead">Uma plataforma para acompanhar cada etapa da rotina do seu negócio.</p>
      </div>

      <div
        className="hub-landing-tabs"
        role="tablist"
        aria-label="Módulos do PetMi Hub"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {MODULES.map((module) => {
          const selected = module.id === current.id;
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${module.id}`}
              className={selected ? 'hub-landing-tabs__tab hub-landing-tabs__tab--active' : 'hub-landing-tabs__tab'}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(module.id)}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              {module.name}
            </button>
          );
        })}
      </div>

      <div
        key={current.id}
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        className="hub-landing-module"
        tabIndex={0}
      >
        <div className="hub-landing-module__copy">
          <p className="hub-landing-module__kicker">{current.name}</p>
          <h3 className="hub-landing-module__title">{current.benefit}</h3>
          <p className="hub-landing-module__text">{current.description}</p>
          <ul className="hub-landing-module__points">
            {current.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <ModulePreview preview={current.preview} />
      </div>

      <ul className="hub-landing-more" aria-label="Outros módulos">
        {MORE.map((item) => (
          <li key={item.title} className="hub-landing-more__item">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HubLandingModules;
