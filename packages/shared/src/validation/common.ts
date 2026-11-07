import { z } from 'zod';
import { LANGUAGES } from '../constants/domain';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
export const isoDateTime = z.iso.datetime({ offset: true });
/** Calendar date (YYYY-MM-DD) — interpreted in the patient's/hospital's timezone. */
export const isoDate = z.iso.date();
/** Local wall-clock time HH:mm (24h). */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour) format');
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Use international format, e.g. +2348012345678');
export const email = z.email().trim().toLowerCase();
export const language = z.enum(LANGUAGES);
export const timezone = z
  .string()
  .min(3)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown IANA timezone');

export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().min(1).max(5000);
export const optionalLongText = z.string().trim().max(5000).optional();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

/** Strong password policy: 10+ chars with letters and numbers. */
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
