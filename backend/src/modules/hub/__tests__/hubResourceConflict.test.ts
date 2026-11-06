import { isResourceScheduleConflict } from '../hubResourceConflict';

describe('isResourceScheduleConflict', () => {
  const unit = 'unit-1';

  it('conflita pelo id do catálogo', () => {
    expect(
      isResourceScheduleConflict(
        { hubResourceId: 'r1', resourceLabel: 'Banheira 1', unitId: unit },
        { hubResourceId: 'r1', resourceLabel: 'Outro nome', unitId: unit },
      ),
    ).toBe(true);
  });

  it('não conflita ids diferentes na mesma unidade', () => {
    expect(
      isResourceScheduleConflict(
        { hubResourceId: 'r1', resourceLabel: 'Banheira 1', unitId: unit },
        { hubResourceId: 'r2', resourceLabel: 'Banheira 1', unitId: unit },
      ),
    ).toBe(false);
  });

  it('ainda conflita texto livre legado', () => {
    expect(
      isResourceScheduleConflict(
        { hubResourceId: null, resourceLabel: 'Sala 1', unitId: unit },
        { hubResourceId: null, resourceLabel: 'Sala 1', unitId: unit },
      ),
    ).toBe(true);
  });

  it('ignora recurso já liberado', () => {
    expect(
      isResourceScheduleConflict(
        { hubResourceId: 'r1', resourceLabel: 'Banheira 1', unitId: unit },
        {
          hubResourceId: 'r1',
          resourceLabel: 'Banheira 1',
          unitId: unit,
          releasedAt: '2026-11-06T12:00:00.000Z',
        },
      ),
    ).toBe(false);
  });

  it('não ocupa quando um dos lados está sem recurso', () => {
    expect(
      isResourceScheduleConflict(
        { hubResourceId: null, resourceLabel: null, unitId: unit },
        { hubResourceId: 'r1', resourceLabel: 'Banheira 1', unitId: unit },
      ),
    ).toBe(false);
  });
});
