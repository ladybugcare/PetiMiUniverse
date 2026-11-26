# Relatórios Hub — PDF residual (cliente)

## Estado

`POST /api/hub/reports/export-pdf` exige:

1. `report_id` válido (contrato)
2. Autorização completa (`authorizeHubReport`: domínio, unidade, self, audiência)
3. Dados:

| Conjunto | Comportamento |
|----------|----------------|
| `SERVER_SIDE_PDF_REPORT_IDS` | Tabela montada no servidor a partir dos serviços de consulta |
| `CLIENT_CONTROLLED_PDF_REPORT_IDS` | Após auth, aceita `headers`/`rows` enviados pelo cliente (já carregados via API do relatório) |

Validar só o `report_id` **não** basta: a auth completa é obrigatória; o residual documenta risco de o cliente alterar números **de um relatório que já pode ver**.

## Objetivo

Esvaziar `CLIENT_CONTROLLED_PDF_REPORT_IDS` migrando cada `report_id` para geração server-side (reuso dos handlers/serviços existentes). O teste de contrato falha se o conjunto residual crescer sem revisão.

## Cron / e-mail

Envio SMTP ainda não há no repositório. `authorizeReportScheduleExecution` deve ser chamado pelo job futuro; run manual já revalida e suspende se o proprietário perder acesso.
