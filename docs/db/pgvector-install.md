# pgvector — install & enable

Prereq for migration `246_vara_semantic.sql` (and any later migration that
adds a `vector(...)` column). Without it, migration 246 aborts on the very
first `CREATE EXTENSION vector` statement — which is the intended behaviour
per VaNiGTM rule 12 (no silent fallback). Same shape as the
`gt_semantic_clusters` plan already documented in `192_gt_semantic_clusters.sql`.

## VPS (Ubuntu / Debian, apt-based)

```bash
apt-get update
apt-get install -y postgresql-16-pgvector
# Postgres does not need a full restart for extension install, but the
# extension has to be enabled per database:
sudo -u postgres psql vani_gtm_db -c "CREATE EXTENSION vector;"
sudo -u postgres psql vani_gtm_db -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
```

Verify from the app role:
```bash
psql "$DB_PRIMARY" -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
```
Expected: one row, `vector | 0.6.0` (or newer).

## Windows local

Two options:
- Use the EnterpriseDB installer's Application Stack Builder to add pgvector.
- Or from source: https://github.com/pgvector/pgvector#windows (needs Visual Studio Build Tools).

Then, from psql or pgAdmin:
```sql
CREATE EXTENSION vector;
```

## macOS local (Homebrew)

```bash
brew install pgvector
psql "$DB_PRIMARY" -c "CREATE EXTENSION vector;"
```

## Verifying the shape migration 246 expects

```sql
-- 768-dim column present on the three entities
\d vara_skill        -- embedding vector(768)
\d vara_family_profile  -- axes_embedding vector(768)
\d vara_candidate    -- profile_embedding vector(768)

-- HNSW indices built lazily on first neighbour query
\di+ *hnsw*
```

## Embedding model

Migration 246 pins the vector dimension at **768**. Any embedding model
whose output isn't 768-dim will fail insertion. The default the backend
helper uses is `nomic-embed-text` (768-dim, no auth, Ollama-native):

```bash
# On the LLM host (VPS or dev box running Ollama)
ollama pull nomic-embed-text
```

Override the model with the `EMBED_MODEL` env var if needed. Changing the
model to a different dimension means a new migration to widen/narrow the
vector columns and re-embed everything — not a config flip.

## Rollback

Extension is safe to leave installed if migration 246 is later reverted;
the columns and indices drop with the tables. To fully uninstall:

```sql
DROP EXTENSION vector CASCADE;   -- CASCADE drops dependent columns/indices
```
