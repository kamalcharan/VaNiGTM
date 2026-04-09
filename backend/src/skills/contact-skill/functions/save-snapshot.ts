/**
 * contact-skill: save_snapshot
 *
 * Creates or updates a versioned financial snapshot for a contact.
 * Handles the full draft → active lifecycle and recomputes all
 * Benchmark Pulse calc_ metrics.
 *
 * Lifecycle:
 *   status='draft'  — auto-save during wizard. One draft per contact.
 *                     Creates new draft if none exists; replaces child
 *                     rows if draft already exists.
 *   status='active' — final submit. Archives current active (if any),
 *                     promotes draft (or creates new) to active.
 *
 * All child tables (income, expenses, assets, liabilities, protection,
 * goals) are REPLACED on every call — client always sends full state.
 */

import { SkillContext } from '../../../shared/types';

// ── Input shapes ───────────────────────────────────────────────────────────

export interface IncomeRow {
  source: 'salary' | 'partner' | 'rental_other';
  amount_monthly: number;
  notes?: string;
}

export interface ExpenseRow {
  category: 'housing' | 'food' | 'utilities' | 'transport' | 'education' | 'lifestyle';
  amount_monthly: number;
}

export interface AssetRow {
  asset_type_id: number;
  description?: string;
  current_value: number;
  is_liquid: boolean;
  years_held?: number;
  sort_order?: number;
}

export interface LiabilityRow {
  liability_type_id: number;
  description?: string;
  outstanding_amount: number;
  monthly_emi: number;
  interest_rate_pct?: number;
  sort_order?: number;
}

export interface ProtectionData {
  life_cover_amount?: number;
  life_premium_annual?: number;
  health_cover_amount?: number;
  health_premium_annual?: number;
  ci_cover_amount?: number;
  has_term_plan?: boolean;
  has_health_cover?: boolean;
  notes?: string;
}

export interface GoalRow {
  goal_type?: 'retirement' | 'education' | 'house' | 'wedding' | 'emergency' | 'vehicle' | 'travel' | 'custom';
  name: string;
  target_amount: number;
  timeline_years: number;
  priority?: number;
  notes?: string;
  sort_order?: number;
}

interface SaveSnapshotParams {
  contact_id: number;
  status: 'draft' | 'active';
  risk_profile?: 'conservative' | 'moderate' | 'aggressive';
  notes?: string;
  income?: IncomeRow[];
  expenses?: ExpenseRow[];
  assets?: AssetRow[];
  liabilities?: LiabilityRow[];
  protection?: ProtectionData;
  goals?: GoalRow[];
}

interface SaveSnapshotResult {
  snapshot: {
    id: number;
    contact_id: number;
    version_number: number;
    status: string;
    calc_monthly_income: number | null;
    calc_net_worth: number | null;
    calc_savings_rate_pct: number | null;
    calc_dti_pct: number | null;
  };
  recipe: 'snapshot-view';
}

// ── Metric computation ─────────────────────────────────────────────────────

function computeMetrics(params: SaveSnapshotParams) {
  const income   = params.income   ?? [];
  const expenses = params.expenses ?? [];
  const assets   = params.assets   ?? [];
  const liabs    = params.liabilities ?? [];

  const monthlyIncome   = income.reduce((s, r) => s + (r.amount_monthly ?? 0), 0);
  const monthlyExpenses = expenses.reduce((s, r) => s + (r.amount_monthly ?? 0), 0);
  const monthlySavings  = monthlyIncome - monthlyExpenses;
  const savingsRate     = monthlyIncome > 0
    ? Math.round((monthlySavings / monthlyIncome) * 10000) / 100  // 2dp
    : null;

  const totalAssets      = assets.reduce((s, r) => s + (r.current_value ?? 0), 0);
  const totalLiabilities = liabs.reduce((s, r) => s + (r.outstanding_amount ?? 0), 0);
  const netWorth         = totalAssets - totalLiabilities;

  const totalEmi = liabs.reduce((s, r) => s + (r.monthly_emi ?? 0), 0);
  const dti      = monthlyIncome > 0
    ? Math.round((totalEmi / monthlyIncome) * 10000) / 100
    : null;

  const liquidAssets     = assets.filter(a => a.is_liquid).reduce((s, r) => s + (r.current_value ?? 0), 0);
  const liquidityMonths  = monthlyExpenses > 0
    ? Math.round((liquidAssets / monthlyExpenses) * 10) / 10  // 1dp
    : null;

  return {
    calc_monthly_income:   monthlyIncome   || null,
    calc_monthly_expenses: monthlyExpenses || null,
    calc_monthly_savings:  monthlySavings  || null,
    calc_savings_rate_pct: savingsRate,
    calc_total_assets:     totalAssets     || null,
    calc_total_liabilities:totalLiabilities|| null,
    calc_net_worth:        netWorth        || null,
    calc_total_emi:        totalEmi        || null,
    calc_dti_pct:          dti,
    calc_liquid_assets:    liquidAssets    || null,
    calc_liquidity_months: liquidityMonths,
  };
}

// ── Main function ──────────────────────────────────────────────────────────

export async function save_snapshot(
  params: SaveSnapshotParams,
  ctx: SkillContext
): Promise<SaveSnapshotResult> {

  const { contact_id, status, risk_profile, notes,
          income = [], expenses = [], assets = [],
          liabilities = [], protection, goals = [] } = params;

  // 1. Verify contact belongs to this tenant
  const contactCheck = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_contacts
     WHERE id = $contact_id AND tenant_id = $tenant_id
       AND is_live = $is_live AND is_active = true`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );
  if (!contactCheck.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  // 2. Precompute metrics from input
  const metrics = computeMetrics(params);

  // 3. Protection ratio (life cover / annual income)
  const protectionRatio = protection?.life_cover_amount && metrics.calc_monthly_income
    ? Math.round((protection.life_cover_amount / (metrics.calc_monthly_income * 12)) * 100) / 100
    : null;

  const result = await ctx.db.transaction(async (tx) => {

    // 4. Find existing draft for this contact
    const draftRes = await tx.query<{ id: number; version_number: number }>(
      `SELECT id, version_number FROM ki_contact_snapshots
       WHERE contact_id = $contact_id AND tenant_id = $tenant_id
         AND is_live = $is_live AND status = 'draft'`,
      { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
    );
    const existingDraft = draftRes.rows[0] ?? null;

    let snapshotId: number;
    let versionNumber: number;

    if (status === 'active') {
      // Archive the current active snapshot (if any)
      await tx.query(
        `UPDATE ki_contact_snapshots
         SET status = 'archived', updated_at = now()
         WHERE contact_id = $contact_id AND tenant_id = $tenant_id
           AND is_live = $is_live AND status = 'active'`,
        { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
      );
    }

    if (existingDraft) {
      // Update the existing draft header
      snapshotId    = existingDraft.id;
      versionNumber = existingDraft.version_number;

      await tx.query(
        `UPDATE ki_contact_snapshots SET
           status                  = $status,
           risk_profile            = $risk_profile,
           notes                   = $notes,
           calc_monthly_income     = $calc_monthly_income,
           calc_monthly_expenses   = $calc_monthly_expenses,
           calc_monthly_savings    = $calc_monthly_savings,
           calc_savings_rate_pct   = $calc_savings_rate_pct,
           calc_total_assets       = $calc_total_assets,
           calc_total_liabilities  = $calc_total_liabilities,
           calc_net_worth          = $calc_net_worth,
           calc_total_emi          = $calc_total_emi,
           calc_dti_pct            = $calc_dti_pct,
           calc_liquid_assets      = $calc_liquid_assets,
           calc_liquidity_months   = $calc_liquidity_months,
           submitted_at            = CASE WHEN $status = 'active' THEN now() ELSE submitted_at END,
           updated_at              = now()
         WHERE id = $id`,
        {
          $id:     snapshotId,
          $status: status,
          $risk_profile: risk_profile ?? null,
          $notes:        notes ?? null,
          ...metrics,
        }
      );

    } else {
      // Create a new snapshot header
      const versionRes = await tx.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM ki_contact_snapshots
         WHERE contact_id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live`,
        { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
      );
      versionNumber = versionRes.rows[0].next_version;

      const insertRes = await tx.query<{ id: number }>(
        `INSERT INTO ki_contact_snapshots
           (tenant_id, contact_id, is_live, version_number, status,
            created_by_user_id, risk_profile, notes,
            calc_monthly_income, calc_monthly_expenses, calc_monthly_savings,
            calc_savings_rate_pct, calc_total_assets, calc_total_liabilities,
            calc_net_worth, calc_total_emi, calc_dti_pct,
            calc_liquid_assets, calc_liquidity_months,
            submitted_at)
         VALUES
           ($tenant_id, $contact_id, $is_live, $version_number, $status,
            $created_by_user_id, $risk_profile, $notes,
            $calc_monthly_income, $calc_monthly_expenses, $calc_monthly_savings,
            $calc_savings_rate_pct, $calc_total_assets, $calc_total_liabilities,
            $calc_net_worth, $calc_total_emi, $calc_dti_pct,
            $calc_liquid_assets, $calc_liquidity_months,
            CASE WHEN $status = 'active' THEN now() ELSE NULL END)
         RETURNING id`,
        {
          $tenant_id:           ctx.tenant_id,
          $contact_id:          contact_id,
          $is_live:             ctx.is_live,
          $version_number:      versionNumber,
          $status:              status,
          $created_by_user_id:  ctx.user_id,
          $risk_profile:        risk_profile ?? null,
          $notes:               notes ?? null,
          ...metrics,
        }
      );
      snapshotId = insertRes.rows[0].id;
    }

    // 5. Replace all child rows for this snapshot
    // Delete existing children (idempotent — safe for both create and update paths)
    await tx.query(`DELETE FROM ki_snapshot_income       WHERE snapshot_id = $id`, { $id: snapshotId });
    await tx.query(`DELETE FROM ki_snapshot_expenses     WHERE snapshot_id = $id`, { $id: snapshotId });
    await tx.query(`DELETE FROM ki_snapshot_assets       WHERE snapshot_id = $id`, { $id: snapshotId });
    await tx.query(`DELETE FROM ki_snapshot_liabilities  WHERE snapshot_id = $id`, { $id: snapshotId });
    await tx.query(`DELETE FROM ki_snapshot_protection   WHERE snapshot_id = $id`, { $id: snapshotId });
    await tx.query(`DELETE FROM ki_snapshot_goals        WHERE snapshot_id = $id`, { $id: snapshotId });

    // Insert income rows
    for (const row of income) {
      await tx.query(
        `INSERT INTO ki_snapshot_income (snapshot_id, tenant_id, source, amount_monthly, notes)
         VALUES ($snapshot_id, $tenant_id, $source, $amount_monthly, $notes)`,
        {
          $snapshot_id:    snapshotId,
          $tenant_id:      ctx.tenant_id,
          $source:         row.source,
          $amount_monthly: row.amount_monthly,
          $notes:          row.notes ?? null,
        }
      );
    }

    // Insert expense rows
    for (const row of expenses) {
      await tx.query(
        `INSERT INTO ki_snapshot_expenses (snapshot_id, tenant_id, category, amount_monthly)
         VALUES ($snapshot_id, $tenant_id, $category, $amount_monthly)`,
        {
          $snapshot_id:    snapshotId,
          $tenant_id:      ctx.tenant_id,
          $category:       row.category,
          $amount_monthly: row.amount_monthly,
        }
      );
    }

    // Insert asset rows
    for (let i = 0; i < assets.length; i++) {
      const row = assets[i];
      await tx.query(
        `INSERT INTO ki_snapshot_assets
           (snapshot_id, tenant_id, asset_type_id, description, current_value, is_liquid, years_held, sort_order)
         VALUES ($snapshot_id, $tenant_id, $asset_type_id, $description, $current_value, $is_liquid, $years_held, $sort_order)`,
        {
          $snapshot_id:   snapshotId,
          $tenant_id:     ctx.tenant_id,
          $asset_type_id: row.asset_type_id,
          $description:   row.description ?? null,
          $current_value: row.current_value,
          $is_liquid:     row.is_liquid,
          $years_held:    row.years_held ?? null,
          $sort_order:    row.sort_order ?? i + 1,
        }
      );
    }

    // Insert liability rows
    for (let i = 0; i < liabilities.length; i++) {
      const row = liabilities[i];
      await tx.query(
        `INSERT INTO ki_snapshot_liabilities
           (snapshot_id, tenant_id, liability_type_id, description,
            outstanding_amount, monthly_emi, interest_rate_pct, sort_order)
         VALUES ($snapshot_id, $tenant_id, $liability_type_id, $description,
                 $outstanding_amount, $monthly_emi, $interest_rate_pct, $sort_order)`,
        {
          $snapshot_id:        snapshotId,
          $tenant_id:          ctx.tenant_id,
          $liability_type_id:  row.liability_type_id,
          $description:        row.description ?? null,
          $outstanding_amount: row.outstanding_amount,
          $monthly_emi:        row.monthly_emi,
          $interest_rate_pct:  row.interest_rate_pct ?? null,
          $sort_order:         row.sort_order ?? i + 1,
        }
      );
    }

    // Insert protection row (if provided)
    if (protection) {
      await tx.query(
        `INSERT INTO ki_snapshot_protection
           (snapshot_id, tenant_id,
            life_cover_amount, life_premium_annual,
            health_cover_amount, health_premium_annual,
            ci_cover_amount, protection_ratio,
            has_term_plan, has_health_cover, notes)
         VALUES
           ($snapshot_id, $tenant_id,
            $life_cover_amount, $life_premium_annual,
            $health_cover_amount, $health_premium_annual,
            $ci_cover_amount, $protection_ratio,
            $has_term_plan, $has_health_cover, $notes)`,
        {
          $snapshot_id:         snapshotId,
          $tenant_id:           ctx.tenant_id,
          $life_cover_amount:   protection.life_cover_amount   ?? null,
          $life_premium_annual: protection.life_premium_annual ?? null,
          $health_cover_amount: protection.health_cover_amount ?? null,
          $health_premium_annual: protection.health_premium_annual ?? null,
          $ci_cover_amount:     protection.ci_cover_amount     ?? null,
          $protection_ratio:    protectionRatio,
          $has_term_plan:       protection.has_term_plan   ?? false,
          $has_health_cover:    protection.has_health_cover ?? false,
          $notes:               protection.notes            ?? null,
        }
      );
    }

    // Insert goal rows
    for (let i = 0; i < goals.length; i++) {
      const row = goals[i];
      await tx.query(
        `INSERT INTO ki_snapshot_goals
           (snapshot_id, tenant_id, goal_type, name, target_amount,
            timeline_years, priority, notes, sort_order)
         VALUES ($snapshot_id, $tenant_id, $goal_type, $name, $target_amount,
                 $timeline_years, $priority, $notes, $sort_order)`,
        {
          $snapshot_id:    snapshotId,
          $tenant_id:      ctx.tenant_id,
          $goal_type:      row.goal_type ?? 'custom',
          $name:           row.name,
          $target_amount:  row.target_amount,
          $timeline_years: row.timeline_years,
          $priority:       row.priority ?? 1,
          $notes:          row.notes ?? null,
          $sort_order:     row.sort_order ?? i + 1,
        }
      );
    }

    return { snapshotId, versionNumber };
  });

  return {
    snapshot: {
      id:                    result.snapshotId,
      contact_id:            contact_id,
      version_number:        result.versionNumber,
      status:                status,
      calc_monthly_income:   metrics.calc_monthly_income,
      calc_net_worth:        metrics.calc_net_worth,
      calc_savings_rate_pct: metrics.calc_savings_rate_pct,
      calc_dti_pct:          metrics.calc_dti_pct,
    },
    recipe: 'snapshot-view',
  };
}
