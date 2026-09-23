## Controls — projects-rail

*Design read:* utility rail; expression low, motion minimal, density compact
*Mode:* redesign

### project header — *rail.project.header* (disclosure-header)

*Visible in:* populated, long-content, narrow

- When collapsed, on desktop: expands children; selects the project and scopes the middle pane. (toggle, select)
- When expanded, on desktop: collapses children; selection unchanged. It never changes route; it never loses selection. (toggle)
- On narrow: opens the project in the drawer. (navigation)

*Always:* It never fires twice per activation; it never covers sibling hit rects.

### project chevron — *rail.project.chevron* (toggle)

*Visible in:* populated, long-content, narrow

- Activating the project chevron toggles children visibility only. (toggle)

*Always:* It never selects the project; it never changes route.
