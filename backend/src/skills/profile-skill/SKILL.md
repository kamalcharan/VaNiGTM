# profile-skill

The profile-skill owns the structured, typed view of each tenant's product, ICP, GTM, and vision data — the `gt_tenant_profile` table populated initially by the VaNi conversation agent and editable directly by humans. It reads from `gt_tenant_profile` (current snapshot) and `gt_tenant_profile_history` (immutable version history), writes upserts to `gt_tenant_profile` and append-only snapshots to `gt_tenant_profile_history`, and computes a weighted `completion_score` (product 0–40 / icp 0–30 / gtm 0–20 / vision 0–10) plus the generated `is_complete` flag. On approval it emits `PROFILE_COMPLETE` on the event bus, which wakes the downstream ICP-skill, Storyteller-skill, and Lead-Finder agents that depend on a finalised profile.

## Functions

The two `/api/v1/profile/offers/*` routes, on the generic skill runner, so the
console reaches them on the one surface nginx exposes. Everyday reads and
edits of offers are research-skill's `get_offers` / `save_offer`.

### generate_offers
Draft 1–3 offers from the profile and the cached ingestion text — no re-crawl — as a visible agent run. Drafts are unconfirmed.
- Parameters: none
- Returns: { drafted: [{ offer_key, name }], run_id, recipe: 'offer-list' }

### confirm_offer
The human gate on one offer: stamps confirmed_at and recomputes the profile score.
- Parameters: offer_key (required, string)
- Returns: { success: true, offer_key, recipe: 'offer-card' }
