import { z } from 'zod';

const uuidStr = z.string().uuid();

/** Resolve o id da internação na rota ou, por compatibilidade, em `?hospitalization_id=`. */
export function resolveHospitalizationEventsId(
  paramsId: unknown,
  queryHospitalizationId: unknown,
): string | null {
  const fromParams = uuidStr.safeParse(paramsId);
  if (fromParams.success) return fromParams.data;
  const fromQuery = uuidStr.safeParse(queryHospitalizationId);
  if (fromQuery.success) return fromQuery.data;
  return null;
}
