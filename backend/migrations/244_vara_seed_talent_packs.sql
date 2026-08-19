-- ============================================================================
-- 244_vara_seed_talent_packs.sql
--
-- Vara Phase 1 — seed three handcrafted talent playbooks into
-- vani_domain_pack. Industry: Technology & SaaS. Families: Backend Eng,
-- Frontend Eng, Product & Design. One pack row per family so a pack can be
-- re-versioned independently (V-14 append-only). The payload is namespaced
-- under `vara` so other agents added later can extend the same pack without
-- collision.
--
-- Idempotent by construction: the (code, version) unique constraint carries
-- the guard. Re-running this migration is a no-op.
--
-- The pack is a STARTING SHAPE, not a spec. The tenant's first JD in a
-- family lands as vara_jd_version.v1 with these fields as prefills. The
-- second JD in the same family triggers the family-defaults derivation
-- prompt (statistics over the two JDs) — that is where family playbook
-- values settle, not here.
-- ============================================================================

INSERT INTO vani_domain_pack (code, version, domain, payload) VALUES
(
  'talent-technology-saas-backend-eng',
  1,
  'technology-saas',
  $json${
    "family_name": "Backend Engineering",
    "hint": "Ships services, owns data models",
    "suggested_titles": [
      "Senior Backend Engineer",
      "Staff Backend Engineer",
      "Backend Tech Lead"
    ],
    "vara": {
      "starter": {
        "role_summary_hint": "Ships production services end-to-end — owns a domain from schema to observability.",
        "musthaves": [
          { "name": "TypeScript / Node.js in production", "weight": 40 },
          { "name": "PostgreSQL — row-level security, migrations",  "weight": 25 },
          { "name": "Distributed systems experience",   "weight": 20 },
          { "name": "Cloud deploy (AWS / GCP)",         "weight": 15 }
        ],
        "knockouts": [
          { "label": "Notice period", "rule": "<= 60 days" },
          { "label": "Work authorization", "rule": "India" }
        ],
        "threshold": 30,
        "window_days": 3,
        "band_hint": "Band varies by seniority — set on the JD."
      }
    }
  }$json$::jsonb
),
(
  'talent-technology-saas-frontend-eng',
  1,
  'technology-saas',
  $json${
    "family_name": "Frontend Engineering",
    "hint": "Ships product surfaces end-to-end",
    "suggested_titles": [
      "Senior Frontend Engineer",
      "Frontend Tech Lead",
      "Product Engineer"
    ],
    "vara": {
      "starter": {
        "role_summary_hint": "Owns the surface a user actually touches — from render performance to interaction state.",
        "musthaves": [
          { "name": "React / Next.js in production", "weight": 40 },
          { "name": "TypeScript",                    "weight": 20 },
          { "name": "CSS — layout, responsive, motion", "weight": 20 },
          { "name": "Performance profiling (Core Web Vitals)", "weight": 20 }
        ],
        "knockouts": [
          { "label": "Notice period", "rule": "<= 60 days" },
          { "label": "Work authorization", "rule": "India" }
        ],
        "threshold": 30,
        "window_days": 3,
        "band_hint": "Band varies by seniority — set on the JD."
      }
    }
  }$json$::jsonb
),
(
  'talent-technology-saas-product-design',
  1,
  'technology-saas',
  $json${
    "family_name": "Product & Design",
    "hint": "Owns problem framing, ships craft",
    "suggested_titles": [
      "Senior Product Designer",
      "Product Manager",
      "Design Lead"
    ],
    "vara": {
      "starter": {
        "role_summary_hint": "Frames the real problem, chooses what to ship, and answers for the outcome.",
        "musthaves": [
          { "name": "Portfolio — end-to-end product cases, not screens", "weight": 40 },
          { "name": "User research — interviews, synthesis, decisions",  "weight": 25 },
          { "name": "Cross-functional shipping (with eng, with data)",   "weight": 20 },
          { "name": "Written product judgement (docs, PRDs)",            "weight": 15 }
        ],
        "knockouts": [
          { "label": "Notice period", "rule": "<= 60 days" },
          { "label": "Work authorization", "rule": "India" },
          { "label": "Portfolio access", "rule": "required" }
        ],
        "threshold": 28,
        "window_days": 3,
        "band_hint": "Band varies by scope — set on the JD."
      }
    }
  }$json$::jsonb
)
ON CONFLICT (code, version) DO NOTHING;
