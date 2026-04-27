---
name: gtm-analytics-skill
version: 1.0.0
description: GTM war room analytics — dashboard stats, channel performance, conversion funnels, agent runs, activity feed
tier: starter
default_recipe: war-room
---

# GTM Analytics Skill

## Purpose
Powers the War Room operational dashboard. Provides aggregated metrics, real-time activity feed, agent execution logs, channel performance comparisons, and conversion funnel data across all GTM campaigns.

## Functions

### get_dashboard_stats
Top-level KPI summary across all active campaigns.
- Parameters: none
- Returns: { total_contacts, total_engaged, reply_rate_pct, meetings_booked, active_campaigns, active_sequences, active_agents, recipe: 'war-room' }

### get_channel_performance
Performance comparison across email, WhatsApp, and LinkedIn.
- Parameters: campaign_id (optional, number), days (optional, number, default 30)
- Returns: { channels: [{ channel_type, total_sent, total_replied, total_opened, reply_rate, open_rate }], recipe: 'channel-comparison' }

### get_conversion_funnel
Pipeline funnel across all or a specific campaign.
- Parameters: campaign_id (optional, number)
- Returns: { stages: [{ stage, count, pct }], total, recipe: 'conversion-funnel' }

### get_sequence_performance
Performance table for all sequences (or filtered by campaign).
- Parameters: campaign_id (optional, number)
- Returns: { sequences: [{ id, name, campaign_name, status, contacts_count, step_count, avg_open_rate, avg_reply_rate }], recipe: 'sequence-table' }

### get_agent_runs
Paginated agent decision log with filters.
- Parameters: agent_type (optional, string), status (optional, string), campaign_id (optional, number), limit (optional, number), offset (optional, number)
- Returns: { runs: [{ id, agent_type, agent_name, action, status, duration_ms, campaign_name, inputs, outputs, started_at }], total, recipe: 'agent-runs' }

### get_activity_feed
Recent activity events for the war room live view.
- Parameters: event_type (optional, string), campaign_id (optional, number), limit (optional, number)
- Returns: { events: [{ id, event_type, summary, detail, campaign_id, created_at }], recipe: 'activity-feed' }

### get_metric_trends
Time-series metrics for trend sparklines and charts.
- Parameters: campaign_id (required, number), period (optional, string: daily|weekly), days (optional, number, default 30)
- Returns: { points: [{ period_start, emails_sent, emails_replied, open_rate, reply_rate, meetings_booked, total_contacts }], recipe: 'metric-trends' }
