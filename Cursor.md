# Cursor — guidelines for AI-assisted coding

Behavioral guidelines to reduce common LLM coding mistakes. **Tradeoff:** these bias toward caution over speed. For trivial tasks, use judgment.

---

## PetiMiUniverse (project context)

Use this when choosing where to change code or which docs to trust.

- **Monorepo:** backend (`backend/` — Express + TypeScript + Supabase), universal app (`frontend/` — Expo/React Native), Hub web (`apps/hub-web/` — Vite + React), shared packages (`packages/web-core`, `packages/hub-ui`).
- **Idioma PetiMi:** português do Brasil (**pt-BR**) — vocabulário, ortografia e convenções brasileiras em textos de produto (UI, erros, e-mails, notificações, documentação voltada ao usuário). **Não** usar português de Portugal (pt-PT).
- **Architecture & product boundaries:** [`docs/architecture/README.md`](docs/architecture/README.md) is the source of truth for multi-product evolution (Hub, Vet-Match, Marketplace, PetMi ID, modular monolith).
- **SQL migrations:** `backend/database_migrations/` (`petimi_vet/`, `petimi_hub/`) and `supabase/migrations/` — keep schema changes consistent with existing migration style and naming.
- **Secrets:** do not commit `.env*`, credentials, or staging keys. If the user asks to commit, warn on sensitive files.
- **Git / PRs:** create commits or open PRs only when the user explicitly asks. Prefer small, reviewable changes that match the request.

When Hub vs Vet behavior differs, check architecture docs before assuming a single “app” model.

---

## 1. Think before coding

Do not assume. Do not hide confusion. Surface tradeoffs.

**Before implementing:**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

---

## 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” or “configurability” that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: “Would a senior engineer say this is overcomplicated?” If yes, simplify.

---

## 3. Surgical changes

Touch only what you must. Clean up only your own mess.

**When editing existing code:**

- Do not “improve” adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it — do not delete it unless asked.

**When your changes create orphans:**

- Remove imports, variables, and functions that **your** changes made unused.
- Do not remove pre-existing dead code unless asked.

**The test:** every changed line should trace directly to the user’s request.

---

## 4. Goal-driven execution

Define success criteria. Loop until verified.

**Transform tasks into verifiable goals:**

- “Add validation” → write tests for invalid inputs, then make them pass (or an equivalent manual verification the user accepts).
- “Fix the bug” → reproduce (test or steps), then fix and verify.
- “Refactor X” → ensure tests pass before and after (or same manual checks).

**For multi-step tasks, state a brief plan:**

1. [Step] → verify: [check]  
2. [Step] → verify: [check]  
3. [Step] → verify: [check]

Strong success criteria allow independent iteration. Weak criteria (“make it work”) require constant clarification.

---

## How you know these guidelines are working

- Fewer unnecessary changes in diffs.
- Fewer rewrites due to overcomplication.
- Clarifying questions come **before** implementation rather than after mistakes.
