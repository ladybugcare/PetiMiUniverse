# Handoff — PetMi Voice POC (Alexa)

**Objetivo desta fatia:** núcleo de comandos + webhook Alexa + 4 intenções de banho e tosa, sem migrations.

**Decisões travadas:** estágios reais (`queued` → `in_service` → `ready`); allowlist em env; confirmação nativa Alexa; sem account linking / tabelas novas.

**Branch:** `staging` (trabalho local nesta fatia). SHA: confirmar após commit.

**Testes já rodados (PASS):** `groomingSessionService`, `voiceCommandService`, `alexaScope`, `groomingExecution`, `receptionCustody`. (`hubGroomingOpenPresence` é Vitest legado — fora do Jest.)

**Pendências (próximo chat — não misturar nesta fatia):**
1. Commit + `./scripts/hub-git-staging.sh push` e `./scripts/hub-staging-api-deploy.sh deploy <sha>`.
2. Railway: `PETMI_VOICE_ENABLED=true`, `ALEXA_SKILL_ID`, `ALEXA_VOICE_ALLOWLIST` (userId Alexa → clinic/unit/actor).
3. Criar Skill no Alexa Developer Console; endpoint `…/api/integrations/alexa`; colar modelo em `apps/alexa-skill/`.
4. Usuário técnico em `clinic_users` com `grooming.queue.manage` (actorUserId da allowlist).

**Não fazer agora:** account linking, `hub_voice_connections`, botão de voz no Hub, E2E Playwright completo, produção.
