import React from 'react';
import { Route, Routes } from 'react-router-dom';
import HubImpressoesHubPage from './HubImpressoesHubPage';
import HubImpressoesAgendaPage from './HubImpressoesAgendaPage';
import HubImpressoesClinicaPage from './HubImpressoesClinicaPage';
import HubImpressoesBoardingPage from './HubImpressoesBoardingPage';
import HubImpressoesPickupPage from './HubImpressoesPickupPage';
import HubImpressoesPickupRoutePage from './HubImpressoesPickupRoutePage';
import HubImpressoesHospitalPage from './HubImpressoesHospitalPage';
import HubImpressoesHospMedPlanPage from './HubImpressoesHospMedPlanPage';

const HubImpressoesRoutes: React.FC = () => {
  return (
    <Routes>
      <Route index element={<HubImpressoesHubPage />} />
      <Route path="agenda" element={<HubImpressoesAgendaPage />} />
      <Route path="clinica" element={<HubImpressoesClinicaPage />} />
      <Route path="hotel-creche" element={<HubImpressoesBoardingPage />} />
      <Route path="leva-e-traz" element={<HubImpressoesPickupPage />} />
      <Route path="leva-e-traz/rota/:routeId" element={<HubImpressoesPickupRoutePage />} />
      <Route path="internacoes" element={<HubImpressoesHospitalPage />} />
      <Route
        path="internacoes/:hospitalizationId/plano-medicacao"
        element={<HubImpressoesHospMedPlanPage />}
      />
    </Routes>
  );
};

export default HubImpressoesRoutes;
