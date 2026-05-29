import { normalizeServiceGroupSlug } from './serviceTypeSlug';

export type StaffForCompatibility = {
  id: string;
  job_title?: string | null;
  active?: boolean;
  accepts_appointments?: boolean;
  service_types?: { id: string }[];
};

export type ServiceTypeForCompatibility = {
  id: string;
  service_group?: string | null;
};

/** Mapa slug do grupo → lista de `job_title` compatíveis. */
export type GroupJobMappings = Record<string, string[]>;

function normTitle(t: string): string {
  return t.trim().toLowerCase();
}

/** Profissional compatível com o tipo de serviço (função do grupo ou serviço explícito). */
export function isStaffCompatibleWithServiceType(
  staff: StaffForCompatibility,
  serviceType: ServiceTypeForCompatibility,
  jobMappings: GroupJobMappings,
): boolean {
  const group = normalizeServiceGroupSlug(serviceType.service_group);
  const allowed = jobMappings[group] ?? [];
  const title = staff.job_title?.trim() ?? '';
  if (title && allowed.some((j) => normTitle(j) === normTitle(title))) {
    return true;
  }
  const svcIds = (staff.service_types ?? []).map((s) => s.id);
  return svcIds.includes(serviceType.id);
}

export function filterCompatibleStaff<T extends StaffForCompatibility>(
  staffList: T[],
  serviceType: ServiceTypeForCompatibility | null | undefined,
  jobMappings: GroupJobMappings,
): T[] {
  if (!serviceType?.id) return [];
  return staffList.filter(
    (s) => s.active !== false && s.accepts_appointments !== false && isStaffCompatibleWithServiceType(s, serviceType, jobMappings),
  );
}

/** IDs de tipos de serviço sugeridos para uma função principal (grupos ligados). */
export function suggestServiceTypeIdsForJobTitle(
  jobTitle: string,
  jobMappings: GroupJobMappings,
  serviceTypes: { id: string; service_group?: string | null }[],
): string[] {
  const jt = normTitle(jobTitle);
  if (!jt) return [];
  const slugs = Object.entries(jobMappings)
    .filter(([, titles]) => titles.some((t) => normTitle(t) === jt))
    .map(([slug]) => slug);
  if (slugs.length === 0) return [];
  const slugSet = new Set(slugs);
  return serviceTypes
    .filter((st) => slugSet.has(normalizeServiceGroupSlug(st.service_group)))
    .map((st) => st.id);
}
