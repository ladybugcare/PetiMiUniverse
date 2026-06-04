import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubClinicShell from './HubClinicShell';
import HubClinicEncountersPage from './HubClinicEncountersPage';
import HubClinicalWorkspacePage from './HubClinicalWorkspacePage';
import HubClinicRecordsPage from './HubClinicRecordsPage';
import HubClinicCasePage from './HubClinicCasePage';
import HubClinicHospitalPage from './HubClinicHospitalPage';
import HubClinicSurgeriesPage from './HubClinicSurgeriesPage';
import HubClinicTemplatesPage from './HubClinicTemplatesPage';

/** Rotas legadas → prontuário com aba */
function LegacyProntuarioRedirect({ tab }: { tab: string }) {
  return <Navigate to={`/hub/clinica/prontuarios?tab=${tab}`} replace />;
}

const HubClinicRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubClinicShell />}>
        <Route index element={<Navigate to="atendimentos" replace />} />
        <Route path="atendimentos" element={<HubClinicEncountersPage />} />
        <Route path="atendimentos/:encounterId" element={<HubClinicalWorkspacePage />} />
        <Route path="prontuarios" element={<HubClinicRecordsPage />} />
        <Route path="casos/:caseId" element={<HubClinicCasePage />} />
        <Route path="evolucoes" element={<LegacyProntuarioRedirect tab="timeline" />} />
        <Route path="prescricoes" element={<LegacyProntuarioRedirect tab="prescricoes" />} />
        <Route path="vacinas" element={<LegacyProntuarioRedirect tab="vacinas" />} />
        <Route path="exames" element={<LegacyProntuarioRedirect tab="exames" />} />
        <Route path="internacoes" element={<HubClinicHospitalPage />} />
        <Route path="cirurgias" element={<HubClinicSurgeriesPage />} />
        <Route path="templates" element={<HubClinicTemplatesPage />} />
      </Route>
    </Routes>
  );
};

export default HubClinicRoutes;
