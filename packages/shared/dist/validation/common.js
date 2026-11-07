"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.password = exports.paginationQuery = exports.optionalLongText = exports.longText = exports.shortText = exports.timezone = exports.language = exports.email = exports.phone = exports.timeOfDay = exports.isoDate = exports.isoDateTime = exports.objectId = void 0;
const zod_1 = require("zod");
const domain_1 = require("../constants/domain");
exports.objectId = zod_1.z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
exports.isoDateTime = zod_1.z.iso.datetime({ offset: true });
/** Calendar date (YYYY-MM-DD) — interpreted in the patient's/hospital's timezone. */
exports.isoDate = zod_1.z.iso.date();
/** Local wall-clock time HH:mm (24h). */
exports.timeOfDay = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour) format');
exports.phone = zod_1.z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Use international format, e.g. +2348012345678');
exports.email = zod_1.z.email().trim().toLowerCase();
exports.language = zod_1.z.enum(domain_1.LANGUAGES);
exports.timezone = zod_1.z
    .string()
    .min(3)
    .max(64)
    .refine((tz) => {
    try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
    }
    catch {
        return false;
    }
}, 'Unknown IANA timezone');
exports.shortText = zod_1.z.string().trim().min(1).max(200);
exports.longText = zod_1.z.string().trim().min(1).max(5000);
exports.optionalLongText = zod_1.z.string().trim().max(5000).optional();
exports.paginationQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
/** Strong password policy: 10+ chars with letters and numbers. */
exports.password = zod_1.z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number');
