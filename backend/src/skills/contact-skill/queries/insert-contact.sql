INSERT INTO gt_contacts
  (tenant_id, is_live, prefix, name, contact_no,
   job_title, company_name, company_domain, linkedin_url, location,
   source, created_by)
VALUES
  ($tenant_id, $is_live, $prefix, $name,
   gt_next_seq($tenant_id::uuid, 'contact'),
   $job_title, $company_name, $company_domain, $linkedin_url, $location,
   $source, $created_by)
RETURNING id, contact_no, prefix, name, normalized_name,
          job_title, company_name, company_domain, linkedin_url, location,
          source, score, created_at
