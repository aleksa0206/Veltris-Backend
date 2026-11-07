import type { Request } from 'express';
import { ValidationError } from '../errors/ValidationError';

function invalid(name: string, message: string): ValidationError {
  return new ValidationError(`${name}: ${message}`, [{ path: name, message }]);
}

export function parseOptionalIdQuery(req: Request, name: string): number | undefined {
  const raw = req.query[name];
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw invalid(name, 'must be a positive integer');
  }
  return value;
}

export function parseOptionalEnumQuery<T extends string>(
  req: Request,
  name: string,
  allowed: readonly T[]
): T | undefined {
  const raw = req.query[name];
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    throw invalid(name, `must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

function optionalString(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw invalid(name, 'must be a single value');
  }
  return raw;
}

/** Comma-separated values, e.g. `?status=Pending,Approval`. */
export function parseOptionalEnumListQuery<T extends string>(
  req: Request,
  name: string,
  allowed: readonly T[]
): T[] | undefined {
  const raw = optionalString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  const values = raw.split(',');
  if (values.some((value) => !allowed.includes(value as T))) {
    throw invalid(name, `must be a comma-separated list of: ${allowed.join(', ')}`);
  }
  return values as T[];
}

/** Comma-separated ids, e.g. `?userIds=1,2,3`. */
export function parseOptionalIdListQuery(req: Request, name: string): number[] | undefined {
  const raw = optionalString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  const values = raw.split(',').map(Number);
  if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw invalid(name, 'must be a comma-separated list of positive integers');
  }
  return values;
}

/** Calendar date `YYYY-MM-DD`, interpreted as UTC midnight like stored leave dates. */
export function parseOptionalDateQuery(req: Request, name: string): Date | undefined {
  const raw = optionalString(req, name);
  if (raw === undefined) {
    return undefined;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.getTime())) {
    throw invalid(name, 'must be a date in YYYY-MM-DD format');
  }
  return date;
}

export function parseOptionalSearchQuery(req: Request, name: string): string | undefined {
  const value = optionalString(req, name)?.trim();
  return value ? value.slice(0, 100) : undefined;
}

export function parseOptionalBooleanQuery(req: Request, name: string): boolean | undefined {
  const raw = parseOptionalEnumQuery(req, name, ['true', 'false'] as const);
  return raw === undefined ? undefined : raw === 'true';
}

// Query filters are optional; with exactOptionalPropertyTypes Prisma rejects `undefined` values.
export function compact<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
