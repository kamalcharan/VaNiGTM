-- ============================================================
-- KI-Prime Migration 002: Update free plan session limit
-- VaNiBase hardcodes max_sessions=1 on registration.
-- KI-Prime product allows 5 sessions for all plans.
-- ============================================================

-- Update existing subscriptions
UPDATE VN_subscriptions SET max_sessions = 5 WHERE max_sessions < 5;

-- Create a trigger to auto-set max_sessions on new subscription rows
CREATE OR REPLACE FUNCTION ki_set_session_limit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.max_sessions := GREATEST(NEW.max_sessions, 5);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ki_subscription_session_limit ON VN_subscriptions;
CREATE TRIGGER ki_subscription_session_limit
  BEFORE INSERT ON VN_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION ki_set_session_limit();

-- Record migration
INSERT INTO VN_migrations (filename, checksum, applied_by, notes)
VALUES ('102_ki_session_limit.sql', md5('002_ki_session_limit_v1.0.0'), 'manual',
        'KI-Prime: Override free plan max_sessions from 1 to 5')
ON CONFLICT DO NOTHING;
