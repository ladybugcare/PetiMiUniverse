import { z } from 'zod';

export const financeSourceTypeSchema = z.enum([
  'grooming_session',
  'encounter',
  'quote',
  'appointment',
  'boarding_reservation',
]);

export const receivableSourceTypeSchema = z.enum([
  'grooming_session',
  'encounter',
  'quote',
  'appointment',
  'boarding_reservation',
  'manual',
]);
