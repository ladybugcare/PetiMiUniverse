-- Action Engine / ChatGPT MCP: conexões OAuth, códigos, refresh, confirmações e idempotência.
-- Executar depois do item 182.

CREATE TABLE IF NOT EXISTS public.hub_assistant_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  unit_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('chatgpt', 'alexa', 'external_integration')),
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS hub_assistant_connections_user_idx
  ON public.hub_assistant_connections (user_id, status);
CREATE INDEX IF NOT EXISTS hub_assistant_connections_clinic_idx
  ON public.hub_assistant_connections (clinic_id, status);

CREATE TABLE IF NOT EXISTS public.hub_assistant_oauth_codes (
  code text PRIMARY KEY,
  connection_id uuid NULL REFERENCES public.hub_assistant_connections(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  resource text NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hub_assistant_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  connection_id uuid NOT NULL REFERENCES public.hub_assistant_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_assistant_refresh_tokens_connection_idx
  ON public.hub_assistant_refresh_tokens (connection_id);

CREATE TABLE IF NOT EXISTS public.hub_action_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  action_id text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS hub_action_confirmations_user_idx
  ON public.hub_action_confirmations (user_id, status);

CREATE TABLE IF NOT EXISTS public.hub_action_idempotency_keys (
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  action_id text NOT NULL,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clinic_id, action_id, idempotency_key)
);

COMMENT ON TABLE public.hub_assistant_connections IS 'Account linking PetMi ↔ assistentes (ChatGPT MCP, etc.)';
COMMENT ON TABLE public.hub_action_confirmations IS 'Desafios server-side para ações sensíveis da Action Engine';
