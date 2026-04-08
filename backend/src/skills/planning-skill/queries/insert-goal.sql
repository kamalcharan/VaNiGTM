INSERT INTO ki_goals (
  tenant_id, client_id, name, goal_type, target_amount, target_date,
  inflation_rate, expected_return, current_corpus, monthly_sip,
  probability, status, linked_schemes
) VALUES (
  $tenant_id, $client_id, $name, $type, $target_amount, $target_date,
  $inflation_rate, $expected_return, 0, $monthly_sip,
  $probability, 'active', $linked_schemes
)
RETURNING id
