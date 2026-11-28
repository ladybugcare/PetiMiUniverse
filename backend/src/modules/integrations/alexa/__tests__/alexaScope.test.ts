import {
  isPetmiVoiceEnabled,
  parseAlexaVoiceAllowlist,
  resolveAlexaScope,
} from '../alexaScope';

describe('isPetmiVoiceEnabled', () => {
  it('padrão é desabilitado', () => {
    expect(isPetmiVoiceEnabled({})).toBe(false);
    expect(isPetmiVoiceEnabled({ PETMI_VOICE_ENABLED: 'false' })).toBe(false);
  });

  it('habilita somente com true', () => {
    expect(isPetmiVoiceEnabled({ PETMI_VOICE_ENABLED: 'true' })).toBe(true);
    expect(isPetmiVoiceEnabled({ PETMI_VOICE_ENABLED: 'TRUE' })).toBe(true);
  });
});

describe('parseAlexaVoiceAllowlist', () => {
  it('aceita array vazio / ausente', () => {
    expect(parseAlexaVoiceAllowlist(undefined)).toEqual({ ok: true, entries: [] });
    expect(parseAlexaVoiceAllowlist('[]')).toEqual({ ok: true, entries: [] });
  });

  it('parseia entradas válidas', () => {
    const raw = JSON.stringify([
      {
        alexaUserId: 'amzn1.ask.account.ABC',
        clinicId: '11111111-1111-1111-1111-111111111111',
        unitId: '22222222-2222-2222-2222-222222222222',
        actorUserId: '33333333-3333-3333-3333-333333333333',
      },
    ]);
    const parsed = parseAlexaVoiceAllowlist(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.entries).toHaveLength(1);
  });

  it('rejeita JSON inválido', () => {
    expect(parseAlexaVoiceAllowlist('{not-json').ok).toBe(false);
  });
});

describe('resolveAlexaScope', () => {
  const entry = {
    alexaUserId: 'amzn1.ask.account.ABC',
    clinicId: 'clinic-1',
    unitId: 'unit-1',
    actorUserId: 'user-1',
  };

  it('retorna disabled quando kill switch off', () => {
    const result = resolveAlexaScope(entry.alexaUserId, {
      PETMI_VOICE_ENABLED: 'false',
      ALEXA_VOICE_ALLOWLIST: JSON.stringify([entry]),
    });
    expect(result).toEqual({ ok: false, reason: 'disabled' });
  });

  it('retorna unauthorized para userId desconhecido', () => {
    const result = resolveAlexaScope('amzn1.ask.account.OTHER', {
      PETMI_VOICE_ENABLED: 'true',
      ALEXA_VOICE_ALLOWLIST: JSON.stringify([entry]),
    });
    expect(result).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('resolve escopo para userId na allowlist', () => {
    const result = resolveAlexaScope(entry.alexaUserId, {
      PETMI_VOICE_ENABLED: 'true',
      ALEXA_VOICE_ALLOWLIST: JSON.stringify([entry]),
    });
    expect(result).toEqual({ ok: true, entry });
  });

  it('retorna misconfigured se allowlist quebrada', () => {
    const result = resolveAlexaScope(entry.alexaUserId, {
      PETMI_VOICE_ENABLED: 'true',
      ALEXA_VOICE_ALLOWLIST: '{bad',
    });
    expect(result).toEqual({ ok: false, reason: 'misconfigured' });
  });
});
