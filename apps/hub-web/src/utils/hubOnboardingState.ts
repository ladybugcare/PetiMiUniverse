/** Utilizador CADMIN ainda sem clínica/unidade no Hub. */
export function needsHubClinicOnboarding(): boolean {
  try {
    const rawOnb = localStorage.getItem('clinicOnboarding');
    if (rawOnb) {
      const o = JSON.parse(rawOnb) as { shouldCompleteClinicProfile?: boolean; needsOnboarding?: boolean };
      if (o.shouldCompleteClinicProfile === true) return true;
      if (o.needsOnboarding === true && o.shouldCompleteClinicProfile !== false) {
        const cu = localStorage.getItem('clinic_user');
        if (cu) {
          const parsed = JSON.parse(cu) as { clinic_id?: string | null };
          if (!parsed.clinic_id) return true;
        }
      }
    }
    const rawCu = localStorage.getItem('clinic_user');
    if (!rawCu) return false;
    const cu = JSON.parse(rawCu) as { clinic_id?: string | null; role?: string };
    if (String(cu.role || '').toUpperCase() === 'CADMIN' && !cu.clinic_id) return true;
    return false;
  } catch {
    return false;
  }
}

export function markHubOnboardingComplete(clinicUser: Record<string, unknown>, unitId?: string) {
  localStorage.setItem('clinic_user', JSON.stringify(clinicUser));
  const clinicId =
    typeof clinicUser.clinic_id === 'string' && clinicUser.clinic_id.trim()
      ? clinicUser.clinic_id.trim()
      : null;
  if (unitId) {
    try {
      localStorage.setItem('selected_unit_id', unitId);
    } catch {
      /* ignore */
    }
  }
  localStorage.setItem(
    'clinicOnboarding',
    JSON.stringify({
      clinicId,
      shouldCompleteClinicProfile: false,
      needsOnboarding: false,
      hasUnits: true,
    }),
  );
  try {
    window.dispatchEvent(new Event('petimi:clinic-storage-updated'));
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem('hub_show_unit_incomplete_hint', '1');
  } catch {
    /* ignore */
  }
}

export function shouldShowUnitIncompleteHint(): boolean {
  try {
    return sessionStorage.getItem('hub_show_unit_incomplete_hint') === '1';
  } catch {
    return false;
  }
}
