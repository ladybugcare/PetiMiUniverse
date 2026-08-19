/** Utilizador CADMIN/CMANAGER ainda sem clínica/unidade no Hub. */
export function needsHubClinicOnboarding(): boolean {
  try {
    const rawCu = localStorage.getItem('clinic_user');
    if (rawCu) {
      const cu = JSON.parse(rawCu) as { clinic_id?: string | null; role?: string };
      // Já vinculado a uma clínica (dono ou funcionário) — nunca forçar onboarding de org.
      if (cu.clinic_id) return false;
      const role = String(cu.role || '').toUpperCase();
      if (role === 'CADMIN' || role === 'CMANAGER') {
        const rawOnb = localStorage.getItem('clinicOnboarding');
        if (rawOnb) {
          const o = JSON.parse(rawOnb) as {
            shouldCompleteClinicProfile?: boolean;
            needsOnboarding?: boolean;
          };
          if (o.shouldCompleteClinicProfile === true) return true;
          if (o.needsOnboarding === true) return true;
        }
        return true;
      }
      // Staff sem clinic_id é estado inválido; não mandar para criar clínica.
      return false;
    }

    const rawOnb = localStorage.getItem('clinicOnboarding');
    if (rawOnb) {
      const o = JSON.parse(rawOnb) as {
        shouldCompleteClinicProfile?: boolean;
        needsOnboarding?: boolean;
        clinicId?: string | null;
      };
      if (o.clinicId) return false;
      if (o.shouldCompleteClinicProfile === true) return true;
    }
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

/** Remove o lembrete pós-onboarding (ex.: após abrir o perfil da clínica com sucesso). */
export function clearHubUnitIncompleteHint(): void {
  try {
    sessionStorage.removeItem('hub_show_unit_incomplete_hint');
    window.dispatchEvent(new Event('petimi:hub-unit-hint-updated'));
  } catch {
    /* ignore */
  }
}
