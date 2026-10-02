/**
 * pool-skill shared: the admin gate and the query files. The pool's tables
 * carry no tenant_id, so nothing in a query constrains who reads them — this
 * gate is the whole protection, the same line prospect-skill's pool scope has.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SkillContext } from '../../types/skill.types';

export function requireAdmin(ctx: SkillContext): void {
  if (!ctx.is_admin) throw new Error('The common pool is available to admin tenants only.');
}

const cache = new Map<string, string>();
export function sql(name: string): string {
  let s = cache.get(name);
  if (!s) { s = fs.readFileSync(path.join(__dirname, 'queries', `${name}.sql`), 'utf-8'); cache.set(name, s); }
  return s;
}

export const int = (v: unknown, dflt: number, max: number) =>
  Math.min(Math.max(Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : dflt, 0), max);
