/**
 * KI-Prime — Database Layer
 *
 * Usage:
 *   import { getPool, createTenantDb, closePool, healthCheck } from './db';
 *
 *   // At startup
 *   const pool = getPool();
 *
 *   // Per request (in skill route handler)
 *   const db = createTenantDb(pool, tenantId);
 *   const ctx: SkillContext = { tenant_id: tenantId, db };
 *
 *   // In skill function
 *   const result = await ctx.db.query(SQL, { $tenant_id: ctx.tenant_id, $client_id: 123 });
 *
 *   // For writes
 *   await ctx.db.transaction(async (tx) => {
 *     await tx.query(INSERT_SQL, params);
 *     await tx.query(UPDATE_SQL, params);
 *   });
 *
 *   // At shutdown
 *   await closePool();
 */

export { getPool, getClientWithTenant, closePool, healthCheck } from './pool';
export { createTenantDb, translateParams } from './query';
