SELECT l.id, l.lead_no, l.name, l.email, l.company, l.role_title, l.phone, l.status,
       l.created_at, l.updated_at, l.contact_id,
       p.display_name AS partner_name,
       r.id AS response_id, r.health_score, r.band, r.answers,
       r.started_at, r.completed_at,
       -- top_modes/all_modes come from gt_report (frozen at capture time,
       -- migrations 229/230) rather than being recomputed, so the console,
       -- the report page and any future email cannot disagree.
       rep.top_modes, rep.all_modes, rep.report_token, rep.ref AS report_ref,
       rep.narrative, rep.emailed_at, rep.revoked_at,
       -- The definition is needed to turn stored answer INDEXES into the
       -- question and option text a human can read. get-lead.ts does that
       -- mapping so the page stays free of any assessment copy.
       d.definition
  FROM gt_lead l
  LEFT JOIN gt_partner p ON p.id = l.partner_id
  LEFT JOIN gt_assessment_response r ON r.lead_id = l.id
  LEFT JOIN gt_report rep ON rep.assessment_response_id = r.id
  LEFT JOIN gt_assessment_def d ON d.id = r.assessment_def_id
 WHERE l.tenant_id = $tenant_id AND l.is_live = $is_live
   AND l.id = $lead_id
   AND ($partner_id::uuid IS NULL OR l.partner_id = $partner_id::uuid)
