---
name: import-skill
version: 1.0.0
description: Data import from InvestWell, CAMS/Karvy CAS statements, and NSE order books
tier: starter
default_recipe: data-table
---

# Import Skill

## Purpose
Brings external data into KI-Prime. Supports the three most common data sources for Indian MFDs: InvestWell CSV exports, CAMS/Karvy Consolidated Account Statements (CAS) PDFs, and NSE order book exports. Import is the critical onboarding step — without it, everything runs on seed data.

## Functions

### import_investwell
Parses and imports an InvestWell CSV export file. Maps columns to KI-Prime schema.
- Parameters: file_path (required, string), client_id (optional, number, auto-detect from file if not provided)
- Returns: { imported_count, skipped_count, errors: [{ row, reason }], client_id, holdings_summary: { schemes, total_value }, recipe: 'data-table' }
- Reuse parsing logic patterns from existing KewalInvest MVP (InvestWell parser)

### import_cas
Parses a CAMS/Karvy CAS statement PDF and extracts transactions and holdings.
- Parameters: file_path (required, string), password (optional, string, CAS PDFs are often password-protected with PAN)
- Returns: { imported_count, clients_found: number, transactions_imported: number, holdings_snapshot: { schemes, total_value }, errors: [], recipe: 'data-table' }

### import_nse_transactions
Imports NSE order book data (CSV format).
- Parameters: file_path (required, string), client_id (required, number)
- Returns: { imported_count, skipped_count, date_range: { from, to }, errors: [], recipe: 'data-table' }

### reconcile_holdings
Matches imported data against existing holdings. Flags discrepancies for manual review.
- Parameters: client_id (required, number)
- Returns: { matched: number, mismatched: [{ scheme_name, imported_units, existing_units, difference }], new_schemes: [{ scheme_name, units }], removed_schemes: [{ scheme_name, units }], recipe: 'data-table' }

## Constraints
- File upload is handled by the API layer (multipart/form-data). Import skill receives the file path on server disk.
- CAS PDF parsing uses pdf-parse or pdfjs-dist. Password-protected PDFs require the password parameter.
- InvestWell CSV format varies by export version. Parser handles the 3 most common formats.
- Import is idempotent for the same file — duplicate detection by transaction date + scheme + amount.
- All imported data gets tenant_id from context, never from the file.
