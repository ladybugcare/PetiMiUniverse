import type { HubGuardianCreatePayload, HubGuardianUpdatePayload } from '../../api/hubGuardiansApi';
import { brDateToIso } from './formatters';
import type { GuardianFormValues } from './GuardianCreateForm';

export function formValuesToCreatePayload(
  form: GuardianFormValues,
  clinicId: string
): HubGuardianCreatePayload {
  const birthIso = brDateToIso(form.birth_date_br);
  return {
    clinic_id: clinicId,
    full_name: form.full_name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim() || null,
    notes: form.notes.trim() || null,
    client_kind: form.client_kind,
    legal_name: form.legal_name.trim() || null,
    birth_date: birthIso ?? null,
    sex: form.sex === '' ? null : form.sex,
    tax_id: form.tax_id.trim(),
    id_doc_type: form.id_doc_type.trim() || null,
    id_doc_number: form.id_doc_number.trim() || null,
    lead_source: form.lead_source.trim() || null,
    postal_code: form.postal_code.trim() || null,
    state: form.state.trim() || null,
    city: form.city.trim() || null,
    district: form.district.trim() || null,
    street: form.street.trim() || null,
    street_number: form.street_number.trim() || null,
    complement: form.complement.trim() || null,
  };
}

export function formValuesToUpdatePayload(
  form: GuardianFormValues,
  clinicId: string
): HubGuardianUpdatePayload {
  const birthIso = brDateToIso(form.birth_date_br);
  return {
    clinic_id: clinicId,
    full_name: form.full_name.trim(),
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    notes: form.notes.trim() || null,
    client_kind: form.client_kind,
    legal_name: form.legal_name.trim() || null,
    birth_date: birthIso ?? null,
    sex: form.sex === '' ? null : form.sex,
    tax_id: form.tax_id.trim(),
    id_doc_type: form.id_doc_type.trim() || null,
    id_doc_number: form.id_doc_number.trim() || null,
    lead_source: form.lead_source.trim() || null,
    postal_code: form.postal_code.trim() || null,
    state: form.state.trim() || null,
    city: form.city.trim() || null,
    district: form.district.trim() || null,
    street: form.street.trim() || null,
    street_number: form.street_number.trim() || null,
    complement: form.complement.trim() || null,
  };
}
