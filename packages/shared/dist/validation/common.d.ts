import { z } from 'zod';
export declare const objectId: z.ZodString;
export declare const isoDateTime: z.ZodISODateTime;
/** Calendar date (YYYY-MM-DD) — interpreted in the patient's/hospital's timezone. */
export declare const isoDate: z.ZodISODate;
/** Local wall-clock time HH:mm (24h). */
export declare const timeOfDay: z.ZodString;
export declare const phone: z.ZodString;
export declare const email: z.ZodEmail;
export declare const language: z.ZodEnum<{
    en: "en";
    ha: "ha";
    pcm: "pcm";
}>;
export declare const timezone: z.ZodString;
export declare const shortText: z.ZodString;
export declare const longText: z.ZodString;
export declare const optionalLongText: z.ZodOptional<z.ZodString>;
export declare const paginationQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type PaginationQuery = z.infer<typeof paginationQuery>;
/** Strong password policy: 10+ chars with letters and numbers. */
export declare const password: z.ZodString;
