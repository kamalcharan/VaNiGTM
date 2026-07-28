-- ============================================================
-- Migration: 210_brief_extract_failed.sql
-- Purpose:   Separate "their website is unreadable" from "our extraction
--            failed".
--
-- Both were landing as status='unreadable', and they are not the same thing:
--
--   unreadable      — the company has no usable website. That is a FINDING
--                     about them, it will not change on a retry, and it is a
--                     legitimate reason not to contact anyone there.
--   extract_failed  — we read their site fine and our own pipeline fell over
--                     (model truncated mid-JSON, schema mismatch). That says
--                     nothing about the company and IS retryable.
--
-- Conflating them corrupts the pilot's conclusion. "12 of 101 companies have
-- no web presence" is a real result about Telangana pharma; "12 of 101 hit a
-- token limit" is a bug report. Reading one as the other would have us
-- writing off companies for our own failure.
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_account_briefs') IS NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table gt_account_briefs — it comes from migration 207.';
    END IF;
END $$;

ALTER TABLE gt_account_briefs
    DROP CONSTRAINT IF EXISTS gt_account_briefs_status_check;

ALTER TABLE gt_account_briefs
    ADD CONSTRAINT gt_account_briefs_status_check
    CHECK (status IN ('drafted', 'unreadable', 'extract_failed',
                      'approved', 'rejected', 'no_contact'));

COMMENT ON COLUMN gt_account_briefs.status IS
    'drafted = agent produced it · unreadable = the company has no usable website (a finding about them) · extract_failed = we read the site but our own extraction fell over (retryable, says nothing about them) · approved/rejected/no_contact = a human decided.';
