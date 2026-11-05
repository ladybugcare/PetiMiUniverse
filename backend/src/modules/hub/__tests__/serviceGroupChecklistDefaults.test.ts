import {
  resolveSessionChecklistTemplate,
  unionChecklistTemplateItems,
} from '../serviceGroupChecklistDefaults';

describe('unionChecklistTemplateItems', () => {
  it('deduplica por key e preserva a primeira label', () => {
    expect(
      unionChecklistTemplateItems([
        [{ key: 'nails', label: 'Unhas' }],
        [
          { key: 'nails', label: 'Unhas (outra)' },
          { key: 'ears', label: 'Ouvidos' },
        ],
      ]),
    ).toEqual([
      { key: 'nails', label: 'Unhas' },
      { key: 'ears', label: 'Ouvidos' },
    ]);
  });
});

describe('resolveSessionChecklistTemplate', () => {
  const group = [
    { key: 'nails', label: 'Unhas' },
    { key: 'ears', label: 'Ouvidos' },
  ];

  it('sem tipos associados usa o template do grupo', () => {
    expect(resolveSessionChecklistTemplate({ groupTemplate: group, serviceTypeOverrides: [] })).toEqual(
      group,
    );
  });

  it('null herda o grupo; array personaliza', () => {
    expect(
      resolveSessionChecklistTemplate({
        groupTemplate: group,
        serviceTypeOverrides: [null, [{ key: 'tosa_finish', label: 'Finalização de tosa' }]],
      }),
    ).toEqual([
      { key: 'nails', label: 'Unhas' },
      { key: 'ears', label: 'Ouvidos' },
      { key: 'tosa_finish', label: 'Finalização de tosa' },
    ]);
  });

  it('array vazio no tipo remove itens (override explícito)', () => {
    expect(
      resolveSessionChecklistTemplate({
        groupTemplate: group,
        serviceTypeOverrides: [[]],
      }),
    ).toEqual([]);
  });
});
