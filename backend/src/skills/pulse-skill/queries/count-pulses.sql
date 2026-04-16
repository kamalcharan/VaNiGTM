-- pulse-skill: count for list_pulses pagination

SELECT COUNT(*)::TEXT AS total
FROM   ki_pulses p
WHERE  p.tenant_id  = $tenant_id
  AND  p.is_live    = $is_live
  AND  ($status     IS NULL OR p.status     = $status)
  AND  ($origin     IS NULL OR p.origin     = $origin)
  AND  ($pulse_type IS NULL OR p.pulse_type = $pulse_type)
  AND  ($contact_id IS NULL OR p.contact_id = $contact_id)
  AND  ($client_id  IS NULL OR p.client_id  = $client_id);
