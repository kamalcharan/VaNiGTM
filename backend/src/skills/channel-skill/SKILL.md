---
name: channel-skill
version: 1.0.0
description: Outreach channel management — configure email, WhatsApp, and LinkedIn connections for GTM campaigns
tier: starter
default_recipe: channel-list
---

# Channel Skill

## Purpose
Manages outreach channel connections (email SMTP, WhatsApp Business API, LinkedIn). Channels are tenant-scoped and shared across campaigns. Each channel has connection config, health status, and aggregate send/reply stats.

## Functions

### get_channels
List all channels for the tenant.
- Parameters: channel_type (optional, string)
- Returns: { channels: [{ id, channel_type, name, status, config, total_sent, total_replies, last_tested_at, created_at }], recipe: 'channel-list' }

### get_channel
Single channel with full config.
- Parameters: channel_id (required, number)
- Returns: { channel: { id, channel_type, name, status, config, total_sent, total_replies, last_tested_at }, recipe: 'channel-detail' }

### create_channel
Create a new outreach channel.
- Parameters: channel_type (required, string), name (required, string), config (optional, object)
- Returns: { channel: { id, channel_type, name, status }, recipe: 'channel-card' }

### update_channel
Update channel name or config.
- Parameters: channel_id (required, number), name (optional, string), config (optional, object), status (optional, string)
- Returns: { channel: { id, name, status, updated_at }, recipe: 'channel-card' }

### delete_channel
Soft-delete a channel (sets is_active = false).
- Parameters: channel_id (required, number)
- Returns: { deleted: true, channel_id, recipe: 'confirmation' }

### test_channel
Mark a channel as tested (updates last_tested_at and optionally status).
- Parameters: channel_id (required, number), success (required, boolean)
- Returns: { channel: { id, status, last_tested_at }, recipe: 'channel-card' }
