import { filterServicesByClinicalGroup } from './clinicalServiceCatalog';

describe('filterServicesByClinicalGroup', () => {
  const rows = [
    { id: '1', name: 'OSH', service_group: 'cirurgia', active: true, is_addon: false },
    { id: '2', name: 'Diária UTI', service_group: 'internacao', active: true, is_addon: false },
    { id: '3', name: 'Consulta', service_group: 'clinica', active: true, is_addon: false },
    { id: '4', name: 'Addon cirúrgico', service_group: 'cirurgia', active: true, is_addon: true },
    { id: '5', name: 'Inativo', service_group: 'cirurgia', active: false, is_addon: false },
  ];

  it('filtra só cirurgia ativos não-addon', () => {
    expect(filterServicesByClinicalGroup(rows, 'cirurgia').map((r) => r.id)).toEqual(['1']);
  });

  it('filtra internação', () => {
    expect(filterServicesByClinicalGroup(rows, 'internacao').map((r) => r.id)).toEqual(['2']);
  });

  it('filtra clínica', () => {
    expect(filterServicesByClinicalGroup(rows, 'clinica').map((r) => r.id)).toEqual(['3']);
  });
});
