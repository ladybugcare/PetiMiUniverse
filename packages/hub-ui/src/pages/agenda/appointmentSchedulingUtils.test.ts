import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  applyExtraBlockAutoFields,
  buildBlockHeaderSubtitle,
  buildBlockTitleFromServices,
  buildServiceDescriptionBullets,
  createEmptyExtraBlock,
  resolveServiceEndsAt,
  toEndIsoTs,
  type ExtraBlock,
} from './appointmentSchedulingUtils';

describe('buildBlockTitleFromServices', () => {
  it('junta serviços e pet', () => {
    expect(buildBlockTitleFromServices(['Banho', 'Tosa'], 'Luna')).toBe('Banho + Tosa — Luna');
  });

  it('retorna só serviços sem pet', () => {
    expect(buildBlockTitleFromServices(['Banho'], '')).toBe('Banho');
  });

  it('retorna só pet sem serviços', () => {
    expect(buildBlockTitleFromServices([], 'Luna')).toBe('Luna');
  });

  it('retorna vazio sem serviços nem pet', () => {
    expect(buildBlockTitleFromServices([], null)).toBe('');
  });
});

describe('buildServiceDescriptionBullets', () => {
  const types = [
    { id: 'a', description: 'Lava e seca' },
    { id: 'b', description: 'Corte higiênico' },
    { id: 'c', description: '  ' },
  ];

  it('monta bullets na ordem dos serviços', () => {
    expect(buildServiceDescriptionBullets(types, ['b', 'a'])).toBe('- Corte higiênico\n- Lava e seca');
  });

  it('ignora descrições vazias e ids duplicados', () => {
    expect(buildServiceDescriptionBullets(types, ['a', 'a', 'c'])).toBe('- Lava e seca');
  });
});

describe('buildBlockHeaderSubtitle', () => {
  it('monta horário, duração e serviços', () => {
    expect(
      buildBlockHeaderSubtitle({
        startsHm: '10:00',
        endsHm: '11:30',
        durationMin: 90,
        serviceNames: ['Banho', 'Tosa'],
      }),
    ).toBe('10:00–11:30 · 90 min · Banho + Tosa');
  });

  it('aceita só início (encaixe)', () => {
    expect(
      buildBlockHeaderSubtitle({
        startsHm: 'agora',
        endsHm: '',
        durationMin: 60,
        serviceNames: ['Consulta'],
      }),
    ).toBe('agora · 60 min · Consulta');
  });

  it('trunca lista longa de serviços', () => {
    expect(
      buildBlockHeaderSubtitle({
        startsHm: '09:00',
        endsHm: '12:00',
        durationMin: 180,
        serviceNames: ['A', 'B', 'C', 'D'],
        maxServiceNames: 2,
      }),
    ).toBe('09:00–12:00 · 180 min · A + B +2');
  });
});

describe('applyExtraBlockAutoFields', () => {
  const base = (): ExtraBlock => ({
    ...createEmptyExtraBlock({
      groupFilter: 'all',
      startsHm: '11:00',
      staffId: '',
      resourceLabel: '',
    }),
    services: [
      { hub_service_type_id: 'a', name: 'Banho', duration_minutes: 45 },
      { hub_service_type_id: 'b', name: 'Tosa', duration_minutes: 30 },
    ],
  });

  const types = [
    { id: 'a', description: 'Lava e seca' },
    { id: 'b', description: 'Corte' },
  ];

  it('preenche título, descrição e fim automaticamente', () => {
    const next = applyExtraBlockAutoFields(base(), types, 'Luna');
    expect(next.block_title).toBe('Banho + Tosa — Luna');
    expect(next.block_description).toBe('- Lava e seca\n- Corte');
    expect(next.ends_hm).toBe(addMinutes('11:00', 75));
  });

  it('respeita edição manual de título e descrição', () => {
    const block = {
      ...base(),
      block_title: 'Custom',
      block_title_user_edited: true,
      block_description: 'Nota manual',
      block_description_user_edited: true,
      ends_hm: '15:00',
    };
    const next = applyExtraBlockAutoFields(block, types, 'Luna', { recalcEnds: false });
    expect(next.block_title).toBe('Custom');
    expect(next.block_description).toBe('Nota manual');
    expect(next.ends_hm).toBe('15:00');
  });
});


describe('resolveServiceEndsAt', () => {
  it('corrige fim obsoleto (16:00 com ends 10:00) para duração de 60 min no mesmo dia', () => {
    const iso = resolveServiceEndsAt({
      dateYmd: '2026-11-22',
      startsHm: '16:00',
      endsHm: '10:00',
      durationMin: 60,
      allowOvernight: false,
    });
    // 17:00 BRT = 20:00 UTC (America/Sao_Paulo, sem DST em nov/2026)
    expect(iso).toBe(toEndIsoTs('2026-11-22', '16:00', '17:00'));
    expect(iso.slice(0, 10)).toBe(new Date(iso).toISOString().slice(0, 10));
  });

  it('preserva overnight quando allowOvernight=true (Hotel / fim manual)', () => {
    const iso = resolveServiceEndsAt({
      dateYmd: '2026-11-22',
      startsHm: '16:00',
      endsHm: '10:00',
      durationMin: 60,
      allowOvernight: true,
    });
    expect(iso).toBe(toEndIsoTs('2026-11-22', '16:00', '10:00'));
    expect(new Date(iso).getUTCDate()).toBe(23);
  });

  it('mantém cruzamento legítimo de meia-noite via duração (23:00 + 60 min)', () => {
    const iso = resolveServiceEndsAt({
      dateYmd: '2026-11-22',
      startsHm: '23:00',
      endsHm: '10:00', // obsoleto
      durationMin: 60,
      allowOvernight: false,
    });
    expect(iso).toBe(toEndIsoTs('2026-11-22', '23:00', addMinutes('23:00', 60)));
    expect(iso).toBe(toEndIsoTs('2026-11-22', '23:00', '00:00'));
  });

  it('não altera fim já coerente no mesmo dia', () => {
    const iso = resolveServiceEndsAt({
      dateYmd: '2026-11-22',
      startsHm: '16:00',
      endsHm: '17:00',
      durationMin: 60,
      allowOvernight: false,
    });
    expect(iso).toBe(toEndIsoTs('2026-11-22', '16:00', '17:00'));
  });
});
