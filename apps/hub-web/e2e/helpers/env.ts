import { readProvisionedUsers } from './users';

function trimEnv(name: string): string {
  return (process.env[name] || '').trim();
}

export function hubCadminCredentials(): { email: string; password: string } | null {
  const provisioned = readProvisionedUsers()?.cadmin;
  if (provisioned?.email && provisioned?.password) {
    return { email: provisioned.email, password: provisioned.password };
  }
  const email = trimEnv('E2E_HUB_EMAIL');
  const password = trimEnv('E2E_HUB_PASSWORD');
  if (!email || !password) return null;
  return { email, password };
}

export function hubCstaffCredentials(): { email: string; password: string } | null {
  const provisioned = readProvisionedUsers()?.cstaff;
  if (provisioned?.email && provisioned?.password) {
    return { email: provisioned.email, password: provisioned.password };
  }
  const email = trimEnv('E2E_CSTAFF_EMAIL');
  const password = trimEnv('E2E_CSTAFF_PASSWORD');
  if (!email || !password) return null;
  return { email, password };
}

function credsFromRow(
  row: { email?: string; password?: string } | undefined,
): { email: string; password: string } | null {
  if (row?.email && row?.password) return { email: row.email, password: row.password };
  return null;
}

export function hubCstaffBathCredentials() {
  return credsFromRow(readProvisionedUsers()?.cstaffBath);
}

export function hubCstaffClinicCredentials() {
  return credsFromRow(readProvisionedUsers()?.cstaffClinic);
}

export function hubCstaffHotelCredentials() {
  return credsFromRow(readProvisionedUsers()?.cstaffHotel);
}

export function hubCstaffCashCredentials() {
  return credsFromRow(readProvisionedUsers()?.cstaffCash);
}

export function hubCstaffReceptionCredentials() {
  return credsFromRow(readProvisionedUsers()?.cstaffReception);
}

export function e2eOpsNames(): { guardianName: string; petName: string; driverName: string } {
  const file = readProvisionedUsers();
  return {
    guardianName: file?.guardianName || '[E2E] Maria Tutor',
    petName: file?.petName || '[E2E] Thor',
    driverName: file?.cstaff?.fullName || 'E2E Motorista Leva e Traz',
  };
}
