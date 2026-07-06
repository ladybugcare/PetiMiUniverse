import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import HubClinicSubnav from './HubClinicSubnav';
import '../clientes/clientes.css';
import './clinica-page.css';

const COCKPIT_PATHS = new Set(['/hub/clinica', '/hub/clinica/consultorio']);

function isCockpitRoute(pathname: string): boolean {
  if (COCKPIT_PATHS.has(pathname)) return true;
  if (pathname === '/hub/clinica/') return true;
  return false;
}

const HubClinicShell: React.FC = () => {
  const { pathname } = useLocation();
  const isCockpit = isCockpitRoute(pathname);

  return (
    <div className={`hub-clinic-page hub-clientes${isCockpit ? ' hub-clinic-page--cockpit' : ''}`}>
      <div className={`hub-clinic-shell${isCockpit ? '' : ' hub-clinic-shell--tabs'}`}>
        {!isCockpit ? <HubClinicSubnav /> : null}
        <div className="hub-clinic-shell__main">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubClinicShell;
