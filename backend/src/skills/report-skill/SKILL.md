---
name: report-skill
version: 1.0.0
description: PDF report generation for client communications — portfolio statements, goal reports, capital gains, review decks
tier: professional
default_recipe: approval-card
---

# Report Skill

## Purpose
Generates branded PDF reports for distributor-to-client communications. Reports are generated via Puppeteer rendering HTML templates to PDF. Each report type has a pre-built HTML template with the distributor's branding.

## Functions

### generate_portfolio_report
Branded portfolio statement PDF with holdings, allocation, and performance.
- Parameters: client_id (required, number), period (optional, string: '1m' | '3m' | '6m' | '1y' | 'ytd', default '1y')
- Returns: { report_url, client_name, period, generated_at, page_count, recipe: 'approval-card' }
- Approval card lets distributor preview before sending to client

### generate_goal_report
Goal progress report with projections and recommendations.
- Parameters: client_id (required, number)
- Returns: { report_url, client_name, goals_covered, generated_at, recipe: 'approval-card' }

### generate_capital_gains
Capital gains statement for tax filing. Follows SEBI format guidelines.
- Parameters: client_id (required, number), financial_year (required, string, format 'YYYY-YY' e.g. '2025-26')
- Returns: { report_url, client_name, financial_year, ltcg_total, stcg_total, generated_at, recipe: 'approval-card' }

### generate_review_deck
Quarterly review presentation (PDF format) with portfolio performance, goal progress, and VaNi recommendations.
- Parameters: client_id (required, number), quarter (optional, string: 'Q1' | 'Q2' | 'Q3' | 'Q4', default current quarter)
- Returns: { report_url, client_name, quarter, slide_count, generated_at, recipe: 'approval-card' }

## Constraints
- Report generation is async (BullMQ job). Returns a job ID immediately; PDF URL available when job completes.
- Enterprise tier: white-label branding (distributor's logo, colors, disclaimer). Professional: Vikuna-branded template with distributor name.
- Reports stored in cloud storage (S3-compatible), URLs valid for 7 days.
- Capital gains calculation uses FIFO method per SEBI guidelines.
