import {
  buildHospitalizationDailyItems,
  computeHospitalizationDays,
  estimateHospitalizationBillingAmount,
  hospitalizationChargeDescription,
  isHospitalizationClosed,
  mergeHospitalizationItemsIntoSnapshot,
  resolveHospitalizationBillingOrigin,
  shouldIncludeInUnbilledHospitalization,
} from '../hubHospitalizationBilling';

describe('hubHospitalizationBilling', () => {
  it('isHospitalizationClosed reconhece alta/óbito/transferência', () => {
    expect(isHospitalizationClosed('discharged')).toBe(true);
    expect(isHospitalizationClosed('death')).toBe(true);
    expect(isHospitalizationClosed('transferred')).toBe(true);
    expect(isHospitalizationClosed('active')).toBe(false);
    expect(isHospitalizationClosed('cancelled')).toBe(false);
  });

  it('computeHospitalizationDays conta dias civis com mínimo 1', () => {
    expect(computeHospitalizationDays('2026-06-01T10:00:00.000Z', '2026-06-01T18:00:00.000Z')).toBe(1);
    expect(computeHospitalizationDays('2026-06-01T10:00:00.000Z', '2026-06-03T08:00:00.000Z')).toBe(3);
  });

  it('buildHospitalizationDailyItems monta linha de diária', () => {
    const built = buildHospitalizationDailyItems({
      id: 'hosp-1',
      pet_id: 'pet-1',
      status: 'discharged',
      admitted_at: '2026-06-01T10:00:00.000Z',
      discharged_at: '2026-06-03T10:00:00.000Z',
      daily_hub_service_type_id: 'svc-daily',
      daily_unit_amount: 150,
      service_name: 'Diária UTI',
    });
    expect(built).not.toBeNull();
    expect(built!.line.quantity).toBe(3);
    expect(built!.subtotal).toBe(450);
    expect(built!.line.origin_type).toBe('hospitalization_daily');
  });

  it('estimateHospitalizationBillingAmount soma diária + charges', () => {
    const total = estimateHospitalizationBillingAmount(
      {
        id: 'hosp-1',
        status: 'discharged',
        admitted_at: '2026-06-01T10:00:00.000Z',
        discharged_at: '2026-06-02T10:00:00.000Z',
        daily_hub_service_type_id: 'svc-daily',
        daily_unit_amount: 100,
      },
      [{ id: 'ch-1', quantity: 2, unit_amount: 25, service_name: 'Soro', charge_kind: 'medication' }],
    );
    expect(total).toBe(250);
  });

  it('hospitalizationChargeDescription usa prefixo por kind', () => {
    expect(hospitalizationChargeDescription('medication', 'Dipirona')).toBe(
      'Medicação (internação): Dipirona',
    );
  });

  it('resolveHospitalizationBillingOrigin prefere encounter', () => {
    expect(
      resolveHospitalizationBillingOrigin({
        hub_encounter_id: 'enc-1',
        hub_appointment_id: 'appt-1',
      }),
    ).toEqual({ origin_type: 'encounter', origin_id: 'enc-1' });
    expect(
      resolveHospitalizationBillingOrigin({
        hub_encounter_id: null,
        hub_appointment_id: 'appt-1',
      }),
    ).toEqual({ origin_type: 'appointment', origin_id: 'appt-1' });
    expect(resolveHospitalizationBillingOrigin({})).toBeNull();
  });

  it('shouldIncludeInUnbilledHospitalization cobre alta sem cobrança', () => {
    const base = {
      id: 'hosp-1',
      status: 'discharged',
      billing_waived_at: null,
      deleted_at: null,
      hub_encounter_id: 'enc-1',
      hub_appointment_id: null,
    };
    const emptyCtx = {
      activeReceivableKeys: new Set<string>(),
      comandaOpenKeys: new Set<string>(),
      billedViaComandaKeys: new Set<string>(),
      alreadyListedBillingOrigins: new Set<string>(),
    };
    expect(shouldIncludeInUnbilledHospitalization(base, emptyCtx)).toBe(true);
    expect(
      shouldIncludeInUnbilledHospitalization(base, {
        ...emptyCtx,
        billedViaComandaKeys: new Set(['encounter:enc-1']),
      }),
    ).toBe(false);
    expect(
      shouldIncludeInUnbilledHospitalization(
        { ...base, billing_waived_at: '2026-01-01T00:00:00.000Z' },
        emptyCtx,
      ),
    ).toBe(false);
  });

  it('mergeHospitalizationItemsIntoSnapshot não duplica origin_id', () => {
    const snapshot = {
      items: [
        {
          origin_type: 'hospitalization_daily',
          origin_id: 'hosp-1',
          line_total: 100,
          sort_order: 0,
        },
      ],
      subtotal: 100,
    };
    const merged = mergeHospitalizationItemsIntoSnapshot(snapshot, [
      {
        pet_id: null,
        item_kind: 'service',
        hub_service_type_id: 'svc',
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: 'Diária',
        quantity: 1,
        unit_amount: 100,
        discount_amount: 0,
        line_total: 100,
        service_date: null,
        origin_type: 'hospitalization_daily',
        origin_id: 'hosp-1',
        sort_order: 0,
      },
      {
        pet_id: null,
        item_kind: 'service',
        hub_service_type_id: null,
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: 'Medicação (internação): X',
        quantity: 1,
        unit_amount: 40,
        discount_amount: 0,
        line_total: 40,
        service_date: null,
        origin_type: 'hospitalization_charge',
        origin_id: 'ch-1',
        sort_order: 1,
      },
    ]);
    expect(merged.items).toHaveLength(2);
    expect(merged.subtotal).toBe(140);
  });
});
