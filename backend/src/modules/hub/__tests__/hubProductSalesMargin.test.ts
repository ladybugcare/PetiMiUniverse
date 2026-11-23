/** Espelha a regra de COGS do relatório product-sales (snapshot → catálogo). */
function resolveUnitCost(
  line: { unit_cost_amount: number | null },
  catalogCost: number | null,
): number | null {
  if (line.unit_cost_amount != null && Number.isFinite(Number(line.unit_cost_amount))) {
    return Number(line.unit_cost_amount);
  }
  if (catalogCost != null && Number.isFinite(catalogCost)) return catalogCost;
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe('product sales margin / COGS', () => {
  it('usa snapshot da linha quando presente', () => {
    const qty = 3;
    const revenue = 90;
    const unitCost = resolveUnitCost({ unit_cost_amount: 10 }, 16);
    expect(unitCost).toBe(10);
    const cogs = round2(qty * (unitCost as number));
    const margin = round2(revenue - cogs);
    expect(cogs).toBe(30);
    expect(margin).toBe(60);
    expect(round2((margin / revenue) * 100)).toBe(66.67);
  });

  it('faz fallback para custo do catálogo quando não há snapshot', () => {
    const unitCost = resolveUnitCost({ unit_cost_amount: null }, 16);
    expect(unitCost).toBe(16);
  });

  it('trata ausência de custo como COGS 0', () => {
    const unitCost = resolveUnitCost({ unit_cost_amount: null }, null);
    expect(unitCost).toBeNull();
    const cogs = unitCost != null ? round2(2 * unitCost) : 0;
    expect(cogs).toBe(0);
  });
});
