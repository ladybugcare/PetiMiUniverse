# PetMi Shift — SQL migrations

Arquivos `.sql` do produto **PetMi Shift** (demandas, unidades, auth legado, suporte, etc.), mais diagnósticos e o bootstrap “all-in-one” para novo projeto Supabase.

- **Bootstrap monolítico:** `BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql` (regenerar com `./scripts/generate-bootstrap-all-in-one.sh` na raiz do repo).
- **Ordem sugerida para novo ambiente:** `./scripts/bootstrap-new-supabase.sh`

## Suporte (tickets)

A fila de suporte PetiMi é compartilhada entre Shift e Hub (`support_tickets`, `ticket_messages`, `ticket_evaluations`). Ordem:

1. `create_support_tickets_table.sql`
2. `add_user_read_to_support_tickets.sql`
3. `add_conversation_and_evaluation.sql`
4. `update_support_tickets_allow_admin.sql`
5. `update_support_tickets_for_freelancers.sql`
6. `update_support_tickets_allow_public.sql`
7. `fix_message_constraint.sql`
8. **`add_product_to_support_tickets.sql`** — colunas `product` (`hub` | `shift`, padrão `shift`) e `clinic_id` (clínica do usuário Hub). É idempotente e também garante as colunas/tabelas dos itens 3, 5 e 6 (útil em bases que pularam alguma delas); termina com `NOTIFY pgrst, 'reload schema'`.

Hub (PetMi Hub) está em [`../petimi_hub/`](../petimi_hub/README.md).

Documentação índice: [`../README.md`](../README.md).
