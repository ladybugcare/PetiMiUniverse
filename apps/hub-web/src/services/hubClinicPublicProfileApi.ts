import { apiRequest, getApiBaseUrl } from '@petimi/web-core';
import type {
  HubClinicPublicProfileEditorResponse,
  HubClinicPublicProfileRow,
  HubPublicClinicLandingPayload,
  PatchHubClinicPublicProfileBody,
} from '../types/hubClinicPublicProfile';

const hubBase = '/api/hub';

export const hubClinicPublicProfileApi = {
  getEditor(clinicId: string): Promise<HubClinicPublicProfileEditorResponse> {
    return apiRequest(
      `${hubBase}/clinic/public-profile?clinic_id=${encodeURIComponent(clinicId)}`,
    ) as Promise<HubClinicPublicProfileEditorResponse>;
  },

  patch(
    clinicId: string,
    body: PatchHubClinicPublicProfileBody,
  ): Promise<{
    profile: HubClinicPublicProfileRow;
    services: HubClinicPublicProfileEditorResponse['services'];
    service_groups: HubClinicPublicProfileEditorResponse['service_groups'];
    staff: HubClinicPublicProfileEditorResponse['staff'];
  }> {
    return apiRequest(
      `${hubBase}/clinic/public-profile?clinic_id=${encodeURIComponent(clinicId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ) as Promise<{
      profile: HubClinicPublicProfileRow;
      services: HubClinicPublicProfileEditorResponse['services'];
      service_groups: HubClinicPublicProfileEditorResponse['service_groups'];
      staff: HubClinicPublicProfileEditorResponse['staff'];
    }>;
  },

  uploadCover(
    clinicId: string,
    file: File,
  ): Promise<{ url: string; profile: HubClinicPublicProfileRow }> {
    const fd = new FormData();
    fd.append('photo', file);
    return apiRequest(
      `${hubBase}/clinic/public-profile/cover?clinic_id=${encodeURIComponent(clinicId)}`,
      { method: 'POST', body: fd },
    ) as Promise<{ url: string; profile: HubClinicPublicProfileRow }>;
  },

  uploadLogo(
    clinicId: string,
    file: File,
  ): Promise<{ url: string; profile: HubClinicPublicProfileRow }> {
    const fd = new FormData();
    fd.append('photo', file);
    return apiRequest(
      `${hubBase}/clinic/public-profile/logo?clinic_id=${encodeURIComponent(clinicId)}`,
      { method: 'POST', body: fd },
    ) as Promise<{ url: string; profile: HubClinicPublicProfileRow }>;
  },
};

export async function fetchPublicClinicProfile(
  slug: string,
): Promise<HubPublicClinicLandingPayload> {
  const r = await fetch(`${getApiBaseUrl()}/api/public/clinics/${encodeURIComponent(slug)}`);
  const data = (await r.json().catch(() => ({}))) as HubPublicClinicLandingPayload & {
    error?: string;
  };
  if (!r.ok) {
    throw new Error(data.error || 'Página não encontrada');
  }
  return data;
}
