import React from 'react';
import { Route, Routes } from 'react-router-dom';
import HubGroomingShell from './HubGroomingShell';
import HubGroomingQueuePage from './HubGroomingQueuePage';
import HubGroomingFloorPage from './HubGroomingFloorPage';

const HubGroomingRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubGroomingShell />}>
        <Route index element={<HubGroomingQueuePage />} />
        <Route path="minha-fila" element={<HubGroomingFloorPage />} />
      </Route>
    </Routes>
  );
};

export default HubGroomingRoutes;
