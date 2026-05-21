import { getUserRole } from './authHelpers';

/**
 * Veterinários e freelancers só podem listar demandas e candidaturas após
 * `approval_status === 'approved'` e `status === 'active'` (mesma regra do login em `auth.ts`).
 * Usa `vetOnboarding` / `freelancerOnboarding` gravados no login.
 */
export function canVetFreelancerAccessDemandsAndApplications(user?: unknown): boolean {
  try {
    const parsed =
      user ??
      JSON.parse(typeof localStorage !== 'undefined' ? localStorage.getItem('user') || 'null' : 'null');
    if (!parsed) return true;

    const role = getUserRole(parsed as any);
    if (role !== 'VET' && role !== 'FREELANCER') {
      return true;
    }

    if (typeof localStorage === 'undefined') return false;

    const key = role === 'VET' ? 'vetOnboarding' : 'freelancerOnboarding';
    const raw = localStorage.getItem(key);
    if (!raw || raw.trim() === '') return false;

    const o = JSON.parse(raw);
    return o.isApproved === true;
  } catch {
    return false;
  }
}

/** Mesma regra do backend (`auth.ts`): aprovado + conta ativa. */
export function vetOrFreelancerRecordCanAccessDemandsFlow(row: {
  approval_status?: string;
  status?: string;
}): boolean {
  return row.approval_status === 'approved' && row.status === 'active';
}
