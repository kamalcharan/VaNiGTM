/**
 * rls-runtime-probe — drive the REAL API, as whatever role DB_PRIMARY names,
 * through the paths that break when the runtime stops bypassing RLS.
 *
 * LOCAL ONLY. It registers two throwaway tenants; never point it at production.
 * Written 2026-09-30 for the vikuna_admin → vanigtm_app switch; it is how the
 * blockers in docs/db/rls-status.md §14 were found. Run it twice — API on
 * vanigtm_app, then on vikuna_admin — both must print ALL PASSED.
 *
 *   PROBE_API=http://localhost:3012/api/v1 node scripts/rls-runtime-probe/probe.mjs
 *
 * Recipe (database built from the migrations, roles shaped like production):
 *   CREATE ROLE vikuna_admin LOGIN SUPERUSER BYPASSRLS PASSWORD '…';
 *   CREATE ROLE vanigtm_app  LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '…';
 *   CREATE DATABASE vani_gtm_db OWNER vikuna_admin;
 *   DB_PRIMARY=postgresql://vikuna_admin:…@localhost/vani_gtm_db npm run db:migrate
 *   psql … -U vikuna_admin -f scripts/grant-vanigtm-app.sql
 *   DB_PRIMARY=postgresql://vanigtm_app:…@localhost/vani_gtm_db JWT_SECRET=… \
 *     TENANT_SECRET_KEY=<64 hex> PORT=3012 npx tsx src/server.ts
 */
const B = process.env.PROBE_API ?? 'http://localhost:3012/api/v1';
let fails = 0;

async function call(label, method, path, body, token, expect) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 120); }
  const err = j?.error ? `${j.error.code ?? ''}: ${j.error.message ?? JSON.stringify(j.error)}` : '';
  const ok = expect ? expect(r.status, j) : r.status < 300;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(r.status).padEnd(4)} ${label.padEnd(46)} ${err}`.slice(0, 210));
  return { status: r.status, j };
}

async function newTenant(tag) {
  const stamp = Date.now().toString(36), email = `${tag}-${stamp}@example.com`, pw = 'Passw0rd!Passw0rd';
  await call(`[${tag}] register (new tenant)`, 'POST', '/auth/register', {
    name: `${tag} Owner`, email, password: pw, country_code: '+91',
    mobile: '9' + String(Date.now()).slice(-9), tenant_name: `${tag} ${stamp}`,
  });
  const T = (await call(`[${tag}] login`, 'POST', '/auth/login', { email, password: pw })).j.tokens.access_token;
  return { T, stamp };
}

// ── Tenant A: the whole Vara path, from signup to a widget booting
const A = await newTenant('alpha');
const host = `alpha-${A.stamp}.example.com`, origin = `https://${host}`;
await call('[A] step vani:domain (provisions vani_tenant)', 'PATCH', '/onboarding/step',
  { lane: 'vani', step_id: 'vani:domain', status: 'completed', data: { domain: host, purpose: 'candidate', embed_origins: [origin] } }, A.T);
const doms = await call('[A] tenant/domains lists it', 'GET', '/tenant/domains', undefined, A.T,
  (s, j) => s === 200 && j.domains?.length === 1);
const did = doms.j.domains?.[0]?.id;
await call('[A] PATCH origins add www', 'PATCH', `/tenant/domains/${did}/origins`, { add: [`https://www.${host}`] }, A.T,
  (s, j) => s === 200 && j.changed === true);
await call('[A] tenant/embed issues snippet', 'GET', '/tenant/embed', undefined, A.T,
  (s, j) => s === 200 && !!j.token && j.domains?.length === 1);
await call('[A] vara/status', 'GET', '/vara/status', undefined, A.T);
await call('[A] vara/activate', 'POST', '/vara/activate', { code: 'x' }, A.T);
await call('[A] vara/jd/compose (publish → live)', 'POST', '/vara/jd/compose', {
  family: 'Software Engineer', title: 'Backend Engineer',
  facts: { musthaves: [{ label: 'Node.js', weight: 3 }], knockouts: [], threshold: 30, one_liner: 'Build the API' },
}, A.T);
const et = (await call('[A] tenant/embed: Vara live', 'GET', '/tenant/embed', undefined, A.T,
  (s, j) => s === 200 && j.agents?.some((a) => a.code === 'vara' && a.status === 'live'))).j.token;
const boot = await call('[public] boot from allowlisted origin', 'POST', '/embed/boot', { token: et, parent_origin: origin },
  undefined, (s, j) => s === 200 && j.agents?.[0]?.offers?.length >= 1);
await call('[public] boot from other origin refused', 'POST', '/embed/boot',
  { token: et, parent_origin: 'https://evil.example.com' }, undefined, (s) => s === 403);
await call('[A] boot_pings recorded', 'GET', '/tenant/domains', undefined, A.T,
  (s, j) => !!j.domains?.[0]?.boot_pings?.[origin]);
if (boot.j.session) {
  // 503 ROUTER_NOT_EMBEDDED is correct on a database whose intents were never embedded.
  await call('[public] embed/intent (free text)', 'POST', '/embed/intent',
    { session: boot.j.session, query: 'what roles are open?' }, undefined, (s) => s === 200 || s === 503);
}
for (const [s, f] of [['runs', 'list'], ['runs', 'events'], ['runs', 'awaiting'], ['dashboard', 'brain'], ['agents', 'list'],
  ['vara', 'journey'], ['gtm', 'journey'], ['llm-provider-skill', 'get_provider'], ['ingestion-skill', 'knowledge'],
  ['domain-pack-skill', 'my_families'], ['prospect-skill', 'get_records'], ['contact-skill', 'get_contacts']])
  await call(`[A] skill ${s}.${f}`, 'POST', `/skills/${s}/${f}`, { params: {} }, A.T, (st, j) => st === 200 && j.success !== false);

// ── Tenant B: sees none of A, cannot take A's things
const Bt = await newTenant('bravo');
await call('[B] tenant/domains: empty', 'GET', '/tenant/domains', undefined, Bt.T, (s, j) => s === 200 && j.domains?.length === 0);
await call('[B] tenant/embed: not provisioned', 'GET', '/tenant/embed', undefined, Bt.T, (s) => s === 409);
await call("[B] PATCH A's domain id → 404", 'PATCH', `/tenant/domains/${did}/origins`, { add: ['https://b.example.com'] }, Bt.T, (s) => s === 404);
await call("[B] claim A's domain → 409 DOMAIN_TAKEN", 'PATCH', '/onboarding/step',
  { lane: 'vani', step_id: 'vani:domain', status: 'completed', data: { domain: host, purpose: 'candidate' } }, Bt.T,
  (s, j) => s === 409 && j.error?.code === 'DOMAIN_TAKEN');
await call('[B] step vani:domain (own)', 'PATCH', '/onboarding/step', { lane: 'vani', step_id: 'vani:domain', status: 'completed',
  data: { domain: `bravo-${Bt.stamp}.example.com`, purpose: 'candidate', embed_origins: [`https://bravo-${Bt.stamp}.example.com`] } }, Bt.T);
await call('[B] tenant/domains: only its own', 'GET', '/tenant/domains', undefined, Bt.T,
  (s, j) => s === 200 && j.domains?.length === 1 && j.domains[0].domain.startsWith('bravo'));
const bt = (await call('[B] tenant/embed', 'GET', '/tenant/embed', undefined, Bt.T)).j.token;
await call("[public] B's token from A's origin → 403", 'POST', '/embed/boot', { token: bt, parent_origin: origin }, undefined, (s) => s === 403);
await call('[A] still exactly 1 domain', 'GET', '/tenant/domains', undefined, A.T, (s, j) => j.domains?.length === 1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
