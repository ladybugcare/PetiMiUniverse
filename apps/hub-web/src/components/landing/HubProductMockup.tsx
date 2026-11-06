import React from 'react';

/** Ilustração da home “Hoje na unidade”, no mesmo idioma visual do produto. */
const HubProductMockup: React.FC = () => {
  return (
    <div className="hub-landing-mock" aria-hidden>
      <div className="hub-landing-mock__chrome">
        <span className="hub-landing-mock__dot" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--amber" />
        <span className="hub-landing-mock__dot hub-landing-mock__dot--mint" />
      </div>
      <div className="hub-landing-mock__shell">
        <aside className="hub-landing-mock__rail">
          <span className="hub-landing-mock__rail-i hub-landing-mock__rail-i--on" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
          <span className="hub-landing-mock__rail-i" />
        </aside>
        <div className="hub-landing-mock__body">
          <div className="hub-landing-mock__topbar">
            <div>
              <p className="hub-landing-mock__hello">Hoje na unidade</p>
              <p className="hub-landing-mock__sub">Resumo da operação de hoje</p>
            </div>
            <span className="hub-landing-mock__avatar" />
          </div>
          <div className="hub-landing-mock__grid">
            <div className="hub-landing-mock-card hub-landing-mock-card--chart hub-landing-mock-card--span2">
              <p className="hub-landing-mock-card__label">Financeiro</p>
              <p className="hub-landing-mock-card__title">Fluxo de caixa — últimos dias</p>
              <div className="hub-landing-mock-bars">
                <span style={{ height: '42%' }} />
                <span style={{ height: '68%' }} />
                <span style={{ height: '55%' }} />
                <span style={{ height: '88%' }} />
                <span style={{ height: '72%' }} />
                <span style={{ height: '94%' }} />
                <span style={{ height: '61%' }} />
              </div>
            </div>
            <div className="hub-landing-mock-card hub-landing-mock-card--span2">
              <p className="hub-landing-mock-card__label">Agenda</p>
              <p className="hub-landing-mock-card__title">Próximos atendimentos</p>
              <ul className="hub-landing-mock-list">
                <li>
                  <span className="hub-landing-mock-list__t">10:00</span> Consulta — Luna
                </li>
                <li>
                  <span className="hub-landing-mock-list__t">11:30</span> Banho — Thor
                </li>
                <li>
                  <span className="hub-landing-mock-list__t">14:00</span> Hotel — Mel
                </li>
              </ul>
            </div>
            <div className="hub-landing-mock-card hub-landing-mock-card--kanban">
              <p className="hub-landing-mock-card__label">Banho e Tosa</p>
              <div className="hub-landing-mock-kanban">
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Fila</span>
                  <span className="hub-landing-mock-pill">Bella</span>
                </div>
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Em serviço</span>
                  <span className="hub-landing-mock-pill hub-landing-mock-pill--active">Fred</span>
                </div>
                <div className="hub-landing-mock-kanban__col">
                  <span className="hub-landing-mock-kanban__head">Pronto</span>
                  <span className="hub-landing-mock-pill">Nina</span>
                </div>
              </div>
            </div>
            <div className="hub-landing-mock-card">
              <p className="hub-landing-mock-card__label">Clínica</p>
              <p className="hub-landing-mock-card__title">Fila do dia</p>
              <p className="hub-landing-mock-card__metric">6</p>
              <p className="hub-landing-mock-card__hint">Aguardando e em atendimento</p>
            </div>
            <div className="hub-landing-mock-card">
              <p className="hub-landing-mock-card__label">Hotel</p>
              <p className="hub-landing-mock-card__title">Ocupação</p>
              <p className="hub-landing-mock-card__metric">4</p>
              <p className="hub-landing-mock-card__hint">Check-ins previstos hoje</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HubProductMockup;
