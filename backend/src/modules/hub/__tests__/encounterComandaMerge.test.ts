import { applyEncounterServiceLinesToComandaItems } from '../hubComandasController';

describe('applyEncounterServiceLinesToComandaItems', () => {
  it('adiciona encounter_service e preserva consulta da agenda', () => {
    const items = [
      {
        pet_id: 'pet-1',
        item_kind: 'service' as const,
        hub_service_type_id: 'svc-consulta',
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: 'Consulta clínica',
        quantity: 1,
        unit_amount: 180,
        discount_amount: 0,
        line_total: 180,
        service_date: null,
        origin_type: 'appointment_service' as const,
        origin_id: 'appt-svc-1',
        sort_order: 0,
      },
    ];

    const merged = applyEncounterServiceLinesToComandaItems({
      items,
      petId: 'pet-1',
      encSvcList: [
        {
          id: 'enc-svc-1',
          hub_service_type_id: 'svc-hemo',
          hub_appointment_service_id: null,
          service_name: 'Hemograma',
          quantity: 1,
          unit_amount: 90,
        },
      ],
    });

    expect(merged.items).toHaveLength(2);
    expect(merged.items.some((it) => it.origin_type === 'appointment_service')).toBe(true);
    expect(merged.items.some((it) => it.origin_type === 'encounter_service')).toBe(true);
    expect(merged.subtotal).toBe(270);
  });

  it('substitui appointment_service quando hub_appointment_service_id bate', () => {
    const items = [
      {
        pet_id: 'pet-1',
        item_kind: 'service' as const,
        hub_service_type_id: 'svc-hemo',
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: 'Hemograma',
        quantity: 1,
        unit_amount: 80,
        discount_amount: 0,
        line_total: 80,
        service_date: null,
        origin_type: 'appointment_service' as const,
        origin_id: 'appt-svc-hemo',
        sort_order: 0,
      },
    ];

    const merged = applyEncounterServiceLinesToComandaItems({
      items,
      petId: 'pet-1',
      encSvcList: [
        {
          id: 'enc-svc-hemo',
          hub_service_type_id: 'svc-hemo',
          hub_appointment_service_id: 'appt-svc-hemo',
          service_name: 'Hemograma',
          quantity: 1,
          unit_amount: 90,
        },
      ],
    });

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.origin_type).toBe('encounter_service');
    expect(merged.subtotal).toBe(90);
  });
});
