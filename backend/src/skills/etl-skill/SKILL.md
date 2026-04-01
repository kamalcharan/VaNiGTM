---
name: etl-skill
version: 1.0.0
description: Data import pipeline, session management, cruise control (NAV/snapshots), and course correction (scheme migration)
tier: starter
default_recipe: data-table
---

# ETL Skill

## Purpose
End-to-end data operations for the distributor's workspace. Covers file upload → field mapping → validation → processing → results tracking. Also manages NAV downloads, portfolio snapshots, and scheme code migrations. This is the operational backbone — without ETL, the platform runs on seed data only.

Ported from kewalinvest: ImportDashboard, DataImport, CruiseControl, CourseCorrection.

## Functions

### get_import_sessions
Returns all import sessions for the tenant, with status and metrics.
- Parameters: type (optional, string: 'customer' | 'transaction' | 'bookmark' | 'scheme' | 'all', default 'all'), limit (optional, number, default 50)
- Returns: { sessions: [{ id, type, status, file_name, created_at, processed, successful, failed, duplicate }], total, recipe: 'data-table' }

### start_import
Initiates a new import session. Accepts file upload metadata and returns detected headers for field mapping.
- Parameters: file_id (required, string, from file upload API), import_type (required, string: 'customer' | 'transaction' | 'bookmark' | 'scheme')
- Returns: { session_id, detected_headers: string[], sample_rows: Record<string, string>[], suggested_mapping: Record<string, string>, recipe: 'import-wizard' }

### validate_mapping
Validates the user's field mapping before processing. Checks required fields, data type compatibility.
- Parameters: session_id (required, string), mapping (required, Record<string, string>)
- Returns: { valid: boolean, errors: [{ field, message }], warnings: [{ field, message }], record_count: number, recipe: 'import-wizard' }

### process_import
Triggers ETL processing for a validated session. Stages data, runs transformations, loads into target tables.
- Parameters: session_id (required, string)
- Returns: { session_id, status: 'processing', estimated_time_seconds: number, recipe: 'data-table' }
- Processing is async. Poll get_import_status for progress.

### get_import_status
Returns real-time progress for a processing session.
- Parameters: session_id (required, string)
- Returns: { session_id, status: 'processing' | 'completed' | 'failed', progress_pct: number, processed: number, successful: number, failed: number, duplicate: number, errors: [{ row, field, message }], recipe: 'data-table' }

### retry_failed
Reprocesses failed records from a completed session.
- Parameters: session_id (required, string)
- Returns: { session_id, retried: number, newly_successful: number, still_failed: number, recipe: 'data-table' }

### get_system_status
Cruise control dashboard — NAV download status, snapshot health, scheduler state.
- Parameters: none
- Returns: { nav_downloads: { last_run, status, schemes_updated }, snapshots: { total_customers, up_to_date, stale, missing }, scheduler: { active, next_run }, recipe: 'cruise-control' }

### execute_snapshot
Triggers portfolio snapshot generation for one or all customers.
- Parameters: client_id (optional, number, omit for all), backfill (optional, boolean, default false)
- Returns: { job_id, scope: 'single' | 'all', estimated_customers: number, recipe: 'data-table' }

### get_corrections
Lists all scheme code migration records with step-by-step status.
- Parameters: status (optional, string: 'pending' | 'completed' | 'rolled_back' | 'all', default 'all')
- Returns: { corrections: [{ id, source_scheme, target_scheme, customer_id, customer_name, status, steps: [{ step, status }], created_at }], total, recipe: 'course-correction' }

### execute_correction
Runs the 8-step scheme code migration for a customer.
- Parameters: customer_id (required, number), source_scheme_code (required, string), target_scheme_code (required, string)
- Returns: { correction_id, steps: [{ step, status, detail }], transactions_affected: number, recipe: 'course-correction' }
- Steps: check_existing → get_customer → get_source_scheme → get_target_scheme → count_transactions → backup → update → regenerate_snapshots

### rollback_correction
Undoes a completed scheme migration, restoring original scheme codes.
- Parameters: correction_id (required, string)
- Returns: { correction_id, status: 'rolled_back', transactions_restored: number, recipe: 'course-correction' }

## Import Types

### CustomerData
Fields: name, prefix, pan, iwell_code, dob, anniversary, status, family_id, email, mobile, whatsapp, address (line1, line2, city, state, pin, country)

### TransactionData
Fields: iwell_code, customer_name, txn_date, txn_type (purchase/redemption/sip/switch/swp/stp/dividend), amount, units, nav, scheme_name, scheme_code, folio, fund_name, category, stamp_duty, stt, tds, euin, arn, sip_reg_date, switch_in_scheme

### BookmarkData
Fields: scheme_code, isin, scheme_name

### SchemeData
Fields: amc_name, scheme_code, scheme_name, type, category, nav_name, min_amount, launch_date, closure_date, isin_growth, isin_dividend, isin_direct

## Constraints
- File upload (multipart/form-data) is handled by the API layer. ETL skill receives file_id referencing ki_file_uploads.
- Import is idempotent — duplicate detection by (tenant_id + import_type + unique key per type).
- All imported data gets tenant_id from SkillContext, never from the file.
- Snapshot generation and course correction are async jobs. Return job_id for polling.
- Course correction backup is mandatory before any data modification.
- Cruise control NAV downloads run on scheduler (7 AM IST daily). Manual trigger available.
