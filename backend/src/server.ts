import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { buildRegistry } from './services/skill-registry';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'proessionalkey-api', version: '2.0.0' });
});

async function main() {
  // Build skill registry
  const skillsDir = path.resolve(__dirname, 'skills');
  const registry = await buildRegistry(skillsDir);
  const summary = registry.summary();
  console.log(`[ProessionalKey] Loaded ${summary.skills} skills, ${summary.handlers} handlers`);

  // Skill execution route
  app.post('/api/v1/skills/:skillName/:functionName', async (req, res) => {
    const { skillName, functionName } = req.params;
    const params = req.body.params || {};
    
    // TODO: Replace with real JWT auth
    const tenantId = req.headers['x-dev-tenant-id'] as string || '';
    const ctx = {
      tenant_id: tenantId,
      db: { query: async () => ({ rows: [] }) }, // TODO: Wire real PG pool
    };

    const result = await registry.execute(skillName, functionName, params, ctx);
    res.json(result);
  });

  app.listen(PORT, () => {
    console.log(`[ProessionalKey] API running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('[ProessionalKey] Failed to start:', err);
  process.exit(1);
});