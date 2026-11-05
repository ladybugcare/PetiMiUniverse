import React from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import HubPickupShell from './HubPickupShell';
import HubPickupPage from './HubPickupPage';
import PickupMyRoutePage from './PickupMyRoutePage';
import PickupDriverView from './PickupDriverView';
import PickupRouteMonitorPage from './PickupRouteMonitorPage';

function PickupDriverViewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  if (!routeId) return <p style={{ padding: '1rem' }}>ID de rota inválido.</p>;
  return <PickupDriverView routeId={routeId} />;
}

function PickupRouteMonitorViewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  if (!routeId) return <p style={{ padding: '1rem' }}>ID de rota inválido.</p>;
  return <PickupRouteMonitorPage routeId={routeId} />;
}

const HubPickupRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubPickupShell />}>
        <Route index element={<HubPickupPage />} />
        <Route path="minha-rota" element={<PickupMyRoutePage />} />
      </Route>
      <Route path="motorista/:routeId" element={<PickupDriverViewPage />} />
      <Route path="monitoramento/:routeId" element={<PickupRouteMonitorViewPage />} />
    </Routes>
  );
};

export default HubPickupRoutes;
