# PetiMiUniverse — Arquitetura multi-produto

Este diretório documenta a estratégia oficial para evoluir o monorepo **PetiMiUniverse** de um produto principal (PetMi Vet / staffing) para um **ecossistema modular** (Hub, Vet/Match, Marketplace, PetMi ID, Admin), sem microserviços prematuros.

## Documentos

| Documento | Conteúdo |
|-----------|----------|
| [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md) | Fronteiras entre platform, hub, vet-match, marketplace, petmi-id e admin |
| [HUB_DOMAIN_MODEL.md](./HUB_DOMAIN_MODEL.md) | Modelo inicial de domínio do PetMi Hub (organização, unidades, staff, tutores, pets, agenda, atendimentos, timeline) |
| [HUB_GUARDIAN_CRM_VISION.md](./HUB_GUARDIAN_CRM_VISION.md) | Visão temática: tutores como CRM + família do pet + fases de entrega (complemento ao domain model) |
| [PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md) | Permissões granulares por produto/módulo e migração a partir de roles atuais |
| [FRONTEND_MODULARIZATION.md](./FRONTEND_MODULARIZATION.md) | Plano incremental de reorganização do frontend por produto |
| [BACKEND_MODULARIZATION.md](./BACKEND_MODULARIZATION.md) | Plano incremental de reorganização do backend por módulos de domínio |
| [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md) | Fase 1 Hub — épicos, ordem de entrega e critérios de aceite |
| [HUB_BRANDING.md](./HUB_BRANDING.md) | Logo e paleta próprios do PetMi Hub (separados do PetMi Vet) |
| [HUB_EPIC1_MANUAL_QA.md](./HUB_EPIC1_MANUAL_QA.md) | Checklist de QA manual do Epic 1 (tutores / `hub_guardians`) |
| [HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md](./HUB_SIGNUP_FIRST_ADMIN_AND_UNIT.md) | **Backlog:** visão de cadastro no Hub — pessoa como admin, depois primeira unidade (vs. signup Vet centrado na empresa) |
| [HUB_QUOTES_AND_PROSPECTS.md](./HUB_QUOTES_AND_PROSPECTS.md) | Orçamentos e contatos (prospects) sem «falso cliente»; API `/api/hub/prospects` e `/api/hub/quotes` + UI Hub em `/hub/orcamentos` |
| [HUB_FINANCIAL_MODEL.md](./HUB_FINANCIAL_MODEL.md) | Modelo financeiro Hub: recebíveis, fluxo único «Gerar cobrança», sem cobrança, orçamentos, caixa, evolução (Payment Intent, comissões) |
| [HUB_FINANCIAL_IMPLEMENTATION_PLAN.md](./HUB_FINANCIAL_IMPLEMENTATION_PLAN.md) | Plano por fases (Fase 1–4) e checklist de entrega do módulo Financeiro e Caixa |
| [HUB_GROOMING_OPERATIONAL_PLAN.md](./HUB_GROOMING_OPERATIONAL_PLAN.md) | Plano em fases da tela operacional Banho & Tosa (Fases 0–3 concluídas) |
| [HUB_BOARDING_OPERATIONAL_PLAN.md](./HUB_BOARDING_OPERATIONAL_PLAN.md) | **MVP:** plano em fases da tela operacional Hotel & Creche |
| [HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md](./HUB_PICKUP_DELIVERY_OPERATIONAL_PLAN.md) | **MVP:** plano em fases da tela operacional Leva e Traz |
| [HUB_COMMUNICATION_WHATSAPP_PLAN.md](./HUB_COMMUNICATION_WHATSAPP_PLAN.md) | **MVP:** comunicação com o tutor via WhatsApp click-to-chat (`wa.me`, sem custo) + in-app |
| [HUB_MVP_MANUAL_QA.md](./HUB_MVP_MANUAL_QA.md) | Cenários de QA manual passo a passo do MVP (multi-tenant, permissões, fluxos core, financeiro) |
| [HUB_AUTOMATED_TESTING_PLAN.md](./HUB_AUTOMATED_TESTING_PLAN.md) | Plano de testes automatizados (financeiro e atendimento) |

## Princípios

1. **Modular monolith**: um API e um Postgres (Supabase) no curto/médio prazo; fronteiras fortes em código, schema e eventos.
2. **Platform core primeiro**: identidade, RBAC, organizações/unidades, notificações, billing base e PetMi ID como camadas compartilhadas.
3. **Hub como SO do negócio pet**: agenda, pets/tutores, atendimento e operação multi-unidade antes de módulos profundos (clínica avançada, AI).
4. **Entitlements por organização**: módulos comerciais (Clinic, Grooming, Hotel, Staffing, CRM, BI) ativados por assinatura/feature flag.

## Relação com o código atual

- Backend: `backend/src/` (Express + TypeScript + Supabase).
- Frontend web: `frontend/src/` (CRA + React Router).
- Migrações SQL: `backend/database_migrations/` (`petimi_vet/`, `petimi_hub/`) e `supabase/migrations/`.

Documentos operacionais existentes (multi-unidade, demandas, marketplace) permanecem em `docs/` na raiz; este subdiretório é a **fonte de verdade** para evolução multi-produto.
