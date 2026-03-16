---
name: df-remote
description: Activates remote mode for Claude Code sessions. Triggered by "leaving my desk", "enable remote", "going remote", "stepping away".
---

When the user wants to enable remote control of their Claude sessions:

1. Check if devflow-companion relay server is running:
   ```bash
   curl -sf http://localhost:3100/up > /dev/null 2>&1
   ```

2. If not running, tell the user to start DevFlow Companion.

3. Enable remote on the current session:
   ```bash
   curl -sf -X PATCH http://localhost:3100/api/v1/relay_sessions/current \
     -H "Authorization: Bearer $DEVFLOW_RELAY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"relay_session": {"remote_enabled": true}}'
   ```

4. Get the tunnel URL:
   ```bash
   TUNNEL_URL=$(curl -sf http://localhost:3100/api/v1/relay_sessions/tunnel_url \
     -H "Authorization: Bearer $DEVFLOW_RELAY_TOKEN" 2>/dev/null)
   ```

5. Display to user:
   - Tunnel URL (for phone browser)
   - QR code of the URL (use `qrencode` if available, otherwise just the URL)
   - Current session status
   - Autonomy level (default: assisted)
   - Offer to enable on all sessions or just current

6. Remind user: "I'll keep working. Safe actions auto-approve, risky ones wait for your phone."
