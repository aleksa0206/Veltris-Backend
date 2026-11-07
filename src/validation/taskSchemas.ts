import { z } from 'zod';
import { calendarDate, optionalText } from './common';

export const TASK_STATUSES = [
  'Backlog',
  'Todo',
  'InProgress',
  'InReview',
  'Done',
  'Cancelled',
] as const;
export const TASK_PRIORITIES = ['None', 'Low', 'Medium', 'High', 'Urgent'] as const;

const taskFields = {
  title: z.string().trim().min(1).max(191),
  description: optionalText(20000),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: calendarDate.nullable().optional(),
};

export const createTaskSchema = z.object({
  ...taskFields,
  parentId: z.number().int().positive().nullable().optional(),
});

export const updateTaskSchema = z.object({ ...taskFields, title: taskFields.title.optional() });

export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  /** The card the task is dropped above; null = bottom of the column. */
  beforeTaskId: z.number().int().positive().nullable(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});
