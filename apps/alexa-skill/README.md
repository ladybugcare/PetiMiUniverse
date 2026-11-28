# PetMi Voice — Alexa Skill (POC)

Modelo de interação e manifesto da Custom Skill **PetMi Voice** (locale `pt-BR`).

## Invocação

- Nome: `pet mi`
- Invocation name: `assistente petimi` (evita confusão ASR com “patinete”).
- Exemplos: “Alexa, abra o assistente petimi”, “Alexa, diga ao assistente petimi que a Mel está pronta”

## Endpoint

`POST https://<api-staging>/api/integrations/alexa`

Configurar no Alexa Developer Console (ou via ASK CLI) apontando para a API de staging.

## Variáveis no Railway (staging)

- `PETMI_VOICE_ENABLED=true`
- `ALEXA_SKILL_ID=amzn1.ask.skill....`
- `ALEXA_VOICE_ALLOWLIST=[{"alexaUserId":"...","clinicId":"...","unitId":"...","actorUserId":"..."}]`

## Deploy do modelo

Opção A — colar `interactionModels/custom/pt-BR.json` no console (Build → Interaction Model → JSON Editor).

Opção B — ASK CLI:

```bash
ask deploy
```

(requer `ask-cli` autenticado e skill já criada; atualize o `skill.json` com o skillId real.)
