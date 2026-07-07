export const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_GUARDIAN_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_PET_ID = '33333333-3333-4333-8333-333333333333';
export const TEST_PET_ID_2 = '33333333-3333-4333-8333-333333333334';
export const TEST_UNIT_ID = '44444444-4444-4444-8444-444444444444';
export const TEST_SERVICE_TYPE_ID = '55555555-5555-4555-8555-555555555555';
export const TEST_ADDON_SERVICE_TYPE_ID = '55555555-5555-4555-8555-555555555556';
export const TEST_PACKAGE_ID = '66666666-6666-4666-8666-666666666666';
export const TEST_PACKAGE_ID_2 = '66666666-6666-4666-8666-666666666667';
export const TEST_DAYCARE_SERVICE_TYPE_ID = '55555555-5555-4555-8555-555555555557';

export function bathServiceType() {
  return {
    id: TEST_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    name: 'Banho P',
    code: 'banho_p',
    service_group: 'banho_tosa',
    cost_amount: 40,
    sale_amount: 60,
    pricing_matrix: null,
    active: true,
    deleted_at: null,
    is_addon: false,
  };
}

export function addonServiceType() {
  return {
    id: TEST_ADDON_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    name: 'Hidratação',
    code: 'hidratacao',
    service_group: 'banho_tosa',
    cost_amount: 15,
    sale_amount: 25,
    pricing_matrix: null,
    active: true,
    deleted_at: null,
    is_addon: true,
  };
}

export function daycareServiceType() {
  return {
    id: TEST_DAYCARE_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    name: 'Creche diária',
    code: 'creche',
    service_group: 'creche',
    cost_amount: 30,
    sale_amount: 50,
    pricing_matrix: null,
    active: true,
    deleted_at: null,
    is_addon: false,
  };
}

export function hubPackageRow() {
  return {
    id: TEST_PACKAGE_ID,
    clinic_id: TEST_CLINIC_ID,
    name: 'Pacote 10 banhos',
    hub_service_type_id: TEST_SERVICE_TYPE_ID,
    sessions_total: 10,
    price: 500,
    validity_days: 90,
    active: true,
    package_kind: 'single',
    pricing_mode: 'manual',
    catalog_subtotal: 600,
    discount_amount: 0,
    discount_percent: null,
    notes: null,
  };
}

export function hubPackageRow2() {
  return {
    id: TEST_PACKAGE_ID_2,
    clinic_id: TEST_CLINIC_ID,
    name: 'Pacote 5 creches',
    hub_service_type_id: TEST_DAYCARE_SERVICE_TYPE_ID,
    sessions_total: 5,
    price: 200,
    validity_days: 60,
    active: true,
    package_kind: 'single',
    pricing_mode: 'manual',
    catalog_subtotal: 250,
    discount_amount: 0,
    discount_percent: null,
    notes: null,
  };
}

export function hubPackageItemRow2() {
  return {
    id: '77777777-7777-4777-8777-777777777778',
    clinic_id: TEST_CLINIC_ID,
    package_id: TEST_PACKAGE_ID_2,
    hub_service_type_id: TEST_DAYCARE_SERVICE_TYPE_ID,
    quantity: 5,
    sort_order: 0,
  };
}

export function hubPackageItemRow() {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    clinic_id: TEST_CLINIC_ID,
    package_id: TEST_PACKAGE_ID,
    hub_service_type_id: TEST_SERVICE_TYPE_ID,
    quantity: 10,
    sort_order: 0,
  };
}

export function emptyPackageTables() {
  return {
    hub_service_types: [] as Record<string, unknown>[],
    hub_packages: [] as Record<string, unknown>[],
    hub_package_items: [] as Record<string, unknown>[],
    hub_comandas: [] as Record<string, unknown>[],
    hub_comanda_items: [] as Record<string, unknown>[],
    hub_customer_package_balances: [] as Record<string, unknown>[],
    hub_package_redemptions: [] as Record<string, unknown>[],
    hub_receivables: [] as Record<string, unknown>[],
    hub_receivable_lines: [] as Record<string, unknown>[],
    hub_payments: [] as Record<string, unknown>[],
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, is_main: true, name: 'Principal' }],
    hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, full_name: 'Tutor Teste', deleted_at: null }],
    hub_pets: [
      { id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, name: 'Atum', deleted_at: null },
      { id: TEST_PET_ID_2, clinic_id: TEST_CLINIC_ID, name: 'Mel', deleted_at: null },
    ],
    hub_clinic_settings: [
      {
        clinic_id: TEST_CLINIC_ID,
        accepted_payment_methods: ['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'customer_credit'],
      },
    ],
  };
}
