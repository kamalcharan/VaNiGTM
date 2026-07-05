/**
 * KI-Prime — Service URL Registry
 *
 * Single source of truth for all API endpoints.
 * Every hook calls api-client.ts which reads from here.
 * No .tsx file ever constructs a URL manually.
 *
 * NLP-ready: each entry has a description field that
 * VaNi can introspect for intent mapping.
 *
 * Path params use :param syntax (resolved by api-client).
 */

export interface ServiceEndpoint {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly auth: boolean;
  readonly description: string;
}

export const API = {

  /* ── Auth ──────────────────────────────────────────── */

  auth: {
    register: {
      method: 'POST',
      path: '/api/v1/auth/register',
      auth: false,
      description: 'Register a new user and create a tenant workspace',
    },
    login: {
      method: 'POST',
      path: '/api/v1/auth/login',
      auth: false,
      description: 'Sign in with email and password',
    },
    me: {
      method: 'GET',
      path: '/api/v1/auth/me',
      auth: true,
      description: 'Get current user profile, tenant, and onboarding status',
    },
    refresh: {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      auth: false,
      description: 'Refresh access token using refresh token',
    },
    logout: {
      method: 'POST',
      path: '/api/v1/auth/logout',
      auth: true,
      description: 'Sign out and revoke current session',
    },
    forgotPassword: {
      method: 'POST',
      path: '/api/v1/auth/forgot-password',
      auth: false,
      description: 'Request a password reset link',
    },
    resetPassword: {
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      auth: false,
      description: 'Reset password using a reset token',
    },
    changePassword: {
      method: 'POST',
      path: '/api/v1/auth/change-password',
      auth: true,
      description: 'Change password while logged in',
    },
    preferences: {
      method: 'PATCH',
      path: '/api/v1/auth/preferences',
      auth: true,
      description: 'Update user preferences (theme, profile fields)',
    },
    sessionsRevoke: {
      method: 'POST',
      path: '/api/v1/auth/sessions/revoke',
      auth: false,
      description: 'Revoke active sessions (pre-login, requires email+password)',
    },
    sessionsList: {
      method: 'GET',
      path: '/api/v1/auth/sessions',
      auth: true,
      description: 'List all active sessions for current user',
    },
    switchEnv: {
      method: 'PATCH',
      path: '/api/v1/auth/switch-env',
      auth: true,
      description: 'Toggle live/sandbox environment — persists preference, issues new access token with updated is_live',
    },
  },

  /* ── Invitations ──────────────────────────────────── */

  invite: {
    send: {
      method: 'POST',
      path: '/api/v1/auth/invite',
      auth: true,
      description: 'Send team invitation(s) by email',
    },
    validate: {
      method: 'GET',
      path: '/api/v1/auth/invite/validate',
      auth: false,
      description: 'Validate an invitation token and get context',
    },
    accept: {
      method: 'POST',
      path: '/api/v1/auth/invite/accept',
      auth: false,
      description: 'Accept an invitation and create account or join tenant',
    },
    list: {
      method: 'GET',
      path: '/api/v1/auth/invitations',
      auth: true,
      description: 'List pending invitations for current tenant',
    },
    team: {
      method: 'GET',
      path: '/api/v1/auth/team',
      auth: true,
      description: 'List all active team members for current tenant with their roles',
    },
    revoke: {
      method: 'DELETE',
      path: '/api/v1/auth/invitations/:id',
      auth: true,
      description: 'Revoke a pending invitation',
    },
  },

  /* ── Onboarding ───────────────────────────────────── */

  onboarding: {
    status: {
      method: 'GET',
      path: '/api/v1/onboarding/status',
      auth: true,
      description: 'Get onboarding completion status and mandatory steps',
    },
    completeStep: {
      method: 'PATCH',
      path: '/api/v1/onboarding/step',
      auth: true,
      description: 'Mark an onboarding step as completed',
    },
  },

  /* ── Tenant ───────────────────────────────────────── */

  tenant: {
    profileGet: {
      method: 'GET',
      path: '/api/v1/tenant/profile',
      auth: true,
      description: 'Get tenant business profile',
    },
    profile: {
      method: 'PATCH',
      path: '/api/v1/tenant/profile',
      auth: true,
      description: 'Update tenant business profile (name, ARN, theme)',
    },
    setExtRefType: {
      method: 'PATCH',
      path: '/api/v1/tenant/ext-ref-type',
      auth: true,
      description: 'Set tenant platform/RTA type (one-time — CAMS, KFINTECH, IWELL, BSE_STAR, CUSTOM)',
    },
  },

  /* ── GTM Profile ──────────────────────────────────── */

  gtmProfile: {
    get: {
      method: 'GET',
      path: '/api/v1/profile/',
      auth: true,
      description: 'Get the current GTM profile',
    },
    update: {
      method: 'PUT',
      path: '/api/v1/profile/',
      auth: true,
      description: 'Update the GTM profile',
    },
    approve: {
      method: 'POST',
      path: '/api/v1/profile/approve',
      auth: true,
      description: 'Approve the current GTM profile',
    },
    history: {
      method: 'GET',
      path: '/api/v1/profile/history',
      auth: true,
      description: 'Get the GTM profile revision history',
    },
  },

  /* ── ETL ──────────────────────────────────────────── */

  etl: {
    upload: {
      method: 'POST',
      path: '/api/v1/etl/upload',
      auth: true,
      description: 'Upload a file for import (multipart/form-data)',
    },
    headers: {
      method: 'GET',
      path: '/api/v1/etl/headers/:fileId',
      auth: true,
      description: 'Detect headers and sample rows from uploaded file',
    },
    sessions: {
      method: 'GET',
      path: '/api/v1/etl/sessions',
      auth: true,
      description: 'List all import sessions',
    },
    createSession: {
      method: 'POST',
      path: '/api/v1/etl/sessions',
      auth: true,
      description: 'Create import session with field mapping and stage data',
    },
    process: {
      method: 'POST',
      path: '/api/v1/etl/sessions/:id/process',
      auth: true,
      description: 'Process staged data into target table',
    },
    status: {
      method: 'GET',
      path: '/api/v1/etl/sessions/:id/status',
      auth: true,
      description: 'Get import session status and progress',
    },
    records: {
      method: 'GET',
      path: '/api/v1/etl/sessions/:id/records',
      auth: true,
      description: 'Get paginated staging records for a session',
    },
    reprocess: {
      method: 'POST',
      path: '/api/v1/etl/sessions/:id/reprocess',
      auth: true,
      description: 'Reprocess failed records in a session',
    },
    deleteStaging: {
      method: 'DELETE',
      path: '/api/v1/etl/sessions/:id/staging',
      auth: true,
      description: 'Delete staging data for a completed session',
    },
    patchRecord: {
      method: 'PATCH',
      path: '/api/v1/etl/sessions/:id/records/:recordId',
      auth: true,
      description: 'Edit mapped_data for one staging record and reprocess it immediately',
    },
    syncStats: {
      method: 'POST',
      path: '/api/v1/etl/sessions/:id/sync-stats',
      auth: true,
      description: 'Reconcile session counters (successful/failed/duplicate/orphan) from actual staging row statuses',
    },
    rebuildHoldings: {
      method: 'POST',
      path: '/api/v1/etl/rebuild-holdings',
      auth: true,
      description: 'Recompute ki_holdings units and invested amounts from all transactions for this tenant/environment',
    },
  },

  /* ── NAV ──────────────────────────────────────────── */

  nav: {
    bookmarks: {
      method: 'GET',
      path: '/api/v1/nav/bookmarks',
      auth: true,
      description: 'List bookmarked schemes with NAV status',
    },
    addBookmark: {
      method: 'POST',
      path: '/api/v1/nav/bookmarks',
      auth: true,
      description: 'Bookmark a scheme for NAV tracking',
    },
    bookmarkImport: {
      method: 'POST',
      path: '/api/v1/nav/bookmarks/import',
      auth: true,
      description: 'Bulk import bookmarks from uploaded file — reuses single-add upsert + alias seed',
    },
    removeBookmark: {
      method: 'DELETE',
      path: '/api/v1/nav/bookmarks/:schemeCode',
      auth: true,
      description: 'Remove a scheme bookmark',
    },
    downloadDaily: {
      method: 'POST',
      path: '/api/v1/nav/download/daily',
      auth: true,
      description: 'Download daily NAV for all bookmarked schemes',
    },
    downloadScheme: {
      method: 'POST',
      path: '/api/v1/nav/download/scheme/:code',
      auth: true,
      description: 'Download historical NAV for a specific scheme',
    },
    schemeDetail: {
      method: 'GET',
      path: '/api/v1/nav/scheme/:code',
      auth: true,
      description: 'Full scheme detail with metrics, gaps, bookmark status',
    },
    downloadGap: {
      method: 'POST',
      path: '/api/v1/nav/download/gap/:code',
      auth: true,
      description: 'Download only missing NAV gaps for a scheme',
    },
    downloadAll: {
      method: 'POST',
      path: '/api/v1/nav/download/all',
      auth: true,
      description: 'Download full history for all bookmarked schemes',
    },
    downloadGapAll: {
      method: 'POST',
      path: '/api/v1/nav/download/gap/all',
      auth: true,
      description: 'Fill NAV gaps for all bookmarked schemes',
    },
    status: {
      method: 'GET',
      path: '/api/v1/nav/status',
      auth: true,
      description: 'Cruise control NAV status for all bookmarks',
    },
    calculateMetrics: {
      method: 'POST',
      path: '/api/v1/nav/metrics/:code',
      auth: true,
      description: 'Calculate metrics for a specific scheme',
    },
    calculateMetricsBulk: {
      method: 'POST',
      path: '/api/v1/nav/metrics/bulk',
      auth: true,
      description: 'Calculate metrics for all schemes with NAV data',
    },

    /* ── Global bulk jobs (background, polled) ── */
    globalJobDownload: {
      method: 'POST',
      path: '/api/v1/nav/global/jobs/download',
      auth: true,
      description: 'Start background job: download NAV for all active schemes with no data',
    },
    globalJobRedownload: {
      method: 'POST',
      path: '/api/v1/nav/global/jobs/redownload',
      auth: true,
      description: 'Start background job: delete + redownload NAV for all schemes with data',
    },
    globalJobMetrics: {
      method: 'POST',
      path: '/api/v1/nav/global/jobs/metrics',
      auth: true,
      description: 'Start background job: calculate metrics for all schemes with stale/missing metrics',
    },
    globalJobRecalc: {
      method: 'POST',
      path: '/api/v1/nav/global/jobs/recalc',
      auth: true,
      description: 'Start background job: clear and recalculate all scheme metrics',
    },
    globalJobStatus: {
      method: 'GET',
      path: '/api/v1/nav/global/jobs/:jobId',
      auth: true,
      description: 'Poll global bulk job progress by job ID',
    },

    /* ── Bookmark alias (per-tenant display name) ──── */
    updateBookmarkAlias: {
      method: 'PATCH',
      path: '/api/v1/nav/bookmarks/:schemeCode/alias',
      auth: true,
      description: 'Set or clear the display alias for a bookmarked scheme',
    },

    /* ── Scheme aliases (global import matching) ───── */
    aliases: {
      method: 'GET',
      path: '/api/v1/nav/aliases',
      auth: true,
      description: 'List global scheme aliases, optionally filtered by scheme_code or query',
    },
    createAlias: {
      method: 'POST',
      path: '/api/v1/nav/aliases',
      auth: true,
      description: 'Create a single global scheme alias',
    },
    bulkCreateAliases: {
      method: 'POST',
      path: '/api/v1/nav/aliases/bulk',
      auth: true,
      description: 'Bulk-create aliases for one scheme (used on bookmark add and import)',
    },
    deleteAlias: {
      method: 'DELETE',
      path: '/api/v1/nav/aliases/:id',
      auth: true,
      description: 'Soft-delete a global scheme alias',
    },
    startBackfill: {
      method: 'POST',
      path: '/api/v1/nav/aliases/backfill',
      auth: true,
      description: 'Start async alias backfill — seeds missing aliases for all ki_schemes',
    },
    backfillProgress: {
      method: 'GET',
      path: '/api/v1/nav/aliases/backfill/progress',
      auth: true,
      description: 'Poll backfill progress: status, current, total, created, skipped, percent',
    },
    cancelBackfill: {
      method: 'POST',
      path: '/api/v1/nav/aliases/backfill/cancel',
      auth: true,
      description: 'Cancel a running alias backfill',
    },
  },

  /* ── Market Indices ───────────────────────────────── */

  market: {
    indices: {
      method: 'GET',
      path: '/api/v1/market/indices',
      auth: true,
      description: 'List all NSE market indices with download and metrics status',
    },
    indexDetail: {
      method: 'GET',
      path: '/api/v1/market/indices/:id',
      auth: true,
      description: 'Get single market index details',
    },
    indexData: {
      method: 'GET',
      path: '/api/v1/market/data/:indexId',
      auth: true,
      description: 'Get paginated OHLCV data for a market index',
    },
    latestData: {
      method: 'GET',
      path: '/api/v1/market/data/:indexId/latest',
      auth: true,
      description: 'Get the most recent OHLCV data point for a market index',
    },
    downloadHistorical: {
      method: 'POST',
      path: '/api/v1/market/download/historical',
      auth: true,
      description: 'Trigger historical OHLCV download from Yahoo Finance for one index',
    },
    downloadEod: {
      method: 'POST',
      path: '/api/v1/market/download/eod',
      auth: true,
      description: 'Trigger end-of-day download for one market index',
    },
    downloadEodAll: {
      method: 'POST',
      path: '/api/v1/market/download/eod-all',
      auth: true,
      description: 'Trigger EOD download for all active market indices',
    },
    statistics: {
      method: 'GET',
      path: '/api/v1/market/statistics',
      auth: true,
      description: 'Aggregate statistics: total indices, with/without data, records count',
    },
    detailedStatus: {
      method: 'GET',
      path: '/api/v1/market/detailed-status',
      auth: true,
      description: 'Per-index download status, metrics status, latest close — used by Market History page',
    },
    jobStatus: {
      method: 'GET',
      path: '/api/v1/market/jobs/:jobId',
      auth: true,
      description: 'Poll the status of a running market download or metrics job',
    },
  },

  /* ── Market Analysis ──────────────────────────────── */

  marketAnalysis: {
    calculate: {
      method: 'POST',
      path: '/api/v1/market-analysis/calculate/:indexId',
      auth: true,
      description: 'Calculate metrics for one market index using PL/pgSQL RPC',
    },
    bulkCalculate: {
      method: 'POST',
      path: '/api/v1/market-analysis/bulk-calculate',
      auth: true,
      description: 'Calculate metrics for multiple indices (or all if no ids provided)',
    },
    metrics: {
      method: 'GET',
      path: '/api/v1/market-analysis/metrics/:indexId',
      auth: true,
      description: 'Get latest calculated metrics for a market index',
    },
    indexReturns: {
      method: 'GET',
      path: '/api/v1/market-analysis/index-returns/:indexId',
      auth: true,
      description: 'Time-series OHLCV + returns data for charting (daily/weekly/monthly granularity)',
    },
    dashboardStatistics: {
      method: 'GET',
      path: '/api/v1/market-analysis/dashboard-statistics',
      auth: true,
      description: 'Market dashboard KPIs: best/worst/most volatile + performance heatmap per index',
    },
  },

  /* ── Master Data (admin only) ────────────────────── */

  masterData: {
    transactionTypes: {
      method: 'GET',
      path: '/api/v1/master-data/transaction-types',
      auth: true,
      description: 'List all transaction types',
    },
    updateTransactionType: {
      method: 'PATCH',
      path: '/api/v1/master-data/transaction-types/:id',
      auth: true,
      description: 'Update a transaction type (name, description, active toggle)',
    },
    assetTypes: {
      method: 'GET',
      path: '/api/v1/master-data/asset-types',
      auth: true,
      description: 'List all asset types',
    },
    updateAssetType: {
      method: 'PATCH',
      path: '/api/v1/master-data/asset-types/:id',
      auth: true,
      description: 'Update an asset type (name, assumption rate, active toggle)',
    },
    bookmarkReasons: {
      method: 'GET',
      path: '/api/v1/master-data/bookmark-reasons',
      auth: true,
      description: 'List bookmark reasons for current tenant + environment',
    },
    createBookmarkReason: {
      method: 'POST',
      path: '/api/v1/master-data/bookmark-reasons',
      auth: true,
      description: 'Create a new bookmark reason for current tenant',
    },
    updateBookmarkReason: {
      method: 'PATCH',
      path: '/api/v1/master-data/bookmark-reasons/:id',
      auth: true,
      description: 'Update a bookmark reason (label, order, active toggle)',
    },
    jobTypes: {
      method: 'GET',
      path: '/api/v1/master-data/job-types',
      auth: true,
      description: 'List all job types with current tenant scheduler config',
    },
    updateJobConfig: {
      method: 'PATCH',
      path: '/api/v1/master-data/job-configs/:id',
      auth: true,
      description: 'Update tenant scheduler config for a job (cron, enabled toggle)',
    },
    extRefTypes: {
      method: 'GET',
      path: '/api/v1/master-data/ext-ref-types',
      auth: true,
      description: 'List all external reference types (CAMS, KFINTECH, IWELL, BSE_STAR, CUSTOM)',
    },
  },

  /* ── Public Intake (no auth — token-based) ────────── */

  intake: {
    validate: {
      method: 'POST',
      path: '/api/v1/intake/validate',
      auth: false,
      description: 'Validate an intake token, return tenant brand + contact pre-fill',
    },
    submit: {
      method: 'POST',
      path: '/api/v1/intake/submit',
      auth: false,
      description: 'Submit a filled financial snapshot via intake token',
    },
  },

  /* ── Skills (generic) ─────────────────────────────── */

  skills: {
    execute: {
      method: 'POST',
      path: '/api/v1/skills/:skill/:fn',
      auth: true,
      description: 'Execute a skill function with parameters',
    },
  },

} as const;

/**
 * Type helper — extract the keys for a given service group.
 * Useful for NLP intent mapping.
 */
export type ApiGroup = keyof typeof API;
export type ApiEndpoint<G extends ApiGroup> = keyof (typeof API)[G];
