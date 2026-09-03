import React from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import HubClinicShell from './HubClinicShell';
import HubVetCockpitPage from './vet-cockpit/HubVetCockpitPage';
import HubClinicalWorkspacePage from './HubClinicalWorkspacePage';
import HubClinicRecordsPage from './HubClinicRecordsPage';
import HubClinicCasePage from './HubClinicCasePage';
import HubStandalonePrescriptionPage from './HubStandalonePrescriptionPage';

/** Rotas legadas → prontuário com aba */
function LegacyProntuarioRedirect({ tab }: { tab: string }) {
  return <Navigate to={`/hub/clinica/prontuarios?tab=${tab}`} replace />;
}

/** Internações/cirurgias moram no Consultório — preserva query e abre o fluxo certo. */
function LegacyOpsRedirect({ action }: { action: 'admit' | 'surgery' }) {
  const [sp] = useSearchParams();
  const next = new URLSearchParams(sp);
  if (action === 'admit') next.set('admit', '1');
  if (action === 'surgery') next.set('surgery', '1');
  next.delete('tab');
  const q = next.toString();
  return <Navigate to={`/hub/clinica${q ? `?${q}` : ''}`} replace />;
}

const HubClinicRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubClinicShell />}>
        <Route index element={<HubVetCockpitPage />} />
        <Route path="consultorio" element={<Navigate to="/hub/clinica" replace />} />
        {/* Fila ampla legada → consultório (operação unificada). Workspace do encounter permanece. */}
        <Route path="atendimentos" element={<Navigate to="/hub/clinica" replace />} />
        <Route path="atendimentos/:encounterId" element={<HubClinicalWorkspacePage />} />
        <Route path="prontuarios" element={<HubClinicRecordsPage />} />
        <Route path="casos/:caseId" element={<HubClinicCasePage />} />
        <Route path="receitas/nova" element={<HubStandalonePrescriptionPage />} />
        <Route path="evolucoes" element={<LegacyProntuarioRedirect tab="timeline" />} />
        <Route path="prescricoes" element={<LegacyProntuarioRedirect tab="prescricoes" />} />
        <Route path="vacinas" element={<LegacyProntuarioRedirect tab="vacinas" />} />
        <Route path="exames" element={<LegacyProntuarioRedirect tab="exames" />} />
        <Route path="internacoes" element={<LegacyOpsRedirect action="admit" />} />
        <Route path="cirurgias" element={<LegacyOpsRedirect action="surgery" />} />
      </Route>
    </Routes>
  );
};

export default HubClinicRoutes;
