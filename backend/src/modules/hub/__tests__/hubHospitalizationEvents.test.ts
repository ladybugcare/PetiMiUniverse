import { resolveHospitalizationEventsId } from '../hospitalizationRequestIds';

describe('resolveHospitalizationEventsId', () => {
  const id = 'bd755eb3-32a4-498e-8a6e-fde9d1878600';

  it('usa req.params.id sem exigir query hospitalization_id', () => {
    expect(resolveHospitalizationEventsId(id, undefined)).toBe(id);
  });

  it('aceita query hospitalization_id por compatibilidade', () => {
    expect(resolveHospitalizationEventsId(undefined, id)).toBe(id);
  });

  it('prefere o id da rota quando ambos existem', () => {
    expect(resolveHospitalizationEventsId(id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(id);
  });

  it('retorna null sem id válido', () => {
    expect(resolveHospitalizationEventsId(undefined, undefined)).toBeNull();
    expect(resolveHospitalizationEventsId('nao-uuid', 'tambem-nao')).toBeNull();
  });
});
