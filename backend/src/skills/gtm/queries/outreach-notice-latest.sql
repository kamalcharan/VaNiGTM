-- The platform's current DPDP outreach notice for GTM (migration 260/263).
-- Platform rows (tenant_id NULL) are readable by every tenant — the one
-- deliberate exception to "every query filters by tenant_id".
SELECT id, version, body, published_at
  FROM vani_consent_text
 WHERE tenant_id IS NULL
   AND agent_code = 'gtm'
   AND kind = 'outreach_notice'
 ORDER BY version DESC
 LIMIT 1;
