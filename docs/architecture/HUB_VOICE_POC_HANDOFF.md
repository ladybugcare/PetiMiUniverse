# Handoff — PetMi Voice POC (Alexa)

**Objetivo desta fatia:** núcleo de comandos + webhook Alexa + 4 intenções de banho e tosa, sem migrations.

**Decisões travadas:** estágios reais (`queued` → `in_service` → `ready`); allowlist em env; confirmação nativa Alexa; sem account linking / tabelas novas.

**Branch / SHA:** `staging` @ `08962afe` — API staging deploy SUCCESS + health OK.

**Setup:** passo a passo em [`HUB_VOICE_POC_SETUP.md`](HUB_VOICE_POC_SETUP.md).

**Pendências manuais:**
1. Railway: `PETMI_VOICE_ENABLED`, `ALEXA_SKILL_ID`, `ALEXA_VOICE_ALLOWLIST`.
2. Criar Skill no Alexa Developer Console + colar modelo `apps/alexa-skill/`.
3. Usuário técnico com `grooming.queue.manage` (actorUserId).

**Não fazer agora:** account linking, `hub_voice_connections`, botão de voz no Hub, produção.
