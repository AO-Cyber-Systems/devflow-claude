# Assessment — headless / generative UI for the Trades re-work

**Status: DECISION DEFERRED.** Commitment is held until wave 1★'s dogfood reports. This
document records what was measured, what it implies, and — most importantly — **what evidence
would change the answer**, so the deferral is a scheduled decision rather than an open question.

**Asked:** 2026-09-23, by Mark — *"The trades UI re-work needs to be assessed and potentially
replanned against a headless UI concept where the conversation agent can load UIs on the fly to
display data and/or support CRUD."*

**Assessed against:** the current plan, which ports the Trades React app to Flutter as ~47
hand-built routes, with that port as the Trades SaaS release gate and the Surface Spec
(`PROPOSAL-ui-oracle-loop.md`) as the per-surface contract.

---

## 1. The short version

Generating the easy screens does not remove a single hard one. The generatable share of Trades
is real but it is not the expensive share, and three cross-cutting properties — offline,
optimistic updates, and fail-closed authorization — are global to the app rather than confined
to particular routes. A runtime composer has to reproduce all three or it is not a UI decision,
it is a correctness and security decision.

The idea has a genuine home, but it is a **smaller and additive** one: inline, ephemeral,
agent-scoped views inside the conversation surface. That home does not touch the port, does not
need an offline story, and is exactly what the catalog and the machine-checkable contract are
already being built for.

---

## 2. What was measured

Every figure below was verified directly against the repository, not estimated.

### 2.1 Route inventory — 47 route elements, 44 distinct screens

| Bucket | Routes | What it means |
|---|---|---|
| Formulaic CRUD | 14 | list / detail / create-edit over one entity |
| Composite but regular | 19 | dashboards, filtered or grouped lists, multi-entity detail |
| **Genuinely bespoke** | **11** | canvases, boards, maps, capture, real-time |
| Trivial / alias | 3 | redirects and the 404 |

### 2.2 The ratio flips when weighted by code

Bespoke is 23% of routes — and **~80,000 of 269,932 non-test lines, about 30% of the UI code.**
The bespoke routes are the big ones:

| Screen | Evidence |
|---|---|
| Schedule | `scheduling/EnhancedCalendar.tsx` — **5,725 lines, the single largest component in the app** — plus `Schedule.tsx` (3,894), drag panels, optimistic appointment moves |
| Tasks | `TasksView.tsx` — **3,678 lines**; kanban, WebSocket channel, signature capture, photo capture with offline staging |
| Forefront | `Forefront.tsx` (2,065) + `forefront/` (6,843); **five different role panels chosen at runtime**, one embedding a live dispatch map over WebSocket |
| Process Builder | ReactFlow node/edge canvas; `processes/` 13,311 LOC |
| Workflow Automation | a second canvas; `workflow/` 5,429 |
| Maintenance | drag-and-drop weekly dispatch board |
| Map | full-screen Google Maps + truck-dispatch sidebar |
| Customer portal signing | signature-pad canvas, from an unauthenticated token context |

A renderer that handled buckets A and B perfectly would leave every one of these to be built by
hand — that is, the most differentiated and most daily-used surfaces in the product.

### 2.3 Three properties that are global, not per-route

**Offline (~11.5k lines).** `offlineSync` (1,929), `predictiveSync` (917), `syncManager`,
`mobileOfflineService`, `queryPersistence`, `offlineAuth`, `offlineSearchService`,
`queryClient` (1,217), `OfflineContext` — plus `components/sync/` (3,717) for banners, conflict
dialogs, a pending-queue drawer and a `SyncInitializationGuard` wrapping the whole app. Trades
is a Tauri/PWA field app. **A screen composed at runtime has no definition to render when the
server is unreachable.** Schedule carries its own offline-cached-range tests.

**Optimistic updates.** `onMutate` across 11 non-test files, concentrated in every
drag-and-drop path.

**Authorization is fail-closed and layered — this is the strongest objection.**
`config/routePermissions.ts` is 672 lines with 96 `can*` references, and `ProtectedRoute` adds
two further gates (role nav-hide also gating direct URL access, and a field-view gate). Its
default is explicit:

> `// No permission config for this route — deny access (fail-closed)`

A runtime composer that decides what to render must reproduce all three gates exactly. If it
does not, generative UI is not a slower UI — **it is an authorization bypass.** That moves this
from an effort question to a security question.

### 2.4 The conversation agent is further away than it looks

eden-biz has a real tool loop (8,764 lines) with a 29-adapter code-defined allowlist — but
**no Trades tools**, a `ConverseResponse` carrying a single `agent_text` string, a Flutter chat
that renders it with `Text`/`SelectableText`, a unary rather than streaming Converse, and a
shadow-mode posture in which a human reviews and explicitly sends every reply. Returning a
*component* is entirely new work, not an extension.

### 2.5 The catalog is not yet a renderer

364 exported widgets against **11 with stories (3%)**. The ten "patterns" are prose documents,
not components. `EdenDataGrid` — the single most important CRUD component — requires Dart
closures per column, making the most needed piece the least describable by data.

### 2.6 Prior art points the same way

- **Vercel AI SDK RSC**, the canonical generative-UI implementation, is marked experimental with
  production users steered to the non-generative path.
- **Spotify's HubFramework**, a generic component-driven UI framework, is deprecated — for
  precisely the over-abstraction being proposed.
- Server-driven UI (Retool / Salesforce / ServiceNow) is the proven, *deterministic* version of
  this idea, and is a different proposal from agent-generated UI.

---

## 3. What this does to the Surface Spec

Three readings were considered. The most defensible is the third.

1. *Invalidated* — you cannot hand-author a spec for a screen that does not exist until runtime,
   and `acceptance.locked_sheet` has nothing stable to hash. True of the **artifact**.
2. *Moves up a level* — you spec components and composition rules rather than screens.
3. **More necessary, implemented by (2).** A generated screen has no author and no reviewer. The
   only thing standing between a user and a wrong screen is a machine-checkable contract
   evaluated before render.

Tonight's evidence supports (3) directly. On 2026-09-23 a one-line break in `eden-ui-flutter`
killed four nav buttons and the oracle went **fully green** — a real contrast violation
*disappeared*, because the guideline locates its subject by hit test. An instrument that
locates its subject by touching it cannot distinguish "nothing wrong" from "nothing there"
(§7.5, `inert`). If a human never reviews generated output, that class of blind spot is the
whole safety story.

---

## 4. Options considered

| Option | Verdict |
|---|---|
| **A. Replace the port with generative UI** | Not recommended. Leaves every hard screen hand-built, has no offline answer, and must reproduce three fail-closed authz gates or become a bypass. |
| **B. Additive agent surface** — inline views and forms inside the conversation, from a closed specced vocabulary | The strongest version of the idea. Online-only by nature, additive, no release-gate risk, builds on W1a/W1b. |
| **C. Schema-driven CRUD, hand-built rest** — developer-authored schemas for the ~14 formulaic routes | Proven and deterministic, but you take ownership of a UI framework alongside the app. Revisit if porting cost proves to be the binding constraint. |
| **D. Defer pending evidence** | **CHOSEN.** |

---

## 5. The decision, and what would change it

**Deferred until wave 1★'s dogfood reports.** That dogfood — spec → look-lock → conform on
`projects-rail` — is the experiment built to answer whether the spec-and-verify loop actually
shortens UI cycles. Replanning before it reports discards the evidence the programme was
designed to produce. Its verdict also bears directly on the harder question underneath: *can a
screen no human authored ever be trusted?* If a machine-checkable contract cannot yet be shown
to catch defects on a screen we DID author, it cannot be relied on for one we did not.

**Evidence that would move the answer toward B:**
- W1★ shows the conform loop catching real defects without human review in the path.
- The agent gains Trades tools and a structured (non-string) response.
- A closed component vocabulary proves sufficient for a real read-only view end to end.

**Evidence that would move it toward C:**
- Porting cost on buckets A and B proves to be the binding constraint on the release date.

**Evidence that would revive A:**
- Field-offline ceases to be a requirement, **and** the authz gates are centralised server-side
  such that a composer cannot bypass them.

**What would make the answer *worse* than today:** committing before W1★, thereby spending the
programme's one designed experiment and inheriting a renderer, a blueprint schema, an action
vocabulary and a binding layer on top of the 11 bespoke screens that still need hand-building.

---

## 6. Questions the evidence cannot answer

1. Is field-offline a hard requirement of the Eden Biz / Trades SaaS release?
2. Is the goal to ship Trades, or to build a generative-UI capability? Both are legitimate; they
   produce different plans and should not be pursued under one name.
3. Who reviews a screen no human authored — and what is the recourse when it is wrong?
4. If a protocol is adopted: A2UI, Flutter `rfw`, or a bespoke schema? That choice decides
   whether this is *"adopt a protocol"* or *"invent a UI language"*.

---

*Evidence file: `trades-headless-ui-investigation.md` (750 lines, per-route inventory with file
and line citations). Figures in §2.2 and §2.3 independently re-verified against
`AOCyber-Trades/trades/client/` on 2026-09-23.*
