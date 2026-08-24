import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as setup } from '@playwright/test';
import { ApiError, apiJson, waitForApi } from './helpers/api';
import { loadDotEnvFile } from './helpers/dotenv';
import {
  E2E_CADMIN,
  E2E_CSTAFF,
  E2E_CSTAFF_BANHO,
  E2E_CSTAFF_CAIXA,
  E2E_CSTAFF_CLINICA,
  E2E_CSTAFF_HOTEL,
  E2E_CSTAFF_RECEPCAO,
  E2E_GUARDIAN,
  E2E_PET,
  provisionPassword,
  writeProvisionedUsers,
  type E2EUsersFile,
} from './helpers/users';
import {
  ensureAgendaScenarios,
  ensureGuardianPet,
  ensureServiceCatalog,
  ensureTodayPickupAppointment,
} from './helpers/provisionOps';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnvFile(join(appRoot, '.env.e2e.local'));
loadDotEnvFile(join(appRoot, '../../backend/.env'));
loadDotEnvFile(join(appRoot, '../../backend/.env.local'));

type LoginResult = {
  session?: { access_token?: string };
  clinicUser?: {
    clinic_id?: string | null;
    unit_id?: string | null;
    role?: string;
  } | null;
  onboarding?: {
    needsOnboarding?: boolean;
    shouldCompleteClinicProfile?: boolean;
    clinicId?: string | null;
  } | null;
};

type SessionContext = {
  clinicUser?: {
    clinic_id?: string | null;
    unit_id?: string | null;
  } | null;
  onboarding?: {
    needsOnboarding?: boolean;
    shouldCompleteClinicProfile?: boolean;
    clinicId?: string | null;
  };
};

type StaffRow = {
  id: string;
  hub_access_email?: string | null;
  clinic_user_id?: string | null;
  default_unit_id?: string | null;
};

function isAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('já está') || m.includes('already') || m.includes('registered');
}

async function login(email: string, password: string): Promise<LoginResult> {
  return apiJson<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

async function tryLogin(email: string, password: string): Promise<LoginResult | null> {
  try {
    return await login(email, password);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400)) return null;
    throw e;
  }
}

async function signupCadmin(email: string, password: string, fullName: string) {
  try {
    await apiJson('/api/hub/signup', {
      method: 'POST',
      body: {
        full_name: fullName,
        email,
        password,
        phone: '11999990000',
      },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && isAlreadyRegistered(e.message)) return;
    throw e;
  }
}

function needsClinic(loginData: LoginResult, ctx?: SessionContext): boolean {
  if (ctx?.clinicUser?.clinic_id) return false;
  if (loginData.clinicUser?.clinic_id) return false;
  const onb = ctx?.onboarding || loginData.onboarding;
  return Boolean(onb?.shouldCompleteClinicProfile || onb?.needsOnboarding);
}

function cnpjFromStamp(): string {
  const n = Date.now().toString().slice(-12).padStart(12, '0');
  return `${n}81`;
}

async function completeOnboarding(token: string) {
  const cnpjs = ['24871585000106', cnpjFromStamp(), cnpjFromStamp()];
  let last: unknown;
  for (const cnpj of cnpjs) {
    try {
      await apiJson('/api/hub/onboarding/clinic', {
        method: 'POST',
        token,
        body: {
          clinic: {
            name: 'Clínica E2E Hub',
            cnpj,
            address: 'Rua E2E, 100',
            city: 'São Paulo',
            state: 'SP',
            phone: '1133334444',
            description: 'Clínica criada automaticamente pelos testes e2e.',
          },
          unit: {
            name: 'Unidade E2E',
            nickname: 'E2E',
            address: 'Rua E2E, 100',
            city: 'São Paulo',
            state: 'SP',
            phone: '1133334444',
            is_main: true,
            technical_manager: E2E_CADMIN.fullName,
          },
          plan_slug: 'beta',
          beta_terms_accepted: true,
        },
      });
      return;
    } catch (e) {
      last = e;
      const msg = (e as Error).message.toLowerCase();
      if (msg.includes('cnpj') || msg.includes('já')) continue;
      throw e;
    }
  }
  throw last instanceof Error ? last : new Error('Falha ao concluir onboarding da clínica e2e.');
}

async function sessionContext(token: string): Promise<SessionContext> {
  return apiJson<SessionContext>('/api/hub/session/context', { token });
}

async function resolveClinicUnit(token: string, loginData: LoginResult) {
  const ctx = await sessionContext(token);
  if (needsClinic(loginData, ctx)) {
    await completeOnboarding(token);
  }
  const after = await sessionContext(token);
  const clinicId = after.clinicUser?.clinic_id || after.onboarding?.clinicId || '';
  const unitId = after.clinicUser?.unit_id || '';
  if (!clinicId || !unitId) {
    throw new Error(
      'CADMIN e2e sem clínica/unidade após o onboarding. Verifique HUB_WEB_URL no backend e o POST /api/hub/onboarding/clinic.',
    );
  }
  return { clinicId, unitId };
}

function tokenFromInvite(payload: {
  invitation_url?: string;
  invitation?: { token?: string };
}): string {
  if (payload.invitation?.token) return payload.invitation.token;
  const url = payload.invitation_url || '';
  try {
    return new URL(url).searchParams.get('token') || '';
  } catch {
    const m = url.match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
}

type CstaffSpec = {
  email: string;
  password: string;
  fullName: string;
  jobTitle: string;
  professionalKind: 'driver' | 'bather' | 'assistant' | 'caretaker' | 'reception';
  operationalAreas: string[];
  agendaColor: string;
};

async function ensureCstaff(adminToken: string, clinicId: string, unitId: string, spec: CstaffSpec) {
  const { email, password, fullName, jobTitle, professionalKind, operationalAreas, agendaColor } = spec;
  const listed = await apiJson<{ staff?: StaffRow[] }>(
    `/api/hub/staff?clinic_id=${encodeURIComponent(clinicId)}`,
    { token: adminToken },
  );
  let staff = (listed.staff || []).find(
    (s) => (s.hub_access_email || '').trim().toLowerCase() === email.toLowerCase(),
  );

  if (staff?.clinic_user_id) {
    const ok = await tryLogin(email, password);
    if (!ok) {
      throw new Error(
        `CSTAFF ${email} já existe, mas a senha e2e não funciona. Redefina a senha no Supabase ou apague o usuário de teste.`,
      );
    }
    return;
  }

  if (!staff) {
    const created = await apiJson<{ staff: StaffRow }>('/api/hub/staff', {
      method: 'POST',
      token: adminToken,
      body: {
        clinic_id: clinicId,
        full_name: fullName,
        job_title: jobTitle,
        professional_kind: professionalKind,
        email,
        has_hub_access: true,
        hub_access_email: email,
        hub_access_role: 'CSTAFF',
        operational_areas: operationalAreas,
        default_unit_id: unitId,
        accepts_appointments: false,
        agenda_color: agendaColor,
      },
    });
    staff = created.staff;
  }

  const invite = await apiJson<{
    invitation_url?: string;
    invitation?: { token?: string };
  }>(`/api/hub/staff/${staff.id}/invite`, {
    method: 'POST',
    token: adminToken,
    body: { clinic_id: clinicId },
  });

  const token = tokenFromInvite(invite);
  if (!token) {
    throw new Error(`Convite do CSTAFF ${email} não devolveu token. Não foi possível criar a conta.`);
  }

  try {
    await apiJson('/api/hub/invitations/signup', {
      method: 'POST',
      body: {
        token,
        full_name: fullName,
        password,
        phone: '11988887777',
      },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const ok = await tryLogin(email, password);
      if (ok) return;
      throw new Error(
        `CSTAFF ${email} já possui conta, mas a senha e2e não funciona. Redefina a senha no Supabase.`,
      );
    }
    throw e;
  }
}

setup('provisiona CADMIN, clínica, CSTAFF e dados operacionais', async () => {
  setup.setTimeout(180_000);
  await waitForApi();

  const password = provisionPassword();
  const cadminEmail = E2E_CADMIN.email;

  let session = await tryLogin(cadminEmail, password);
  if (!session) {
    await signupCadmin(cadminEmail, password, E2E_CADMIN.fullName);
    session = await tryLogin(cadminEmail, password);
  }
  if (!session?.session?.access_token) {
    throw new Error(
      `Não foi possível autenticar o CADMIN ${cadminEmail}. Se a conta já existir com outra senha, apague-a no Supabase ou defina E2E_HUB_PASSWORD.`,
    );
  }

  const token = session.session.access_token;
  const { clinicId, unitId } = await resolveClinicUnit(token, session);

  const cstaffLevaTraz = {
    email: E2E_CSTAFF.email,
    password,
    fullName: E2E_CSTAFF.fullName,
    jobTitle: 'Motorista',
    professionalKind: 'driver' as const,
    operationalAreas: ['leva_traz'],
    agendaColor: '#1565c0',
  };
  const cstaffBanho = {
    email: E2E_CSTAFF_BANHO.email,
    password,
    fullName: E2E_CSTAFF_BANHO.fullName,
    jobTitle: 'Banho e tosa',
    professionalKind: 'bather' as const,
    operationalAreas: ['banho_tosa'],
    agendaColor: '#6a1b9a',
  };
  const cstaffClinica = {
    email: E2E_CSTAFF_CLINICA.email,
    password,
    fullName: E2E_CSTAFF_CLINICA.fullName,
    jobTitle: 'Assistente clínico',
    professionalKind: 'assistant' as const,
    operationalAreas: ['clinica'],
    agendaColor: '#2e7d32',
  };
  const cstaffHotel = {
    email: E2E_CSTAFF_HOTEL.email,
    password,
    fullName: E2E_CSTAFF_HOTEL.fullName,
    jobTitle: 'Cuidador',
    professionalKind: 'caretaker' as const,
    operationalAreas: ['hotel_creche'],
    agendaColor: '#ef6c00',
  };
  const cstaffCaixa = {
    email: E2E_CSTAFF_CAIXA.email,
    password,
    fullName: E2E_CSTAFF_CAIXA.fullName,
    jobTitle: 'Caixa',
    professionalKind: 'reception' as const,
    operationalAreas: ['caixa'],
    agendaColor: '#00838f',
  };
  const cstaffRecepcao = {
    email: E2E_CSTAFF_RECEPCAO.email,
    password,
    fullName: E2E_CSTAFF_RECEPCAO.fullName,
    jobTitle: 'Recepção',
    professionalKind: 'reception' as const,
    operationalAreas: ['recepcao'],
    agendaColor: '#5d4037',
  };

  await ensureCstaff(token, clinicId, unitId, cstaffLevaTraz);
  await ensureCstaff(token, clinicId, unitId, cstaffBanho);
  await ensureCstaff(token, clinicId, unitId, cstaffClinica);
  await ensureCstaff(token, clinicId, unitId, cstaffHotel);
  await ensureCstaff(token, clinicId, unitId, cstaffCaixa);
  await ensureCstaff(token, clinicId, unitId, cstaffRecepcao);

  const catalog = await ensureServiceCatalog(token, clinicId);
  const { guardianId, petId } = await ensureGuardianPet(token, clinicId);
  await ensureTodayPickupAppointment(
    token,
    clinicId,
    unitId,
    guardianId,
    petId,
    catalog.bathId,
    catalog.pickupId,
  );
  await ensureAgendaScenarios(token, clinicId, unitId, guardianId, petId, catalog);

  const file: E2EUsersFile = {
    cadmin: { email: cadminEmail, password, fullName: E2E_CADMIN.fullName },
    cstaff: { email: cstaffLevaTraz.email, password, fullName: cstaffLevaTraz.fullName },
    cstaffBath: { email: cstaffBanho.email, password, fullName: cstaffBanho.fullName },
    cstaffClinic: { email: cstaffClinica.email, password, fullName: cstaffClinica.fullName },
    cstaffHotel: { email: cstaffHotel.email, password, fullName: cstaffHotel.fullName },
    cstaffCash: { email: cstaffCaixa.email, password, fullName: cstaffCaixa.fullName },
    cstaffReception: { email: cstaffRecepcao.email, password, fullName: cstaffRecepcao.fullName },
    clinicId,
    unitId,
    guardianName: E2E_GUARDIAN.fullName,
    petName: E2E_PET.name,
  };
  writeProvisionedUsers(file);
  console.log(
    `[e2e] contas e dados prontos: CADMIN ${cadminEmail} | CSTAFF ${cstaffLevaTraz.email}, ${cstaffBanho.email}, ${cstaffClinica.email}, ${cstaffHotel.email}, ${cstaffCaixa.email}, ${cstaffRecepcao.email} | ${E2E_PET.name} (senha em e2e/.auth/users.json)`,
  );
});
