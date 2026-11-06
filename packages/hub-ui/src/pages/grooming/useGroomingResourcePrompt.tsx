import { useState } from 'react';
import { hubResourcesApi, type ResourceAvailability } from '../../api/hubResourcesApi';
import type { GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { GroomingResourceDialog, type GroomingResourceChoice } from './GroomingResourceDialog';

export function useGroomingResourcePrompt() {
  const [prompt, setPrompt] = useState<{
    availability: ResourceAvailability;
    busyName: string | null;
    resolve: (choice: GroomingResourceChoice | null) => void;
  } | null>(null);

  async function chooseForStart(
    item: GroomingDayBoardItem,
    clinicId: string,
  ): Promise<GroomingResourceChoice | null | 'skip-gate'> {
    if (String(item.grooming_stage) !== 'queued') return 'skip-gate';
    if (!item.appointment_id || !item.service_type?.id || !item.unit_id) return 'skip-gate';
    const now = new Date();
    const availability = await hubResourcesApi.availability({
      clinicId,
      unitId: item.unit_id,
      serviceTypeId: item.service_type.id,
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 60_000).toISOString(),
      excludeAppointmentId: item.appointment_id,
      mode: 'now',
    });
    if (!availability.uses_catalog) return 'skip-gate';
    const current = availability.resources.find((r) => r.id === item.hub_resource_id);
    if (current && !current.busy) return { hubResourceId: current.id, skipResource: false };
    return new Promise((resolve) => {
      setPrompt({
        availability,
        busyName: current?.busy ? current.name : null,
        resolve: (choice) => {
          setPrompt(null);
          resolve(choice);
        },
      });
    });
  }

  const dialog = prompt ? (
    <GroomingResourceDialog
      availability={prompt.availability}
      busyName={prompt.busyName}
      onCancel={() => prompt.resolve(null)}
      onConfirm={(choice) => prompt.resolve(choice)}
    />
  ) : null;

  return { chooseForStart, dialog };
}
