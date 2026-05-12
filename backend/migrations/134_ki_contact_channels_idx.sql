-- 034_ki_contact_channels_idx.sql
-- Add composite index on ki_contact_channels(contact_id, is_live, channel_type)
-- so the get_contacts channel lookups use an index scan, not a seq scan.
-- The existing idx_ki_contact_channels_contact covers (contact_id, is_live) but
-- the channel_type filter requires a partial scan of the index; adding channel_type
-- makes the lookup a single index seek per row.

CREATE INDEX IF NOT EXISTS idx_ki_contact_channels_contact_type
    ON ki_contact_channels(contact_id, is_live, channel_type)
    WHERE is_active = true;
