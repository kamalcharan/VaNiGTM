-- pulse-skill: count for list_pulses pagination

SELECT COUNT(*)::TEXT AS total
FROM   ki_pulses p
WHERE  p.tenant_id  = $tenant_id
  AND  p.is_live    = $is_live
  AND  ($status::TEXT     IS NULL OR p.status     = $status::TEXT)
  AND  ($origin::TEXT     IS NULL OR p.origin     = $origin::TEXT)
  AND  ($pulse_type::TEXT IS NULL OR p.pulse_type = $pulse_type::TEXT)
  AND  ($contact_id::INT  IS NULL OR p.contact_id = $contact_id::INT)
  AND  ($client_id::INT   IS NULL OR p.client_id  = $client_id::INT);
