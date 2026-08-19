-- Backfill: agendamentos com serviço do grupo leva_traz gravados como "standard"
-- passam a "pickup_route" para aparecerem no Leva e Traz operacional.

UPDATE hub_appointments a
SET appointment_kind = 'pickup_route',
    updated_at = now()
FROM hub_service_types st
WHERE a.hub_service_type_id = st.id
  AND a.clinic_id = st.clinic_id
  AND a.appointment_kind = 'standard'
  AND a.deleted_at IS NULL
  AND lower(COALESCE(TRIM(st.service_group), '')) = 'leva_traz';
