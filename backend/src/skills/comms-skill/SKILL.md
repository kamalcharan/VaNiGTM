---
name: comms-skill
version: 1.0.0
description: Client communication via WhatsApp, email, and SMS — portfolio updates, goal reminders, market commentary
tier: professional
default_recipe: approval-card
---

# Comms Skill

## Purpose
Handles outbound communication to clients via their preferred channel. All messages go through an approval-card flow — VaNi drafts, distributor approves, then the message is sent. Never sends without explicit distributor confirmation.

## Functions

### send_portfolio_update
Sends formatted portfolio summary to a client's preferred channel.
- Parameters: client_id (required, number), channel (optional, string: 'whatsapp' | 'email' | 'sms', default client's preferred channel)
- Returns: { draft_message, channel, client_name, client_contact, recipe: 'approval-card' }
- Distributor reviews draft → approves → message sent

### send_goal_reminder
Sends goal progress nudge with actionable suggestion.
- Parameters: client_id (required, number), goal_id (required, number)
- Returns: { draft_message, goal_name, channel, client_name, recipe: 'approval-card' }

### send_market_update
Bulk market commentary to a segment of clients.
- Parameters: client_ids (required, number[]), message (required, string)
- Returns: { draft_message, recipient_count, channel_breakdown: { whatsapp, email, sms }, recipe: 'approval-card' }
- Max 100 recipients per call

### schedule_review
Creates a calendar event/reminder for a periodic review with a client.
- Parameters: client_id (required, number), date (required, string, ISO date), notes (optional, string)
- Returns: { review_id, client_name, date, reminder_set, recipe: 'stat-row' }

## Constraints
- ALL outbound messages require distributor approval via approval-card. No auto-send.
- WhatsApp: uses WhatsApp Business Cloud API with pre-approved HSM templates. Custom messages go through template approval.
- Email: uses transactional email service (SendGrid/Resend). HTML templates with distributor branding.
- SMS: limited to alerts and reminders. No marketing content per TRAI DND rules.
- Rate limits: 100 WhatsApp messages/day/distributor, 500 emails/day.
