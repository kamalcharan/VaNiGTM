-- Does this workspace have its platform record (vani_tenant) yet? The
-- acknowledgement references it; it is created by the Domain step.
SELECT vani_current_tenant() IS NOT NULL AS provisioned;
