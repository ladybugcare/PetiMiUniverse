import { z } from 'zod';

export const comandaOriginSchema = z.enum([
  'appointment',
  'grooming_session',
  'quote',
  'encounter',
  'manual',
  'boarding_reservation',
  'package',
  'series_invoice',
]);
