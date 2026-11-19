import { applySurgeryServiceLinesToComandaItems } from '../hubComandasController';

describe('applySurgeryServiceLinesToComandaItems', () => {
  it('substitui appointment_service R$0 pelo serviço cirúrgico confirmado (cenário Jade)', () => {
    const result = applySurgeryServiceLinesToComandaItems({
      petId: 'pet-1',
      items: [
        {
          pet_id: 'pet-1',
          item_kind: 'service',
          hub_service_type_id: 'svc-cirurgia',
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: 'Consulta',
          quantity: 1,
          unit_amount: 0,
          discount_amount: 0,
          line_total: 0,
          service_date: null,
          origin_type: 'appointment_service',
          origin_id: 'appt-svc-1',
          sort_order: 0,
        },
      ],
      surgSvcList: [
        {
          id: 'surg-svc-1',
          surgery_id: 'surg-1',
          hub_service_type_id: 'svc-cirurgia',
          hub_appointment_service_id: 'appt-svc-1',
          service_name: 'Ovariohisterectomia',
          quantity: 1,
          unit_amount: 800,
        },
      ],
    });

    expect(result.subtotal).toBe(800);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      origin_type: 'surgery_service',
      origin_id: 'surg-svc-1',
      description: 'Cirurgia: Ovariohisterectomia',
      unit_amount: 800,
      line_total: 800,
    });
  });

  it('mantém consulta legítima separada e não duplica a mesma cobrança cirúrgica', () => {
    const result = applySurgeryServiceLinesToComandaItems({
      petId: 'pet-1',
      items: [
        {
          pet_id: 'pet-1',
          item_kind: 'service',
          hub_service_type_id: 'svc-consulta',
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: 'Consulta',
          quantity: 1,
          unit_amount: 150,
          discount_amount: 0,
          line_total: 150,
          service_date: null,
          origin_type: 'appointment_service',
          origin_id: 'appt-svc-consulta',
          sort_order: 0,
        },
        {
          pet_id: 'pet-1',
          item_kind: 'service',
          hub_service_type_id: 'svc-cirurgia',
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: 'Castração',
          quantity: 1,
          unit_amount: 800,
          discount_amount: 0,
          line_total: 800,
          service_date: null,
          origin_type: 'appointment_service',
          origin_id: 'appt-svc-cirurgia',
          sort_order: 1,
        },
      ],
      surgSvcList: [
        {
          id: 'surg-svc-1',
          surgery_id: 'surg-1',
          hub_service_type_id: 'svc-cirurgia',
          hub_appointment_service_id: 'appt-svc-cirurgia',
          service_name: 'Castração',
          quantity: 1,
          unit_amount: 800,
        },
      ],
    });

    expect(result.subtotal).toBe(950);
    expect(result.items.map((i) => i.description)).toEqual([
      'Consulta',
      'Cirurgia: Castração',
    ]);
  });

  it('reaplicar a mescla não duplica linhas cirúrgicas', () => {
    const first = applySurgeryServiceLinesToComandaItems({
      petId: 'pet-1',
      items: [
        {
          pet_id: 'pet-1',
          item_kind: 'service',
          hub_service_type_id: 'svc-cirurgia',
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: 'Castração',
          quantity: 1,
          unit_amount: 800,
          discount_amount: 0,
          line_total: 800,
          service_date: null,
          origin_type: 'appointment_service',
          origin_id: 'appt-svc-1',
          sort_order: 0,
        },
      ],
      surgSvcList: [
        {
          id: 'surg-svc-1',
          surgery_id: 'surg-1',
          hub_service_type_id: 'svc-cirurgia',
          hub_appointment_service_id: 'appt-svc-1',
          service_name: 'Castração',
          quantity: 1,
          unit_amount: 800,
        },
      ],
    });

    const second = applySurgeryServiceLinesToComandaItems({
      petId: 'pet-1',
      items: first.items,
      surgSvcList: [
        {
          id: 'surg-svc-1',
          surgery_id: 'surg-1',
          hub_service_type_id: 'svc-cirurgia',
          hub_appointment_service_id: 'appt-svc-1',
          service_name: 'Castração',
          quantity: 1,
          unit_amount: 800,
        },
      ],
    });

    expect(second.items).toHaveLength(1);
    expect(second.subtotal).toBe(800);
  });
});
