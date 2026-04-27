INSERT INTO gt_campaigns
  (tenant_id, is_live, campaign_no, name, description, product_name, product_url,
   target_industries, sender_name, sender_email, created_by)
VALUES
  ($tenant_id, $is_live,
   ki_next_seq($tenant_id::uuid, 'campaign'),
   $name, $description, $product_name, $product_url,
   $target_industries::jsonb, $sender_name, $sender_email, $created_by)
RETURNING id, campaign_no, name, status, created_at
