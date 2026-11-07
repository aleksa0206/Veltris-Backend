import { z } from 'zod';

// Calendar day `YYYY-MM-DD`, stored as UTC midnight.
export const calendarDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

// Optional free text: blank strings are stored as null.
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();
