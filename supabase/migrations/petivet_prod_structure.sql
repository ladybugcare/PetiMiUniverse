


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







