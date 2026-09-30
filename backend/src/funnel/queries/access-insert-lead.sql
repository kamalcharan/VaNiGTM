-- A new lead, the same shape the assessment writes (228). partner_id NULL =
-- direct. phone holds the mobile only; the country code travels separately
-- in the event (never concatenated — CLAUDE.md lesson 11).
-- $1 tenant · $2 name · $3 email · $4 company · $5 role title · $6 mobile
INSERT INTO gt_lead (tenant_id, is_live, partner_id, lead_no, name, email, company, role_title, phone)
VALUES ($1, true, NULL, gt_next_seq($1::uuid, 'vani_lead'), $2, $3, $4, $5, $6)
RETURNING id, lead_no;
