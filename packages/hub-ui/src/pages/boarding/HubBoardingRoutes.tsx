import React from 'react';
import { Route, Routes } from 'react-router-dom';
import HubBoardingShell from './HubBoardingShell';
import HubBoardingPage from './HubBoardingPage';
import HubBoardingFloorPage from './HubBoardingFloorPage';

const HubBoardingRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubBoardingShell />}>
        <Route index element={<HubBoardingPage />} />
        <Route path="minha-fila" element={<HubBoardingFloorPage />} />
      </Route>
    </Routes>
  );
};

export default HubBoardingRoutes;
