export type AlexaVoiceAllowlistEntry = {
  alexaUserId: string;
  clinicId: string;
  unitId: string;
  actorUserId: string;
};

export type AlexaScopeResolution =
  | { ok: true; entry: AlexaVoiceAllowlistEntry }
  | { ok: false; reason: 'disabled' | 'unauthorized' | 'misconfigured' };

/** Kill switch global. Padrão: desabilitado. */
export function isPetmiVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.PETMI_VOICE_ENABLED ?? '').toLowerCase() === 'true';
}

export function parseAlexaVoiceAllowlist(
  raw: string | undefined,
): { ok: true; entries: AlexaVoiceAllowlistEntry[] } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, entries: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'ALEXA_VOICE_ALLOWLIST deve ser um array JSON' };
    }
    const entries: AlexaVoiceAllowlistEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        return { ok: false, error: 'Entrada inválida na allowlist' };
      }
      const row = item as Record<string, unknown>;
      const alexaUserId = typeof row.alexaUserId === 'string' ? row.alexaUserId.trim() : '';
      const clinicId = typeof row.clinicId === 'string' ? row.clinicId.trim() : '';
      const unitId = typeof row.unitId === 'string' ? row.unitId.trim() : '';
      const actorUserId = typeof row.actorUserId === 'string' ? row.actorUserId.trim() : '';
      if (!alexaUserId || !clinicId || !unitId || !actorUserId) {
        return {
          ok: false,
          error: 'Cada entrada precisa de alexaUserId, clinicId, unitId e actorUserId',
        };
      }
      entries.push({ alexaUserId, clinicId, unitId, actorUserId });
    }
    return { ok: true, entries };
  } catch {
    return { ok: false, error: 'ALEXA_VOICE_ALLOWLIST JSON inválido' };
  }
}

export function resolveAlexaScope(
  alexaUserId: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): AlexaScopeResolution {
  if (!isPetmiVoiceEnabled(env)) {
    return { ok: false, reason: 'disabled' };
  }
  const parsed = parseAlexaVoiceAllowlist(env.ALEXA_VOICE_ALLOWLIST);
  if (!parsed.ok) {
    console.error('[alexa] allowlist misconfigured:', parsed.error);
    return { ok: false, reason: 'misconfigured' };
  }
  const userId = (alexaUserId ?? '').trim();
  if (!userId) return { ok: false, reason: 'unauthorized' };
  const entry = parsed.entries.find((e) => e.alexaUserId === userId);
  if (!entry) return { ok: false, reason: 'unauthorized' };
  return { ok: true, entry };
}

export function expectedAlexaSkillId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = (env.ALEXA_SKILL_ID ?? '').trim();
  return id || null;
}
