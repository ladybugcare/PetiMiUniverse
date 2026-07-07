# Documentos clínicos validáveis — Exames e Encaminhamentos

## Visão geral

Dois módulos seguem o padrão da receita validável (RX):

| Módulo | Código | Rota pública | Migration |
|--------|--------|--------------|-----------|
| Solicitação de exames | `EX-XXXX-XXXX` | `/solicitacao-exame/:token` | 63–64 |
| Encaminhamento a especialista | `RF-XXXX-XXXX` | `/encaminhamento/:token` | 65–66 |

Configuração de validade e templates WhatsApp: migration **67**.

## Operação na clínica

1. Durante ou após o atendimento, registre itens no workspace (Exames / Encaminhamentos).
2. **Gerar PDF e link validável** — emissão consolidada (todos os itens ativos do atendimento).
3. Menu por item — **Emitir só este item** (escopo `single`).
4. Envie ao tutor via **WhatsApp** (click-to-chat) ou copie o link.
5. Após emissão, itens incluídos ficam congelados até revogação do documento.

## Pós-atendimento

Com encounter `completed`, a edição clínica fica read-only, mas **emitir, reenviar e revogar documentos** permanece liberado no workspace e no caso clínico.

## Auditoria

Eventos em `hub_clinical_exam_order_document_events` e `hub_clinical_specialist_referral_document_events`:

- `created`, `viewed`, `pdf_downloaded`, `revoked`, `whatsapp_opened` (frontend registra tentativa via `hub_message_logs` no clique WhatsApp)

## Disclaimers

Documentos são de **autenticidade PetMi Hub** — não substituem guias oficiais de convênios/labs nem documentos regulatórios específicos.

## Migrations (ordem)

Execute após o núcleo clínico e receita (58–62):

1. `063_alter_hub_clinical_exams_referral.sql`
2. `064_create_hub_clinical_exam_order_documents.sql`
3. `065_create_hub_clinical_specialist_referrals.sql`
4. `066_create_hub_clinical_specialist_referral_documents.sql`
5. `067_alter_hub_clinic_settings_exam_referral_templates.sql`
