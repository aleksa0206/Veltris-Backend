import { z } from 'zod';
import { calendarDate, optionalText } from './common';

export const PROJECT_STATUSES = ['Active', 'OnHold', 'Completed', 'Archived'] as const;

const projectFields = {
  // Upper-case letters and digits, starting with a letter: WEB, OPS2.
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'must be 2-10 letters or digits, starting with a letter'),
  name: z.string().trim().min(1).max(120),
  description: optionalText(10000),
  status: z.enum(PROJECT_STATUSES).optional(),
  leadId: z.number().int().positive().nullable().optional(),
  startDate: calendarDate.nullable().optional(),
  targetDate: calendarDate.nullable().optional(),
};

const datesInOrder = (p: {
  startDate?: Date | null | undefined;
  targetDate?: Date | null | undefined;
}) => !p.startDate || !p.targetDate || p.startDate <= p.targetDate;
const datesMessage = { message: 'must not be before the start date', path: ['targetDate'] };

export const createProjectSchema = z.object(projectFields).refine(datesInOrder, datesMessage);

export const updateProjectSchema = z
  .object({
    ...projectFields,
    key: projectFields.key.optional(),
    name: projectFields.name.optional(),
  })
  .refine(datesInOrder, datesMessage);
