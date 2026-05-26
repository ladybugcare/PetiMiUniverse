-- =============================================================================
-- PetMi Vet — bootstrap completo para NOVO projeto Supabase (banco vazio)
-- Execute no Dashboard: SQL Editor → colar este ficheiro → Run
-- Ordem: igual a scripts/bootstrap-new-supabase.sh
--
-- Regenerar este ficheiro: ./scripts/generate-bootstrap-all-in-one.sh
-- Se der timeout no Run, execute secção a secção (marcadores -- FICHEIRO:).
-- =============================================================================


-- =============================================================================
-- FICHEIRO: supabase/migrations/petivet_prod_structure.sql
-- =============================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."clinic_user_role" AS ENUM (
    'CADMIN',
    'CMANAGER',
    'CSTAFF',
    'CRECEPTION',
    'CBATH',
    'CAUXILIARY',
    'CMARKETING'
);


ALTER TYPE "public"."clinic_user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_time_conflict"("p_vet_id" "uuid", "p_demand_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) RETURNS TABLE("conflicting_application_id" "uuid", "conflicting_demand_title" "text", "conflicting_date" "date", "conflicting_start_time" time without time zone, "conflicting_end_time" time without time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id as conflicting_application_id,
    d.title as conflicting_demand_title,
    d.demand_date as conflicting_date,
    d.start_time as conflicting_start_time,
    d.end_time as conflicting_end_time
  FROM position_applications pa
  JOIN demand_positions dp ON pa.position_id = dp.id
  JOIN demands d ON dp.master_demand_id = d.id
  WHERE pa.vet_id = p_vet_id
    AND pa.status = 'accepted'
    AND d.demand_date = p_demand_date
    AND (d.start_time, d.end_time) OVERLAPS (p_start_time, p_end_time);
END;
$$;


ALTER FUNCTION "public"."check_time_conflict"("p_vet_id" "uuid", "p_demand_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_application_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_master_demand_id uuid;
  v_demand_date date;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Só processa quando status muda para 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    -- Buscar dados da demanda
    SELECT dp.master_demand_id, d.demand_date, d.start_time, d.end_time
    INTO v_master_demand_id, v_demand_date, v_start_time, v_end_time
    FROM demand_positions dp
    JOIN demands d ON d.id = dp.master_demand_id
    WHERE dp.id = NEW.position_id;
    
    -- Inativar outras candidaturas do mesmo veterinário para a mesma posição
    UPDATE position_applications
    SET 
      status = 'inactive_accepted_other_position',
      inactive_reason = 'Veterinário aceitou outra posição para a mesma demanda',
      updated_at = now()
    WHERE vet_id = NEW.vet_id
      AND position_id IN (
        SELECT id FROM demand_positions WHERE master_demand_id = v_master_demand_id
      )
      AND id != NEW.id
      AND status = 'pending';
    
    -- Inativar candidaturas do mesmo veterinário em horários conflitantes
    UPDATE position_applications pa
    SET 
      status = 'inactive_time_conflict',
      inactive_reason = 'Conflito de horário com outra demanda aceita',
      updated_at = now()
    FROM demand_positions dp
    JOIN demands d ON d.id = dp.master_demand_id
    WHERE pa.position_id = dp.id
      AND pa.vet_id = NEW.vet_id
      AND pa.id != NEW.id
      AND pa.status = 'pending'
      AND d.demand_date = v_demand_date
      AND (d.start_time, d.end_time) OVERLAPS (v_start_time, v_end_time);
      
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_application_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
  v_clinic_id UUID;
  v_unit_id UUID;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- If no role, try user_metadata
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Create appropriate record based on role
  IF user_role = 'clinic' THEN
    -- Create clinic record (SEM status se a coluna não existir)
    INSERT INTO public.clinics (
      id,
      name,
      email,
      cnpj,
      phone,
      address,
      city,
      state,
      technical_manager,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_clinic_id;
    
    -- Create main unit for the clinic
    INSERT INTO public.units (
      clinic_id,
      name,
      cnpj,
      address,
      city,
      state,
      phone,
      technical_manager,
      is_main,
      status
    ) VALUES (
      v_clinic_id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome') || ' - Unidade Principal',
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', 'Endereço não cadastrado'),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      true,
      'active'
    )
    RETURNING id INTO v_unit_id;
    
    -- Create CADMIN clinic_user entry for clinic owner
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      unit_id,
      role,
      status,
      accepted_at
    ) VALUES (
      NEW.id,
      v_clinic_id,
      v_unit_id,
      'CADMIN',
      'active',
      NOW()
    );
    
  ELSIF user_role = 'vet' THEN
    -- Create vet record
    INSERT INTO public.vets (
      id,
      name,
      email,
      crmv,
      phone,
      specialties,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'city', 'Cidade não cadastrada'),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue (don't block user creation)
    RAISE WARNING 'Erro em handle_new_user: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := OLD.raw_user_meta_data->>'role';
  
  IF user_role IS NULL THEN
    user_role := OLD.user_metadata->>'role';
  END IF;
  
  -- Soft delete or cascade delete based on role
  IF user_role = 'clinic' THEN
    -- Soft delete clinic (set status to inactive)
    UPDATE public.clinics 
    SET updated_at = NOW()
    WHERE id = OLD.id;
    
  ELSIF user_role = 'vet' THEN
    -- Soft delete vet
    UPDATE public.vets 
    SET updated_at = NOW()
    WHERE id = OLD.id;
  END IF;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."handle_user_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moddatetime"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."moddatetime"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."moddatetime"() IS 'Atualiza automaticamente o campo updated_at antes de um UPDATE.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "demand_id" bigint,
    "vet_id" bigint,
    "status" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "clinic_id" "uuid",
    "unit_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "plan_id" "uuid",
    "start_date" timestamp with time zone DEFAULT "now"(),
    "renewal_date" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."clinic_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "unit_id" "uuid",
    "role" "text" DEFAULT 'CSTAFF'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "invited_by" "uuid",
    "invited_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_login_at" timestamp with time zone,
    "first_login_completed_at" timestamp with time zone,
    "onboarding_state" "jsonb" DEFAULT '{}'::"jsonb",
    "name" "text",
    "email" "text",
    "phone" "text",
    "user_type" "text" DEFAULT 'clinic'::"text",
    CONSTRAINT "clinic_users_role_check" CHECK (("role" = ANY (ARRAY['CADMIN'::"text", 'CMANAGER'::"text", 'CASSISTANT'::"text", 'CVET_INTERNAL'::"text"]))),
    CONSTRAINT "clinic_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."clinic_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinic_users"."role" IS 'Role interna do usuário na clínica (CADMIN, CMANAGER, CSTAFF, etc)';



CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "description" "text",
    "technical_manager" "text",
    "deleted_at" timestamp with time zone,
    "email" "text",
    "phone" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    CONSTRAINT "clinics_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending_unit'::"text", 'pending_approval'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinics"."description" IS 'Descrição breve da clínica (opcional)';



CREATE TABLE IF NOT EXISTS "public"."demand_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_demand_id" "uuid" NOT NULL,
    "specialty" "text" NOT NULL,
    "total_slots" integer DEFAULT 1 NOT NULL,
    "filled_slots" integer DEFAULT 0 NOT NULL,
    "individual_payment" numeric(10,2),
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "demand_positions_filled_slots_check" CHECK (("filled_slots" >= 0)),
    CONSTRAINT "demand_positions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'filled'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "demand_positions_total_slots_check" CHECK (("total_slots" > 0)),
    CONSTRAINT "slots_check" CHECK (("filled_slots" <= "total_slots"))
);


ALTER TABLE "public"."demand_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "clinic_id" "uuid",
    "unit_id" "uuid",
    "category" "text" DEFAULT 'vet'::"text" NOT NULL,
    "required_specialties" "text"[] DEFAULT '{}'::"text"[],
    "demand_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "payment" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "is_composite" boolean DEFAULT false,
    "end_time" time without time zone
);


ALTER TABLE "public"."demands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demands_backup" (
    "id" bigint,
    "title" "text",
    "description" "text",
    "status" "text",
    "payment" numeric,
    "created_at" timestamp with time zone,
    "category" "text",
    "demand_date" "date",
    "start_time" time without time zone,
    "duration_hours" numeric(4,2),
    "required_specialties" "text"[],
    "clinic_id" "uuid"
);


ALTER TABLE "public"."demands_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "seller_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "condition" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "price" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text",
    "quantity_available" integer DEFAULT 1,
    "negotiable" boolean DEFAULT false,
    "images" "text"[],
    "listing_type" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "marketplace_items_category_check" CHECK (("category" = ANY (ARRAY['equipment'::"text", 'medicine'::"text", 'vaccine'::"text", 'supplies'::"text", 'other'::"text"]))),
    CONSTRAINT "marketplace_items_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'used'::"text", 'refurbished'::"text"]))),
    CONSTRAINT "marketplace_items_listing_type_check" CHECK (("listing_type" = ANY (ARRAY['sale'::"text", 'wanted'::"text"]))),
    CONSTRAINT "marketplace_items_seller_type_check" CHECK (("seller_type" = ANY (ARRAY['clinic'::"text", 'vet'::"text", 'freelancer'::"text"]))),
    CONSTRAINT "marketplace_items_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'sold'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."marketplace_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "marketplace_messages_check" CHECK (("sender_id" <> "receiver_id"))
);


ALTER TABLE "public"."marketplace_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'clinic'::"text" NOT NULL,
    "monthly_price" numeric,
    "max_units" integer,
    "max_demands" integer,
    "max_users" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_id" "uuid" NOT NULL,
    "vet_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "accepted_at" timestamp with time zone,
    "inactive_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "position_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled_by_vet'::"text", 'inactive_accepted_other_position'::"text", 'inactive_time_conflict'::"text"])))
);


ALTER TABLE "public"."position_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_applications_backup" (
    "id" "uuid",
    "position_id" "uuid",
    "vet_id" "uuid",
    "status" "text",
    "message" "text",
    "accepted_at" timestamp with time zone,
    "inactive_reason" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."position_applications_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_specialties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_id" "uuid" NOT NULL,
    "specialty_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."position_specialties" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."positions_with_availability" AS
 SELECT "dp"."id",
    "dp"."master_demand_id",
    "dp"."specialty",
    "dp"."total_slots",
    "dp"."filled_slots",
    "dp"."individual_payment",
    "dp"."status",
    "dp"."description",
    "dp"."created_at",
    "d"."title",
    "d"."description" AS "demand_description",
    "d"."clinic_id",
    "d"."unit_id",
    "d"."demand_date",
    "d"."start_time",
    "d"."end_time",
    "d"."category",
    ("dp"."total_slots" - "dp"."filled_slots") AS "available_slots",
    "concat"("dp"."filled_slots", '/', "dp"."total_slots") AS "progress"
   FROM ("public"."demand_positions" "dp"
     JOIN "public"."demands" "d" ON (("d"."id" = "dp"."master_demand_id")))
  WHERE (("dp"."status" = 'open'::"text") AND ("d"."status" = 'open'::"text"));


ALTER VIEW "public"."positions_with_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."specialties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_role" "text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_reply" "text",
    "admin_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "user_read" boolean DEFAULT true,
    "last_message_at" timestamp with time zone,
    "last_message_by" "text",
    CONSTRAINT "support_tickets_last_message_by_check" CHECK (("last_message_by" = ANY (ARRAY['user'::"text", 'admin'::"text"]))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "support_tickets_user_role_check" CHECK (("user_role" = ANY (ARRAY['clinic'::"text", 'vet'::"text"])))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_tickets" IS 'Tickets de suporte enviados por usuários para o admin';



COMMENT ON COLUMN "public"."support_tickets"."user_role" IS 'Papel do usuário que criou o ticket: clinic ou vet';



COMMENT ON COLUMN "public"."support_tickets"."status" IS 'Status do ticket: open (aberto), in_progress (em progresso), resolved (resolvido), closed (fechado)';



COMMENT ON COLUMN "public"."support_tickets"."admin_reply" IS 'Resposta do administrador ao ticket';



COMMENT ON COLUMN "public"."support_tickets"."resolved_at" IS 'Data/hora em que o ticket foi marcado como resolvido';



COMMENT ON COLUMN "public"."support_tickets"."user_read" IS 'Indica se o usuário já leu a resposta do admin (true = lido, false = não lido)';



COMMENT ON COLUMN "public"."support_tickets"."last_message_at" IS 'Data/hora da última mensagem enviada no ticket';



COMMENT ON COLUMN "public"."support_tickets"."last_message_by" IS 'Quem enviou a última mensagem: user ou admin';



CREATE TABLE IF NOT EXISTS "public"."test" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message" character varying(255) DEFAULT 'Supabase connection working!'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."test" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ticket_evaluations_comment_check" CHECK ((("comment" IS NULL) OR ("length"("comment") <= 500))),
    CONSTRAINT "ticket_evaluations_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."ticket_evaluations" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_evaluations" IS 'Avaliações dos usuários sobre o atendimento recebido';



COMMENT ON COLUMN "public"."ticket_evaluations"."rating" IS 'Nota de 1 a 5 estrelas';



COMMENT ON COLUMN "public"."ticket_evaluations"."comment" IS 'Comentário opcional do usuário';



CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read_by_receiver" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ticket_messages_message_check" CHECK ((("length"("message") >= 5) AND ("length"("message") <= 1000))),
    CONSTRAINT "ticket_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_messages" IS 'Armazena todas as mensagens trocadas em tickets de suporte';



COMMENT ON COLUMN "public"."ticket_messages"."sender_role" IS 'Papel do remetente: user (cliente/vet) ou admin';



COMMENT ON COLUMN "public"."ticket_messages"."read_by_receiver" IS 'Se a mensagem foi lida pelo destinatário';



CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" "text",
    "address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "phone" "text",
    "technical_manager" "text",
    "is_main" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nickname" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    CONSTRAINT "units_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_invitations_role_check" CHECK (("role" = ANY (ARRAY['CADMIN'::"text", 'CMANAGER'::"text", 'CASSISTANT'::"text", 'CVET_INTERNAL'::"text"]))),
    CONSTRAINT "user_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."user_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'vet'::"text", 'clinic'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vets" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "crmv" "text" NOT NULL,
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "certificates" "text"[] DEFAULT '{}'::"text"[],
    "experience" "text" NOT NULL,
    "email" "text" NOT NULL,
    "clinic_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "bio" "text"
);


ALTER TABLE "public"."vets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vets"."certificates" IS 'Array de certificações do veterinário';



COMMENT ON COLUMN "public"."vets"."experience" IS 'Texto descritivo da experiência do veterinário';



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_subscriptions"
    ADD CONSTRAINT "clinic_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_user_id_unit_id_key" UNIQUE ("user_id", "unit_id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_cnpj_key" UNIQUE ("cnpj");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demand_positions"
    ADD CONSTRAINT "demand_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demands"
    ADD CONSTRAINT "demands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_items"
    ADD CONSTRAINT "marketplace_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_applications"
    ADD CONSTRAINT "position_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_applications"
    ADD CONSTRAINT "position_applications_position_id_vet_id_key" UNIQUE ("position_id", "vet_id");



ALTER TABLE ONLY "public"."position_specialties"
    ADD CONSTRAINT "position_specialties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_specialties"
    ADD CONSTRAINT "position_specialties_position_id_specialty_name_key" UNIQUE ("position_id", "specialty_name");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test"
    ADD CONSTRAINT "test_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_evaluations"
    ADD CONSTRAINT "ticket_evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_evaluations"
    ADD CONSTRAINT "ticket_evaluations_ticket_id_key" UNIQUE ("ticket_id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_cnpj_key" UNIQUE ("cnpj");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vets"
    ADD CONSTRAINT "vets_crmv_key" UNIQUE ("crmv");



ALTER TABLE ONLY "public"."vets"
    ADD CONSTRAINT "vets_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."vets"
    ADD CONSTRAINT "vets_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_clinic_id" ON "public"."audit_logs" USING "btree" ("clinic_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_clinic_users_clinic_id" ON "public"."clinic_users" USING "btree" ("clinic_id");



CREATE INDEX "idx_clinic_users_first_login_completed" ON "public"."clinic_users" USING "btree" ("first_login_completed_at");



CREATE INDEX "idx_clinic_users_role" ON "public"."clinic_users" USING "btree" ("role");



CREATE INDEX "idx_clinic_users_unit_id" ON "public"."clinic_users" USING "btree" ("unit_id");



CREATE INDEX "idx_clinic_users_user_id" ON "public"."clinic_users" USING "btree" ("user_id");



CREATE INDEX "idx_clinics_status" ON "public"."clinics" USING "btree" ("status");



CREATE INDEX "idx_demand_positions_master" ON "public"."demand_positions" USING "btree" ("master_demand_id");



CREATE INDEX "idx_demand_positions_specialty" ON "public"."demand_positions" USING "btree" ("specialty");



CREATE INDEX "idx_demand_positions_status" ON "public"."demand_positions" USING "btree" ("status");



CREATE INDEX "idx_demands_unit_id" ON "public"."demands" USING "btree" ("unit_id");



CREATE INDEX "idx_invitations_email" ON "public"."user_invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_status" ON "public"."user_invitations" USING "btree" ("status");



CREATE INDEX "idx_invitations_token" ON "public"."user_invitations" USING "btree" ("token");



CREATE INDEX "idx_marketplace_category" ON "public"."marketplace_items" USING "btree" ("category");



CREATE INDEX "idx_marketplace_listing_type" ON "public"."marketplace_items" USING "btree" ("listing_type");



CREATE INDEX "idx_marketplace_location" ON "public"."marketplace_items" USING "btree" ("state", "city");



CREATE INDEX "idx_marketplace_seller" ON "public"."marketplace_items" USING "btree" ("seller_id");



CREATE INDEX "idx_marketplace_status" ON "public"."marketplace_items" USING "btree" ("status");



CREATE INDEX "idx_messages_item" ON "public"."marketplace_messages" USING "btree" ("item_id");



CREATE INDEX "idx_messages_receiver" ON "public"."marketplace_messages" USING "btree" ("receiver_id");



CREATE INDEX "idx_messages_sender" ON "public"."marketplace_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_unread" ON "public"."marketplace_messages" USING "btree" ("receiver_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_position_applications_position" ON "public"."position_applications" USING "btree" ("position_id");



CREATE INDEX "idx_position_applications_status" ON "public"."position_applications" USING "btree" ("status");



CREATE INDEX "idx_position_applications_vet" ON "public"."position_applications" USING "btree" ("vet_id");



CREATE INDEX "idx_position_specialties_position" ON "public"."position_specialties" USING "btree" ("position_id");



CREATE INDEX "idx_position_specialties_specialty" ON "public"."position_specialties" USING "btree" ("specialty_name");



CREATE INDEX "idx_specialties_category" ON "public"."specialties" USING "btree" ("category");



CREATE INDEX "idx_support_tickets_admin_id" ON "public"."support_tickets" USING "btree" ("admin_id");



CREATE INDEX "idx_support_tickets_created_at" ON "public"."support_tickets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "idx_support_tickets_user_id" ON "public"."support_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_ticket_evaluations_rating" ON "public"."ticket_evaluations" USING "btree" ("rating");



CREATE INDEX "idx_ticket_evaluations_ticket_id" ON "public"."ticket_evaluations" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_messages_created_at" ON "public"."ticket_messages" USING "btree" ("created_at");



CREATE INDEX "idx_ticket_messages_sender_id" ON "public"."ticket_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_ticket_messages_ticket_id" ON "public"."ticket_messages" USING "btree" ("ticket_id");



CREATE INDEX "idx_units_clinic_id" ON "public"."units" USING "btree" ("clinic_id");



CREATE UNIQUE INDEX "idx_units_clinic_nickname" ON "public"."units" USING "btree" ("clinic_id", "nickname");



CREATE INDEX "idx_units_status" ON "public"."units" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "trigger_application_acceptance" AFTER INSERT OR UPDATE OF "status" ON "public"."position_applications" FOR EACH ROW EXECUTE FUNCTION "public"."handle_application_acceptance"();



CREATE OR REPLACE TRIGGER "update_clinic_users_updated_at" BEFORE UPDATE ON "public"."clinic_users" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_subscriptions"
    ADD CONSTRAINT "clinic_subscriptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_subscriptions"
    ADD CONSTRAINT "clinic_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_clinic_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_unit_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_users"
    ADD CONSTRAINT "clinic_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demand_positions"
    ADD CONSTRAINT "demand_positions_master_demand_id_fkey" FOREIGN KEY ("master_demand_id") REFERENCES "public"."demands"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demands"
    ADD CONSTRAINT "demands_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");



ALTER TABLE ONLY "public"."marketplace_items"
    ADD CONSTRAINT "marketplace_items_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."marketplace_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."position_applications"
    ADD CONSTRAINT "position_applications_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."demand_positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."position_applications"
    ADD CONSTRAINT "position_applications_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."position_specialties"
    ADD CONSTRAINT "position_specialties_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."demand_positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_evaluations"
    ADD CONSTRAINT "ticket_evaluations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_clinic_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_invitations"
    ADD CONSTRAINT "user_invitations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vets"
    ADD CONSTRAINT "vets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");



CREATE POLICY "Allow all operations" ON "public"."applications" USING (true);



CREATE POLICY "Allow all operations" ON "public"."test" USING (true);



ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_time_conflict"("p_vet_id" "uuid", "p_demand_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."check_time_conflict"("p_vet_id" "uuid", "p_demand_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_time_conflict"("p_vet_id" "uuid", "p_demand_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_application_acceptance"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_application_acceptance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_application_acceptance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."clinic_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_users" TO "anon";
GRANT ALL ON TABLE "public"."clinic_users" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_users" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."demand_positions" TO "anon";
GRANT ALL ON TABLE "public"."demand_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."demand_positions" TO "service_role";



GRANT ALL ON TABLE "public"."demands" TO "anon";
GRANT ALL ON TABLE "public"."demands" TO "authenticated";
GRANT ALL ON TABLE "public"."demands" TO "service_role";



GRANT ALL ON TABLE "public"."demands_backup" TO "anon";
GRANT ALL ON TABLE "public"."demands_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."demands_backup" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_items" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_items" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_items" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_messages" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_messages" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."position_applications" TO "anon";
GRANT ALL ON TABLE "public"."position_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."position_applications" TO "service_role";



GRANT ALL ON TABLE "public"."position_applications_backup" TO "anon";
GRANT ALL ON TABLE "public"."position_applications_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."position_applications_backup" TO "service_role";



GRANT ALL ON TABLE "public"."position_specialties" TO "anon";
GRANT ALL ON TABLE "public"."position_specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."position_specialties" TO "service_role";



GRANT ALL ON TABLE "public"."positions_with_availability" TO "anon";
GRANT ALL ON TABLE "public"."positions_with_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."positions_with_availability" TO "service_role";



GRANT ALL ON TABLE "public"."specialties" TO "anon";
GRANT ALL ON TABLE "public"."specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."specialties" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."test" TO "anon";
GRANT ALL ON TABLE "public"."test" TO "authenticated";
GRANT ALL ON TABLE "public"."test" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."ticket_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."user_invitations" TO "anon";
GRANT ALL ON TABLE "public"."user_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vets" TO "anon";
GRANT ALL ON TABLE "public"."vets" TO "authenticated";
GRANT ALL ON TABLE "public"."vets" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- =============================================================================
-- FICHEIRO: supabase/migrations/20251108184400_update_vet_trigger_with_document_fields.sql
-- =============================================================================

-- ========================================
-- Migration: Atualizar Trigger para Incluir Campos de Documento do Veterinário
-- Date: 2025-01-30
-- Description: Atualiza o trigger handle_new_user para incluir document_type, document_number e address ao criar veterinário
-- ========================================

-- Atualizar função handle_new_user para incluir novos campos de vet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- If no role, try user_metadata
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Create appropriate record based on role
  IF user_role = 'clinic' THEN
    -- 1. Criar clinic com status pending_unit
    INSERT INTO public.clinics (
      id,
      name,
      email,
      cnpj,
      phone,
      address,
      city,
      state,
      technical_manager,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', ''),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      'pending_unit',
      NOW(),
      NOW()
    );
    
    -- 2. Criar CADMIN mas com status pending_activation (sem unit_id)
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      role,
      status,
      accepted_at
    ) VALUES (
      NEW.id,
      NEW.id,
      'CADMIN',
      'pending_activation',
      NOW()
    );
    
    -- NÃO criar unidade automaticamente!
    
  ELSIF user_role = 'vet' THEN
    -- Atualizado para incluir novos campos: document_type, document_number, address e experience
    INSERT INTO public.vets (
      id,
      name,
      email,
      crmv,
      document_type,
      document_number,
      address,
      phone,
      specialties,
      experience,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_type', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_number', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'experience', NULL),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue (don't block user creation)
    RAISE WARNING 'Erro em handle_new_user: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (caso não exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



-- =============================================================================
-- FICHEIRO: supabase/migrations/20251108184733_fix_vet_trigger_experience_field.sql
-- =============================================================================

-- ========================================
-- Migration: Corrigir campo experience no trigger de veterinário
-- Date: 2025-01-30
-- Description: 
--   1. Remove constraint NOT NULL da coluna experience (campo foi removido do formulário)
--   2. Atualiza trigger handle_new_user para incluir campo experience com NULL
-- ========================================

-- 1. Tornar coluna experience nullable
ALTER TABLE vets
ALTER COLUMN experience DROP NOT NULL;

-- Comentário atualizado
COMMENT ON COLUMN vets.experience IS 'Texto descritivo da experiência do veterinário (opcional)';

-- 2. Atualizar função handle_new_user para incluir campo experience
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- If no role, try user_metadata
  IF user_role IS NULL THEN
    user_role := NEW.user_metadata->>'role';
  END IF;
  
  -- Create appropriate record based on role
  IF user_role = 'clinic' THEN
    -- 1. Criar clinic com status pending_unit
    INSERT INTO public.clinics (
      id,
      name,
      email,
      cnpj,
      phone,
      address,
      city,
      state,
      technical_manager,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Clínica sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'cnpj', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', ''),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      COALESCE(NEW.raw_user_meta_data->>'technical_manager', NULL),
      'pending_unit',
      NOW(),
      NOW()
    );
    
    -- 2. Criar CADMIN mas com status pending_activation (sem unit_id)
    INSERT INTO public.clinic_users (
      user_id,
      clinic_id,
      role,
      status,
      accepted_at
    ) VALUES (
      NEW.id,
      NEW.id,
      'CADMIN',
      'pending_activation',
      NOW()
    );
    
    -- NÃO criar unidade automaticamente!
    
  ELSIF user_role = 'vet' THEN
    -- Atualizado para incluir novos campos: document_type, document_number, address e experience
    INSERT INTO public.vets (
      id,
      name,
      email,
      crmv,
      document_type,
      document_number,
      address,
      phone,
      specialties,
      experience,
      city,
      state,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Veterinário sem nome'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'crmv', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_type', NULL),
      COALESCE(NEW.raw_user_meta_data->>'document_number', NULL),
      COALESCE(NEW.raw_user_meta_data->>'address', NULL),
      COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
      COALESCE((NEW.raw_user_meta_data->>'specialties')::text[], ARRAY[]::text[]),
      COALESCE(NEW.raw_user_meta_data->>'experience', NULL),
      COALESCE(NEW.raw_user_meta_data->>'city', ''),
      COALESCE(NEW.raw_user_meta_data->>'state', 'SP'),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue (don't block user creation)
    RAISE WARNING 'Erro em handle_new_user: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (caso não exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



-- =============================================================================
-- FICHEIRO: backend/database_migrations/bootstrap_attach_auth_triggers.sql
-- =============================================================================

-- ========================================
-- Bootstrap: attach auth.users triggers
-- Run AFTER:
--   - supabase/migrations/petivet_prod_structure.sql
--   - supabase/migrations/20251108184400_update_vet_trigger_with_document_fields.sql
--   - supabase/migrations/20251108184733_fix_vet_trigger_experience_field.sql
-- Do NOT run backend/database_migrations/create_auth_triggers.sql after the above:
-- it would replace handle_new_user with an older definition.
-- ========================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

SELECT 'bootstrap_attach_auth_triggers.sql OK' AS status;


-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_freelancers_table.sql
-- =============================================================================

-- ========================================
-- Migration: Criar tabela freelancers
-- Date: 2025-01-30
-- Description: Cria tabela freelancers com campos necessários para cadastro
-- ========================================

-- Criar tabela freelancers
CREATE TABLE IF NOT EXISTS freelancers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text CHECK (document_type IN ('CPF', 'CNPJ')),
  document_number text UNIQUE NOT NULL,
  address text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  city text,
  state text,
  bio text,
  photo_url text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  onboarding_completed boolean DEFAULT false,
  approval_status text DEFAULT 'pending' 
    CHECK (approval_status IN ('pending', 'pending_approval', 'approved', 'rejected', 'pending_review')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_freelancers_email ON freelancers(email);
CREATE INDEX IF NOT EXISTS idx_freelancers_document_number ON freelancers(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freelancers_status ON freelancers(status);
CREATE INDEX IF NOT EXISTS idx_freelancers_onboarding_completed ON freelancers(onboarding_completed) WHERE onboarding_completed = false;
CREATE INDEX IF NOT EXISTS idx_freelancers_approval_status ON freelancers(approval_status) WHERE approval_status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_freelancers_approved_by ON freelancers(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freelancers_reviewed_by ON freelancers(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Criar trigger para atualizar updated_at automaticamente
DROP TRIGGER IF EXISTS update_freelancers_updated_at ON freelancers;
CREATE TRIGGER update_freelancers_updated_at
  BEFORE UPDATE ON freelancers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime();

-- Comentários nas colunas
COMMENT ON TABLE freelancers IS 'Tabela de freelancers cadastrados no sistema';
COMMENT ON COLUMN freelancers.id IS 'ID do freelancer (mesmo ID do auth.users)';
COMMENT ON COLUMN freelancers.name IS 'Nome completo do freelancer';
COMMENT ON COLUMN freelancers.document_type IS 'Tipo de documento: CPF ou CNPJ';
COMMENT ON COLUMN freelancers.document_number IS 'Número do documento (CPF ou CNPJ) sem formatação';
COMMENT ON COLUMN freelancers.address IS 'Endereço completo do freelancer';
COMMENT ON COLUMN freelancers.email IS 'Email do freelancer (único)';
COMMENT ON COLUMN freelancers.status IS 'Status do freelancer: active ou inactive';
COMMENT ON COLUMN freelancers.onboarding_completed IS 'Indica se o freelancer completou o onboarding';
COMMENT ON COLUMN freelancers.approval_status IS 'Status de aprovação: pending (aguardando onboarding), pending_approval (aguardando aprovação admin), approved (aprovado), rejected (rejeitado), pending_review (aguardando ajustes)';
COMMENT ON COLUMN freelancers.approved_by IS 'ID do admin que aprovou o freelancer';
COMMENT ON COLUMN freelancers.approved_at IS 'Data e hora da aprovação';
COMMENT ON COLUMN freelancers.rejection_reason IS 'Motivo da rejeição (se aplicável)';
COMMENT ON COLUMN freelancers.reviewed_by IS 'ID do admin que revisou o freelancer';
COMMENT ON COLUMN freelancers.reviewed_at IS 'Data e hora da revisão';

-- Verificação de sucesso
SELECT 'Migration create_freelancers_table.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'freelancers') as table_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'id') as id_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'document_type') as document_type_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'document_number') as document_number_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'address') as address_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'onboarding_completed') as onboarding_completed_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'approval_status') as approval_status_exists;



-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_demand_applications_unified.sql
-- =============================================================================

-- ========================================
-- Migration: Criar tabela demand_applications unificada
-- Date: 2025-11-18
-- Description: Cria tabela unificada para aplicações de demandas, substituindo
--              applications e position_applications para simplificar o lifecycle
-- ========================================

-- Criar tabela demand_applications
CREATE TABLE IF NOT EXISTS demand_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  vet_id uuid REFERENCES vets(id) ON DELETE CASCADE,
  freelancer_id uuid REFERENCES freelancers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN (
    'invited',           -- Convidado pela clínica
    'applied',           -- Candidatou-se
    'approved',          -- Aprovado pela clínica
    'rejected',          -- Rejeitado pela clínica
    'rejected_by_vet',   -- Recusou convite ou cancelou
    'check_in',          -- Fez check-in
    'check_out',         -- Fez check-out
    'report_sent',       -- Enviou relatório
    'report_approved',   -- Relatório aprovado pela clínica
    'canceled_by_vet'    -- Cancelado pelo vet
  )),
  message text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamp with time zone,
  position_id uuid REFERENCES demand_positions(id) ON DELETE SET NULL, -- Opcional, para compatibilidade com demandas compostas
  applied_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que ou vet_id ou freelancer_id está preenchido, mas não ambos
  CONSTRAINT demand_applications_applicant_check CHECK (
    (vet_id IS NOT NULL AND freelancer_id IS NULL) OR
    (vet_id IS NULL AND freelancer_id IS NOT NULL)
  ),
  
  -- Garantir unicidade: um vet/freelancer só pode se candidatar uma vez por demanda
  CONSTRAINT demand_applications_unique_vet UNIQUE (demand_id, vet_id),
  CONSTRAINT demand_applications_unique_freelancer UNIQUE (demand_id, freelancer_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_demand_applications_demand_id ON demand_applications(demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_vet_id ON demand_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_freelancer_id ON demand_applications(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_status ON demand_applications(status);
CREATE INDEX IF NOT EXISTS idx_demand_applications_invited_by ON demand_applications(invited_by);
CREATE INDEX IF NOT EXISTS idx_demand_applications_position_id ON demand_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_demand_applications_applied_at ON demand_applications(applied_at);

-- Comentários nas colunas
COMMENT ON TABLE demand_applications IS 'Tabela unificada para aplicações de veterinários e freelancers a demandas';
COMMENT ON COLUMN demand_applications.status IS 'Status da aplicação no lifecycle: invited, applied, approved, rejected, check_in, check_out, report_sent, report_approved';
COMMENT ON COLUMN demand_applications.invited_by IS 'ID do usuário que convidou (clínica)';
COMMENT ON COLUMN demand_applications.position_id IS 'ID da posição específica (para demandas compostas), opcional';

-- Mensagem de sucesso
SELECT 'Migration create_demand_applications_unified.sql concluída com sucesso!' as status;



-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_work_proof_table.sql
-- =============================================================================

-- ========================================
-- Migration: Criar tabela work_proof
-- Date: 2025-11-18
-- Description: Tabela para armazenar prova de trabalho (check-in, check-out, relatórios)
-- ========================================

-- Criar tabela work_proof
CREATE TABLE IF NOT EXISTS work_proof (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES demand_applications(id) ON DELETE CASCADE,
  checkin_time timestamp with time zone,
  checkout_time timestamp with time zone,
  location_checkin jsonb, -- {lat: number, lng: number, address?: string}
  location_checkout jsonb, -- {lat: number, lng: number, address?: string}
  report_text text,
  attachments text[], -- Array de URLs de arquivos anexados
  clinic_signature jsonb, -- {signed_by: uuid, signed_at: timestamp, signature_data?: string}
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que checkin_time existe antes de checkout_time
  CONSTRAINT work_proof_checkout_after_checkin CHECK (
    checkout_time IS NULL OR checkin_time IS NOT NULL
  ),
  
  -- Garantir que checkout_time é após checkin_time
  CONSTRAINT work_proof_checkout_after_checkin_time CHECK (
    checkout_time IS NULL OR checkin_time IS NULL OR checkout_time >= checkin_time
  )
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_work_proof_application_id ON work_proof(application_id);
CREATE INDEX IF NOT EXISTS idx_work_proof_checkin_time ON work_proof(checkin_time);
CREATE INDEX IF NOT EXISTS idx_work_proof_checkout_time ON work_proof(checkout_time);
CREATE INDEX IF NOT EXISTS idx_work_proof_created_at ON work_proof(created_at);

-- Comentários
COMMENT ON TABLE work_proof IS 'Prova de trabalho: check-in, check-out e relatórios de plantões';
COMMENT ON COLUMN work_proof.location_checkin IS 'Geolocalização do check-in (JSONB com lat, lng, address)';
COMMENT ON COLUMN work_proof.location_checkout IS 'Geolocalização do check-out (JSONB com lat, lng, address)';
COMMENT ON COLUMN work_proof.attachments IS 'Array de URLs de arquivos anexados ao relatório (fotos, PDFs, etc)';
COMMENT ON COLUMN work_proof.clinic_signature IS 'Assinatura digital da clínica confirmando o trabalho (JSONB)';

-- Mensagem de sucesso
SELECT 'Migration create_work_proof_table.sql concluída com sucesso!' as status;



-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_messages_system.sql
-- =============================================================================

-- ========================================
-- Migration: Criar Sistema de Mensagens
-- Date: 2025-01-30
-- Description: Cria tabelas para sistema de mensagens entre clínicas, vets e freelancers
-- Regras: clinic↔vet OK, clinic↔freelancer OK, vet↔freelancer BLOQUEADO
-- ========================================

-- ========================================
-- TABELA: conversations
-- ========================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant1_type text NOT NULL CHECK (participant1_type IN ('clinic', 'vet', 'freelancer')),
  participant2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant2_type text NOT NULL CHECK (participant2_type IN ('clinic', 'vet', 'freelancer')),
  demand_id uuid REFERENCES demands(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  archived_by_participant1 boolean DEFAULT false,
  archived_by_participant2 boolean DEFAULT false,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que não seja vet ↔ freelancer
  CONSTRAINT check_valid_pair CHECK (
    NOT (participant1_type = 'vet' AND participant2_type = 'freelancer') AND
    NOT (participant1_type = 'freelancer' AND participant2_type = 'vet')
  ),
  
  -- Garantir que participant1_id != participant2_id
  CONSTRAINT check_different_participants CHECK (participant1_id != participant2_id),
  
  -- Garantir ordem consistente (sempre clinic primeiro se houver)
  CONSTRAINT check_participant_order CHECK (
    (participant1_type = 'clinic' AND participant2_type IN ('vet', 'freelancer')) OR
    (participant1_type = 'vet' AND participant2_type = 'clinic') OR
    (participant1_type = 'freelancer' AND participant2_type = 'clinic')
  )
);

-- Índice único para evitar conversas duplicadas (mesmo par de participantes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair 
ON conversations (
  LEAST(participant1_id, participant2_id),
  GREATEST(participant1_id, participant2_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id, participant1_type);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id, participant2_type);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_demand_id ON conversations(demand_id) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_application_id ON conversations(application_id) WHERE application_id IS NOT NULL;

COMMENT ON TABLE conversations IS 'Conversas entre participantes (clinic↔vet, clinic↔freelancer)';
COMMENT ON COLUMN conversations.participant1_type IS 'Tipo do primeiro participante: clinic, vet ou freelancer';
COMMENT ON COLUMN conversations.participant2_type IS 'Tipo do segundo participante: clinic, vet ou freelancer';
COMMENT ON COLUMN conversations.demand_id IS 'ID da demanda relacionada (se aplicável)';
COMMENT ON COLUMN conversations.application_id IS 'ID da aplicação relacionada (se aplicável)';
COMMENT ON CONSTRAINT check_valid_pair ON conversations IS 'Bloqueia conversas entre vet e freelancer';

-- ========================================
-- TABELA: messages
-- ========================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('clinic', 'vet', 'freelancer')),
  message text NOT NULL CHECK (length(message) >= 1 AND length(message) <= 5000),
  read_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

COMMENT ON TABLE messages IS 'Mensagens individuais dentro de conversas';
COMMENT ON COLUMN messages.sender_type IS 'Tipo do remetente: clinic, vet ou freelancer';
COMMENT ON COLUMN messages.read_at IS 'Timestamp quando a mensagem foi lida (NULL = não lida)';
COMMENT ON COLUMN messages.deleted_at IS 'Timestamp quando a mensagem foi deletada (soft delete)';

-- ========================================
-- TABELA: message_reports
-- ========================================
CREATE TABLE IF NOT EXISTS message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_reason text NOT NULL CHECK (length(report_reason) >= 10 AND length(report_reason) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_reports_message_id ON message_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_reported_by ON message_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON message_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_message_reports_created_at ON message_reports(created_at DESC);

COMMENT ON TABLE message_reports IS 'Reportes de mensagens inadequadas';
COMMENT ON COLUMN message_reports.status IS 'Status do reporte: pending (pendente), reviewed (revisado), resolved (resolvido)';

-- ========================================
-- TABELA: admin_conversation_access_logs
-- ========================================
CREATE TABLE IF NOT EXISTS admin_conversation_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  access_reason text NOT NULL CHECK (access_reason IN ('report', 'support_ticket', 'audit')),
  related_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  accessed_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_logs_admin_id ON admin_conversation_access_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_conversation_id ON admin_conversation_access_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_accessed_at ON admin_conversation_access_logs(accessed_at DESC);

COMMENT ON TABLE admin_conversation_access_logs IS 'Log de auditoria de acessos admin a conversas';
COMMENT ON COLUMN admin_conversation_access_logs.access_reason IS 'Motivo do acesso: report (mensagem reportada), support_ticket (vinculado a ticket), audit (auditoria)';

-- ========================================
-- TRIGGER: Atualizar last_message_at quando nova mensagem é criada
-- ========================================
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON messages;
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ========================================
-- VERIFICAÇÃO DE SUCESSO
-- ========================================
SELECT 'Migration create_messages_system.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'conversations') as conversations_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'messages') as messages_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'message_reports') as message_reports_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'admin_conversation_access_logs') as access_logs_table_exists;







-- =============================================================================
-- FICHEIRO: backend/database_migrations/add_demand_id_to_messages.sql
-- =============================================================================

-- ========================================
-- Migration: Adicionar demand_id na tabela messages
-- Date: 2025-01-30
-- Description: Adiciona campo demand_id para rastrear qual demanda iniciou cada mensagem
-- ========================================

-- Adicionar coluna demand_id na tabela messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS demand_id uuid REFERENCES demands(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_messages_demand_id ON messages(demand_id) WHERE demand_id IS NOT NULL;

-- Comentário
COMMENT ON COLUMN messages.demand_id IS 'ID da demanda relacionada à mensagem (quando mensagem foi enviada da página de demanda)';



-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_notifications_system.sql
-- =============================================================================

-- ========================================
-- MIGRATION: Sistema de Notificações
-- Date: 2025-10-30
-- Description: Sistema completo de notificações in-app para todos os usuários
-- ========================================

-- ========================================
-- 1. CRIAR TABELA NOTIFICATIONS
-- ========================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'application_received',      -- Clínica recebe candidatura
    'application_accepted',      -- Vet teve candidatura aceita
    'application_rejected',      -- Vet teve candidatura rejeitada
    'support_reply',            -- Resposta em ticket de suporte
    'unit_invitation',          -- Convite para unidade
    'marketplace_message',      -- Mensagem no marketplace
    'demand_status_changed',    -- Status de demanda mudou
    'new_demand_created'        -- Nova demanda criada (para vets)
  )),
  title text NOT NULL CHECK (length(title) >= 1 AND length(title) <= 200),
  message text NOT NULL CHECK (length(message) >= 1 AND length(message) <= 500),
  link text,                    -- URL para redirecionar ao clicar
  entity_type text,             -- 'demand', 'application', 'ticket', etc
  entity_id uuid,               -- ID da entidade relacionada
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- ========================================
-- 2. CRIAR ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

-- ========================================
-- 3. COMENTÁRIOS
-- ========================================
COMMENT ON TABLE notifications IS 'Sistema de notificações in-app para todos os usuários';
COMMENT ON COLUMN notifications.type IS 'Tipo da notificação que determina o ícone e comportamento';
COMMENT ON COLUMN notifications.title IS 'Título curto da notificação (max 200 chars)';
COMMENT ON COLUMN notifications.message IS 'Mensagem descritiva (max 500 chars)';
COMMENT ON COLUMN notifications.link IS 'URL relativa para redirecionar ao clicar na notificação';
COMMENT ON COLUMN notifications.entity_type IS 'Tipo da entidade relacionada (demand, application, ticket, etc)';
COMMENT ON COLUMN notifications.entity_id IS 'ID da entidade relacionada';
COMMENT ON COLUMN notifications.read IS 'Se a notificação foi lida pelo usuário';

-- ========================================
-- 4. FUNÇÃO PARA LIMPEZA AUTOMÁTICA (OPCIONAL)
-- ========================================
-- Remove notificações lidas com mais de 30 dias
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications 
  WHERE read = true 
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. VERIFICAÇÃO
-- ========================================
SELECT 
  'notifications' as tabela,
  COUNT(*) as total_registros
FROM notifications;

-- ========================================
-- 6. EXEMPLO DE NOTIFICAÇÃO
-- ========================================
-- INSERT INTO notifications (user_id, type, title, message, link, entity_type, entity_id)
-- VALUES (
--   'user-uuid-here',
--   'application_received',
--   'Nova Candidatura',
--   'João Silva se candidatou à sua vaga de Veterinário',
--   '/demands/demand-id/applications',
--   'application',
--   'application-uuid-here'
-- );



-- =============================================================================
-- FICHEIRO: backend/database_migrations/create_storage_buckets.sql
-- =============================================================================

-- ========================================
-- Migration: Criar Storage Buckets
-- Date: 2025-01-30
-- Description: Cria buckets do Supabase Storage para documentos de veterinários e imagens do marketplace
-- ========================================

-- ========================================
-- 1. BUCKET: vet-documents
-- ========================================
-- Bucket para armazenar documentos CRMV dos veterinários
-- Privado: apenas o próprio vet e admins podem acessar

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vet-documents',
  'vet-documents',
  false, -- Bucket privado
  5242880, -- 5MB em bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

-- ========================================
-- 2. POLÍTICAS RLS PARA vet-documents
-- ========================================

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Vets can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can delete their own documents" ON storage.objects;

-- Política: Permitir upload apenas para usuários autenticados (seus próprios arquivos)
-- A política verifica se o primeiro segmento do caminho (pasta) corresponde ao ID do usuário
CREATE POLICY "Vets can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vet-documents' AND
  (
    -- Verificar se o primeiro segmento do caminho é o ID do usuário
    (storage.foldername(name))[1] = auth.uid()::text OR
    -- Fallback: verificar se o caminho começa com o ID do usuário seguido de /
    split_part(name, '/', 1) = auth.uid()::text
  )
);

-- Política: Permitir leitura apenas para o próprio usuário e admins
CREATE POLICY "Vets can read their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  )
);

-- Política: Permitir atualização apenas para o próprio usuário
CREATE POLICY "Vets can update their own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'vet-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir deleção apenas para o próprio usuário e admins
CREATE POLICY "Vets can delete their own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  )
);

-- ========================================
-- 3. BUCKET: marketplace-images
-- ========================================
-- Bucket para armazenar imagens do marketplace
-- Público: imagens podem ser acessadas publicamente

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketplace-images',
  'marketplace-images',
  true, -- Bucket público
  5242880, -- 5MB em bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- ========================================
-- 4. POLÍTICAS RLS PARA marketplace-images
-- ========================================

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Users can upload their own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own marketplace images" ON storage.objects;

-- Política: Permitir upload apenas para usuários autenticados (seus próprios arquivos)
CREATE POLICY "Users can upload their own marketplace images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir leitura pública (bucket é público)
CREATE POLICY "Public can read marketplace images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'marketplace-images');

-- Política: Permitir atualização apenas para o próprio usuário
CREATE POLICY "Users can update their own marketplace images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir deleção apenas para o próprio usuário
CREATE POLICY "Users can delete their own marketplace images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ========================================
-- VERIFICAÇÃO
-- ========================================
SELECT 
  'Migration create_storage_buckets.sql concluída com sucesso!' as status,
  (SELECT COUNT(*) FROM storage.buckets WHERE id IN ('vet-documents', 'marketplace-images')) as buckets_created;


