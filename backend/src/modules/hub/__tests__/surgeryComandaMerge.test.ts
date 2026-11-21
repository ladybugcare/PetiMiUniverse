import {
  applySurgeryServiceLinesToComandaItems,
  resolveSurgeryMergeIntoComandaItems,
} from '../hubComandasController';

function consultaLine(amount: number) {
  return {
    pet_id: 'pet-1',
    item_kind: 'service' as const,
    hub_service_type_id: 'svc-consulta',
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: 'QA Consulta',
    quantity: 1,
    unit_amount: amount,
    discount_amount: 0,
    line_total: amount,
    service_date: null,
    origin_type: 'appointment_service' as const,
    origin_id: 'appt-svc-consulta',
    sort_order: 0,
  };
}

function vacinaLine(amount: number) {
  return {
    pet_id: 'pet-1',
    item_kind: 'product' as const,
    hub_service_type_id: null,
    hub_inventory_item_id: 'inv-vax-1',
    hub_inventory_lot_id: 'lot-1',
    description: 'Vacina: QA Vacina Diagnóstico V10',
    quantity: 1,
    unit_amount: amount,
    discount_amount: 0,
    line_total: amount,
    service_date: null,
    origin_type: 'vaccination' as const,
    origin_id: 'vax-1',
    sort_order: 1,
  };
}

/** Simula o padrão do builder: clear + push da lista retornada pelo merge. */
function clearAndPushLikeBuilder(
  original: Array<Record<string, unknown>>,
  merged: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  original.length = 0;
  original.push(...merged);
  return original;
}

describe('resolveSurgeryMergeIntoComandaItems (sem cirurgia — anti-alias)', () => {
  it('consulta avulsa: clear+push preserva a linha e o total', () => {
    const allItems: Array<Record<string, unknown>> = [consultaLine(100)];
    const merged = resolveSurgeryMergeIntoComandaItems({
      items: allItems as never,
      subtotal: 100,
      petId: 'pet-1',
      surgSvcList: [],
    });
    expect(merged.items).not.toBe(allItems);
    expect(merged.subtotal).toBe(100);

    clearAndPushLikeBuilder(allItems, merged.items as Array<Record<string, unknown>>);
    expect(allItems).toHaveLength(1);
    expect(allItems[0]).toMatchObject({ description: 'QA Consulta', line_total: 100 });
  });

  it('consulta + vacina: clear+push preserva as duas linhas e R$ 189,90', () => {
    const allItems: Array<Record<string, unknown>> = [consultaLine(100), vacinaLine(89.9)];
    const merged = resolveSurgeryMergeIntoComandaItems({
      items: allItems as never,
      subtotal: 189.9,
      petId: 'pet-1',
      surgSvcList: [],
    });
    expect(merged.items).not.toBe(allItems);
    expect(merged.subtotal).toBe(189.9);
    expect(merged.items.map((i) => i.description)).toEqual([
      'QA Consulta',
      'Vacina: QA Vacina Diagnóstico V10',
    ]);

    clearAndPushLikeBuilder(allItems, merged.items as Array<Record<string, unknown>>);
    expect(allItems).toHaveLength(2);
    expect(allItems.reduce((s, it) => s + Number(it.line_total), 0)).toBeCloseTo(189.9, 5);
  });
});

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
