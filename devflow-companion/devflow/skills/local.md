---
name: df-local
description: Deactivates remote mode. Triggered by "I'm back", "at my desk", "disable remote".
---

When the user returns to their desk:

1. Disable remote on current session:
   ```bash
   curl -sf -X PATCH http://localhost:3100/api/v1/relay_sessions/current \
     -H "Authorization: Bearer $DEVFLOW_RELAY_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"relay_session": {"remote_enabled": false}}'
   ```

2. Fetch summary of remote activity:
   ```bash
   curl -sf http://localhost:3100/api/v1/relay_sessions/current/remote_summary \
     -H "Authorization: Bearer $DEVFLOW_RELAY_TOKEN"
   ```

3. Display to user:
   - Number of events processed while away
   - Auto-approved actions count
   - Pending actions resolved count
   - Work summaries captured
   - Any failed or blocked actions that need attention
