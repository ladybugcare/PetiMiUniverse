jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';

const CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const PET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
const ENCOUNTER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
const SERVICE_APP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0004';
const SERVICE_CONSULTA_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0005';
const ITEM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffff06';
const LOT_ID = '11111111-1111-4111-8111-111111110007';

function medicationFixture() {
  configureSupabaseMock({
    tables: {
      hub_service_types: [
        {
          id: SERVICE_APP_ID,
          clinic_id: CLINIC_ID,
          name: 'Aplicação IM',
          sale_amount: 35,
          active: true,
          deleted_at: null,
          is_encounter_application: true,
          service_group: 'clinica',
        },
        {
          id: SERVICE_CONSULTA_ID,
          clinic_id: CLINIC_ID,
          name: 'Consulta veterinária',
          sale_amount: 150,
          active: true,
          deleted_at: null,
          is_encounter_application: false,
          service_group: 'clinica',
        },
      ],
      hub_inventory_items: [
        {
          id: ITEM_ID,
          clinic_id: CLINIC_ID,
          name: 'Antibiótico frasco',
          sale_amount: 80,
          cost_amount: 20,
          deleted_at: null,
          active: true,
          item_kind: 'medication',
        },
      ],
      hub_inventory_lots: [
        {
          id: LOT_ID,
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_code: 'L-MED-1',
          expiry_date: '2027-06-01',
          received_at: '2026-01-01',
        },
      ],
      hub_stock_movements: [
        {
          id: '22222222-2222-4222-8222-222222220008',
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_id: LOT_ID,
          movement_type: 'purchase_in',
          qty: 5,
        },
      ],
      hub_encounter_medication_administrations: [],
      hub_clinical_timeline_events: [],
    },
  });
}

describe('API clínica — medicação na consulta', () => {
  it('POST rejeita serviço sem is_encounter_application', async () => {
    medicationFixture();
    const res = await request(app)
      .post('/api/hub/clinical/medication-administrations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        hub_service_type_id: SERVICE_CONSULTA_ID,
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error || '')).toMatch(/Aplicação na consulta/i);
  });

  it('POST com aplicação e lote baixa estoque', async () => {
    medicationFixture();
    const res = await request(app)
      .post('/api/hub/clinical/medication-administrations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        hub_service_type_id: SERVICE_APP_ID,
        hub_inventory_item_id: ITEM_ID,
        hub_inventory_lot_id: LOT_ID,
        quantity: 0.2,
        dose: '2 ml',
        use_route: 'IM',
      });

    expect(res.status).toBe(201);
    expect(res.body.administration.service_name).toBe('Aplicação IM');
    expect(res.body.administration.service_price).toBe(35);
    expect(res.body.administration.stock_movement_id).toBeTruthy();
    expect(Number(res.body.administration.quantity)).toBe(0.2);

    const client = getMockSupabaseClient();
    const movements = client._state.tables.hub_stock_movements ?? [];
    expect(
      movements.some(
        (m) =>
          m.movement_type === 'encounter_out' &&
          m.reference_type === 'medication_administration' &&
          Number(m.qty) === 0.2,
      ),
    ).toBe(true);
  });

  it('POST só com serviço (sem estoque) grava administração', async () => {
    medicationFixture();
    const res = await request(app)
      .post('/api/hub/clinical/medication-administrations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        hub_service_type_id: SERVICE_APP_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.administration.hub_inventory_item_id).toBeFalsy();
    expect(res.body.administration.stock_movement_id).toBeFalsy();
    expect(res.body.administration.service_price).toBe(35);
  });
});
