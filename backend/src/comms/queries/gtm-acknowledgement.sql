-- The tenant's latest DPDP outreach acknowledgement (D9-e). Latest row decides.
SELECT action, notice_id, at
  FROM vani_tenant_acknowledgement
 WHERE tenant_id = vani_current_tenant()
   AND kind = 'gtm_outreach_dpdp'
 ORDER BY at DESC, id DESC
 LIMIT 1;
