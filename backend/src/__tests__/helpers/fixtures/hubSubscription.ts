/** Assinatura beta mínima para passar em requireHubEntitlement nos testes. */
export function betaClinicSubscription(clinicId: string) {
  return {
    id: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
    clinic_id: clinicId,
    base_plan_id: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1',
    status: 'beta',
    is_beta: true,
    beta_free_until: null,
    beta_discount_percent: null,
    override_monthly_cents: null,
    beta_notes: 'test beta',
    enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
    started_at: '2026-01-01T00:00:00.000Z',
    canceled_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    mp_preapproval_id: null,
    pending_plan_id: null,
    current_period_end: null,
    hub_platform_plans: {
      slug: 'beta',
      name: 'Beta',
      max_units: null,
      max_users: null,
      monthly_price_cents: 0,
      plan_config: {},
    },
  };
}
