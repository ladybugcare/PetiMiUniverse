# PetMi Voice POC — configurar Alexa (staging)

Endpoint da API: `https://backend-staging-334260f3.up.railway.app/api/integrations/alexa`

## 1. Criar a Skill

1. Acesse [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Login com a conta Amazon que vai testar (a mesma do Echo, se possível).
3. **Create Skill** → nome `PetMi Voice` → idioma **Portuguese (BR)** → tipo **Custom** → modelo **Start from Scratch** → hospedagem **Provision your own**.
4. Em **Endpoint** → HTTPS → Default Region:
   - URL: `https://backend-staging-334260f3.up.railway.app/api/integrations/alexa` (sem barra no final)
   - SSL Certificate: **I will upload a self-signed certificate in X.509 format**
   - Cole o PEM de [`apps/alexa-skill/railway-staging-fullchain.pem`](../../apps/alexa-skill/railway-staging-fullchain.pem) (4 certificados).  
     Motivo: o Railway usa cadeia Let’s Encrypt YE2; com a 1ª/2ª opção a Alexa falha o handshake e mostra “Não foi possível acessar a Skill” (JSON Output vazio, sem log na API).
5. **Save Endpoints**
6. Em **Build → Interaction Model → JSON Editor**, cole o conteúdo de [`apps/alexa-skill/interactionModels/custom/pt-BR.json`](../../apps/alexa-skill/interactionModels/custom/pt-BR.json) e **Save Model** → **Build Model**.
7. Em **Test**, deixe o skill testing em **Development**.

## 2. Obter `ALEXA_SKILL_ID`

1. No console da Skill → canto superior esquerdo, ou **Endpoint** / URL do browser.
2. O ID tem o formato `amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
3. Guarde esse valor.

## 3. Obter `alexaUserId` (conta de teste)

1. No console → aba **Test** → digite `abra o assistente petimi` (ou use o Echo em desenvolvimento).
2. Vá em **Build → Endpoint** ou use o **Device Log / Request** do simulador: no JSON do request, copie  
   `context.System.user.userId`  
   (formato `amzn1.ask.account.…`).
3. Alternativa com Echo: diga “Alexa, abra o assistente petimi” e, nos logs da API staging no Railway, o primeiro request pode ser `unauthorized` — ainda assim o body da Alexa traz o `userId` se você inspecionar o request no console de teste.
4. Atalho confiável: no Test Console, abra **JSON Input/Output** (ícone `{}`) após qualquer invocação e copie `context.System.user.userId`.

## 4. Obter `clinicId` e `unitId` (Hub staging)

1. Abra `https://hub-staging.petmi.app` e entre na clínica de teste (ex.: Família Matilha / seed).
2. No DevTools do browser (F12) → **Network** → filtre por `session/context` ou `day-board`.
3. Em qualquer chamada autenticada `/api/hub/...`, o body/query traz `clinic_id`.
4. `unit_id`: na mesma sessão, use o seletor de unidade ou a query `unit_id` do day-board de banho e tosa.
5. Alternativa SQL (Supabase staging):

```sql
select c.id as clinic_id, u.id as unit_id, c.name, u.name as unit_name
from clinics c
join units u on u.clinic_id = c.id
where c.name ilike '%matilha%' -- ajuste o filtro
limit 20;
```

## 5. Obter / criar `actorUserId` (usuário técnico)

Esse UUID é o `auth.users.id` (mesmo id em `clinic_users.user_id`) que vai aparecer como ator dos eventos de voz.

Opção A — reutilizar um usuário da clínica com permissão `grooming.queue.manage`:

```sql
select cu.user_id, cu.role, cu.operational_areas
from clinic_users cu
where cu.clinic_id = '<clinicId>'
  and cu.status = 'active';
```

Opção B — criar usuário técnico no Supabase Auth (staging) e vincular em `clinic_users` com área de banho e tosa / permissão de fila.

Anote o `user_id` como `actorUserId`.

## 6. Variáveis no Railway (serviço `backend`, ambiente `staging`)

```bash
PETMI_VOICE_ENABLED=true
ALEXA_SKILL_ID=amzn1.ask.skill....
ALEXA_VOICE_ALLOWLIST=[{"alexaUserId":"amzn1.ask.account....","clinicId":"<uuid>","unitId":"<uuid>","actorUserId":"<uuid>"}]
```

Após salvar as variáveis, faça um redeploy se o Railway não reiniciar sozinho (ou use o script de deploy por SHA já aplicado).

## 7. Testar

1. Simulador: “abra o assistente petimi” → deve responder o help curto (não “desabilitado” / “não autorizado”).
2. Com um pet na fila (`queued`): “inicie o banho do Thor”.
3. Com pet em atendimento: “a Mel está pronta” → confirme com “sim”.
4. “quem falta atender?”.
5. No Hub staging, o painel de banho e tosa deve refletir o estágio.

## Frases úteis

- “Alexa, abra o assistente petimi”
- “Alexa, diga ao assistente petimi que inicie o banho do Thor”
- “Alexa, diga ao assistente petimi que a Mel está pronta”
- “Alexa, pergunte ao assistente petimi quem falta atender”

## Troubleshooting rápido

| Resposta da Alexa | Causa provável |
|---|---|
| PetMi Voice está desabilitado | `PETMI_VOICE_ENABLED` ≠ `true` |
| Dispositivo não autorizado | `alexaUserId` fora da allowlist |
| Skill não autorizada | `ALEXA_SKILL_ID` diferente do skill em uso |
| Não encontrei o pet | nome diferente / outra unidade / pet não está em `queued`–`ready` |
| Mesa ocupada… escolha pelo Hub | recurso obrigatório no início; use a UI |

## O que não fazer nesta POC

- Não ligar em produção.
- Não compartilhar allowlist com contas pessoais não autorizadas.
- Não usar voz para check-out, pagamento ou medicação.
