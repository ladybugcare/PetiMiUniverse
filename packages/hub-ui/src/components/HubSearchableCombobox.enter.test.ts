import { describe, expect, it } from 'vitest';
import { resolveComboboxEnterCommit } from './HubSearchableCombobox';

describe('resolveComboboxEnterCommit', () => {
  const opts = [
    { value: 'Amoxicilina', label: 'Amoxicilina' },
    { value: 'Dipirona', label: 'Dipirona' },
  ];

  it('confirma correspondência exata', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'dipirona',
        filtered: opts.filter((o) => o.label.toLowerCase().includes('dip')),
        allowCreate: true,
      }),
    ).toBe('Dipirona');
  });

  it('confirma único resultado filtrado com ≥3 caracteres', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'Amo',
        filtered: [opts[0]!],
        allowCreate: false,
      }),
    ).toBe('Amoxicilina');
  });

  it('não confirma único resultado com query curta', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'Am',
        filtered: [opts[0]!],
        allowCreate: false,
      }),
    ).toBeNull();
  });

  it('não confirma único resultado quando enterCommitsUniqueMatch=false', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'Amo',
        filtered: [opts[0]!],
        allowCreate: false,
        enterCommitsUniqueMatch: false,
      }),
    ).toBeNull();
  });

  it('cria texto livre quando allowCreate e sem match', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'Meloxicam QA',
        filtered: [],
        allowCreate: true,
      }),
    ).toBe('Meloxicam QA');
  });

  it('não cria quando allowCreate=false e lista vazia', () => {
    expect(
      resolveComboboxEnterCommit({
        query: 'Meloxicam QA',
        filtered: [],
        allowCreate: false,
      }),
    ).toBeNull();
  });

  it('ignora query vazia', () => {
    expect(
      resolveComboboxEnterCommit({
        query: '   ',
        filtered: opts,
        allowCreate: true,
      }),
    ).toBeNull();
  });
});
