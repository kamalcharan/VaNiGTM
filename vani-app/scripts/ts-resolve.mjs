// Lets Node's --experimental-strip-types run our extension-less TS imports
// (`./csv` → `./csv.ts`) without changing tsconfig for the bundler's sake.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(spec) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
}`), import.meta.url);
