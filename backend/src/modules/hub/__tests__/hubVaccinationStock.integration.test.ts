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
const ITEM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0004';
const LOT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0005';

function vaccinationFixture(stockQty: number) {
  configureSupabaseMock({
    tables: {
      hub_inventory_items: [
        {
          id: ITEM_ID,
          clinic_id: CLINIC_ID,
          name: 'Vacina Raiva',
          sale_amount: 120,
          cost_amount: 16,
          deleted_at: null,
          active: true,
        },
      ],
      hub_inventory_lots: [
        {
          id: LOT_ID,
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_code: 'L001',
          expiry_date: '2027-06-01',
          received_at: '2026-01-01',
        },
      ],
      hub_stock_movements:
        stockQty > 0
          ? [
              {
                id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
                clinic_id: CLINIC_ID,
                item_id: ITEM_ID,
                lot_id: LOT_ID,
                movement_type: 'purchase_in',
                qty: stockQty,
              },
            ]
          : [],
      hub_vaccination_records: [],
      hub_clinical_timeline_events: [],
    },
  });
}

describe('API clínica — vacinação com estoque', () => {
  it('POST /clinical/vaccinations aplica vacina, baixa estoque e grava preço', async () => {
    vaccinationFixture(3);
    const res = await request(app)
      .post('/api/hub/clinical/vaccinations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        vaccine_name: 'Vacina Raiva',
        administered_at: '2026-09-01',
        source: 'in_clinic',
        hub_inventory_item_id: ITEM_ID,
        hub_inventory_lot_id: LOT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.vaccination.stock_movement_id).toBeTruthy();
    expect(res.body.vaccination.price).toBe(120);
    expect(res.body.vaccination.hub_inventory_item_id).toBe(ITEM_ID);

    const client = getMockSupabaseClient();
    const movements = client._state.tables.hub_stock_movements ?? [];
    expect(movements.some((m) => m.movement_type === 'encounter_out')).toBe(true);
  });

  it('POST /clinical/vaccinations exige lote para vacina na clínica', async () => {
    vaccinationFixture(3);
    const res = await request(app)
      .post('/api/hub/clinical/vaccinations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        vaccine_name: 'Vacina Raiva',
        administered_at: '2026-09-01',
        source: 'in_clinic',
        hub_inventory_item_id: ITEM_ID,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lote/i);
  });

  it('POST /clinical/vaccinations retorna 400 sem saldo e não mantém registro', async () => {
    vaccinationFixture(0);
    const res = await request(app)
      .post('/api/hub/clinical/vaccinations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        vaccine_name: 'Vacina Raiva',
        administered_at: '2026-09-01',
        source: 'in_clinic',
        hub_inventory_item_id: ITEM_ID,
        hub_inventory_lot_id: LOT_ID,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insuficiente|lote/i);

    const client = getMockSupabaseClient();
    expect(client._state.tables.hub_vaccination_records ?? []).toHaveLength(0);
  });

  it('POST /clinical/vaccinations externa não exige estoque', async () => {
    vaccinationFixture(0);
    const res = await request(app)
      .post('/api/hub/clinical/vaccinations')
      .send({
        clinic_id: CLINIC_ID,
        pet_id: PET_ID,
        hub_encounter_id: ENCOUNTER_ID,
        vaccine_name: 'Vacina externa',
        administered_at: '2026-09-01',
        source: 'external',
        batch_number: 'EXT-001',
      });

    expect(res.status).toBe(201);
    expect(res.body.vaccination.source).toBe('external');
    expect(res.body.vaccination.stock_movement_id).toBeNull();
  });
});
