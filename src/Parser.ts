import { CronField, ParsedCronExpression } from './types.js';

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const SPECIAL_EXPRESSIONS: Record<string, string> = {
  '@yearly':   '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly':  '0 0 1 * *',
  '@weekly':   '0 0 * * 0',
  '@daily':    '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly':   '0 * * * *',
};

const FIELD_RANGES: Array<{ name: string; min: number; max: number }> = [
  { name: 'minute',     min: 0, max: 59 },
  { name: 'hour',       min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month',      min: 1, max: 12 },
  { name: 'dayOfWeek',  min: 0, max: 6 },
];

export class CronParser {
  /**
   * Parse a cron expression string into a structured representation.
   * Supports: *, ranges (1-5), lists (1,3,5), steps (* /5), names (MON-FRI, JAN-DEC),
   * and special strings (@hourly, @daily, @weekly, @monthly, @yearly).
   */
  parse(expression: string): ParsedCronExpression {
    const trimmed = expression.trim();

    // Handle special expressions
    if (trimmed.startsWith('@')) {
      const expanded = SPECIAL_EXPRESSIONS[trimmed.toLowerCase()];
      if (!expanded) throw new Error(`Unknown special expression: ${trimmed}`);
      return this.parse(expanded);
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression "${expression}": expected 5 fields, got ${parts.length}`);
    }

    const fields: CronField[] = parts.map((part, index) => {
      const range = FIELD_RANGES[index];
      return this.parseField(part, range.min, range.max, index);
    });

    return {
      minute: fields[0],
      hour: fields[1],
      dayOfMonth: fields[2],
      month: fields[3],
      dayOfWeek: fields[4],
      raw: expression,
    };
  }

  private parseField(field: string, min: number, max: number, fieldIndex: number): CronField {
    // Replace named values
    let normalized = field.toUpperCase();
    if (fieldIndex === 3) {
      for (const [name, val] of Object.entries(MONTH_NAMES)) {
        normalized = normalized.replace(new RegExp(name, 'g'), String(val));
      }
    }
    if (fieldIndex === 4) {
      for (const [name, val] of Object.entries(DAY_NAMES)) {
        normalized = normalized.replace(new RegExp(name, 'g'), String(val));
      }
    }

    // Wildcard
    if (normalized === '*') {
      return { type: 'wildcard', values: this.range(min, max) };
    }

    // Step: */n or m-n/s
    if (normalized.includes('/')) {
      return this.parseStep(normalized, min, max);
    }

    // List: a,b,c
    if (normalized.includes(',')) {
      return this.parseList(normalized, min, max);
    }

    // Range: a-b
    if (normalized.includes('-')) {
      return this.parseRange(normalized, min, max);
    }

    // Single value
    const value = parseInt(normalized, 10);
    if (isNaN(value) || value < min || value > max) {
      throw new Error(`Invalid cron value "${field}": must be between ${min} and ${max}`);
    }
    return { type: 'value', values: [value] };
  }

  private parseStep(field: string, min: number, max: number): CronField {
    const [rangeStr, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) throw new Error(`Invalid step value: ${stepStr}`);

    let start = min;
    let end = max;

    if (rangeStr !== '*') {
      if (rangeStr.includes('-')) {
        const [s, e] = rangeStr.split('-').map(Number);
        start = s;
        end = e;
      } else {
        start = parseInt(rangeStr, 10);
      }
    }

    const values: number[] = [];
    for (let i = start; i <= end; i += step) {
      values.push(i);
    }

    return { type: 'step', values };
  }

  private parseRange(field: string, min: number, max: number): CronField {
    const [startStr, endStr] = field.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);

    if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid range: ${field} (valid: ${min}-${max})`);
    }

    return { type: 'range', values: this.range(start, end) };
  }

  private parseList(field: string, min: number, max: number): CronField {
    const values = field.split(',').map((v) => {
      const num = parseInt(v.trim(), 10);
      if (isNaN(num) || num < min || num > max) {
        throw new Error(`Invalid list value: ${v} (valid: ${min}-${max})`);
      }
      return num;
    });

    return { type: 'list', values: [...new Set(values)].sort((a, b) => a - b) };
  }

  private range(start: number, end: number): number[] {
    const result: number[] = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }

  /**
   * Calculate the next run time from a parsed expression.
   */
  getNextRun(parsed: ParsedCronExpression, from: Date = new Date()): Date {
    const next = new Date(from.getTime());
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1); // At least 1 minute in the future

    for (let i = 0; i < 366 * 24 * 60; i++) { // Max 1 year of minutes
      if (
        parsed.month.values.includes(next.getMonth() + 1) &&
        parsed.dayOfMonth.values.includes(next.getDate()) &&
        parsed.dayOfWeek.values.includes(next.getDay()) &&
        parsed.hour.values.includes(next.getHours()) &&
        parsed.minute.values.includes(next.getMinutes())
      ) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    throw new Error(`Could not find next run time for expression: ${parsed.raw}`);
  }

  /**
   * Validate a cron expression string. Returns null if valid, error message if not.
   */
  validate(expression: string): string | null {
    try {
      this.parse(expression);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid cron expression';
    }
  }

  /**
   * Get a human-readable description of a cron expression.
   */
  describe(expression: string): string {
    const parsed = this.parse(expression);
    const parts: string[] = [];

    if (parsed.minute.type === 'wildcard') parts.push('every minute');
    else if (parsed.minute.type === 'value') parts.push(`at minute ${parsed.minute.values[0]}`);
    else parts.push(`at minutes ${parsed.minute.values.join(', ')}`);

    if (parsed.hour.type !== 'wildcard') {
      parts.push(`during hour(s) ${parsed.hour.values.join(', ')}`);
    }

    if (parsed.dayOfMonth.type !== 'wildcard') {
      parts.push(`on day(s) ${parsed.dayOfMonth.values.join(', ')}`);
    }

    if (parsed.month.type !== 'wildcard') {
      parts.push(`in month(s) ${parsed.month.values.join(', ')}`);
    }

    if (parsed.dayOfWeek.type !== 'wildcard') {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      parts.push(`on ${parsed.dayOfWeek.values.map((d) => dayNames[d]).join(', ')}`);
    }

    return parts.join(', ');
  }
}
