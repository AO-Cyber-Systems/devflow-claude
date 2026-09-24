# The headless agent ↔ UI contract

**Status: agreed 2026-09-24, unbuilt.** Agreed between the session owning the agent↔Biz side
(eden-biz: tool catalog, `agentloop`, principal and authorization, propose→approve) and the
session owning the UI foundations (eden-ui-flutter + devflow-claude: component catalog and
schema, renderer, component specification, visual gate).

Recorded here because an agreement that exists only in two conversations is not an agreement —
it is two recollections.

**Direction (Mark, 2026-09-24):** business administration and oversight move off wired UIs to a
headless agent; the user states an outcome conversationally and the agent spawns component UI to
get there. Curated experiences — field service, dispatch, POS — stay hand-built. See
`ASSESSMENT-headless-ui-for-trades.md` for the measurements that bound this.

---

## 1. The seam

The agent's response carries text plus zero or more **UI intents**:

```
{ component_id, data, actions[] }
```

These three fields are stable. The envelope around them — A2UI, Flutter `rfw`, or a bespoke
schema — is **deliberately not yet chosen**, and is swappable as long as the three fields hold.

**Why the format is not the first question.** The first question is whether the catalog can be a
renderer target, and on 2026-09-24 it cannot. Measured: `.story-coverage.json` reads
`{"exported_widgets": 364, "with_story": 11}`, and **all eleven are navigation chrome** —
`desktop-layout/default`, `desktop-layout/narrow`, `mobile-layout/default` and eight
`nav-item/*` variants. **Zero data-display components have a verified visual contract**: not a
list, table, card, form or detail view. Every component an intent would actually reach for has
no machine-checkable evidence of what it renders. Choosing a wire format before that is fixed
would mean agreeing a schema we cannot honour.

## 2. Invariants — agent side

1. The three fields stay stable; the envelope may change.
2. **`data` is built server-side only, from authorized tool observations.** The model never
   authors it. The renderer never fetches. There is no "just one live field" exception.
3. `data` is typed by the producing tool's `OutputSchema` — one schema from tool to component.
4. Actions bind to tool ids or `agentactions` proposal ids **only, never routes**. The server
   re-authorizes on every action.
5. The emitter has its own refusal path: an observation failing its schema produces an explicit
   **error intent**, never a silently dropped one.

**Invariant 2 is load-bearing and must stay hard to give up.** It is what makes a runtime
composer safe. The Trades assessment found the strongest objection to generative UI was not
effort but authorization: `config/routePermissions.ts` is 672 lines with 96 permission
references, and `ProtectedRoute` layers two further gates whose default is *"no permission config
for this route — deny access"*. A composer that decides what to render must reproduce all three
gates exactly or it **is an authorization bypass**. Never letting the renderer fetch sidesteps
that entirely.

Enforcement is structural rather than tested: a `data` value can only be constructed from an
**observation handle** — a type with no public constructor from a raw value — so an untraceable
field is unrepresentable, not merely asserted against. Proven by a differential control (make the
model author one field, record the test going red) rather than claimed.

## 3. Invariants — UI side

6. **The renderer has a visible refusal path.** An unknown `component_id`, or `data` failing the
   component's schema, renders a **loud failure** — never nothing. A blank card must be
   impossible to mistake for an empty result.
7. The known-ids list is a **generated artifact**, shipped from `eden-ui-flutter` beside
   `design/patterns.json` and `design/must_not_vocabulary.json` (both of which devflow's
   validator already reads). **Never hand-maintained** — a hand-maintained pattern catalogue
   claimed to carry "every `must_not` rule the docs state" and carried 2 of 78, because its
   freshness test compared the JSON to its generator's own input rather than to the source.
8. A component enters the list by having a **verified visual contract**, not by existing. Today
   that admits eleven components, none of which display data.

Rule 6 matters more here than anywhere else in the system, because a generated screen has **no
author and no reviewer** between the agent and the user. See `PROPOSAL-ui-oracle-loop.md` §22:
twelve measured cases in one day of a check reporting success because its failure mode and
success mode were indistinguishable — two of them inside gates written that same day to prevent
exactly that.

## 4. Refusal, and which side does it

Until the generated ids list is non-trivially populated, **refusal is one-sided — the
renderer's.** The agent emits `component_id` as a free string.

A two-sided refusal against today's list would refuse everything and make the fixtures
untestable. One-sided means the renderer's refusal path is exercised from day one, rather than
after there is something to lose. The agent adds its side when the UI side says the list is
worth checking against.

## 5. Fixtures

**Single source: `eden-biz` `go/internal/agentintent/testdata/`.** Recorded from the 16 `/mcp`
tools against their `OutputSchema`, run on a seeded local database — recorded outputs, not
hand-written.

Cross-repo means the UI side needs a copy. The copy is **accountable, not trusted**: it carries a
hash of the source set, and a test on the UI side fails when they diverge. The authoritative
direction — eden-biz → eden-ui-flutter — is stated in the copy itself, so nobody later edits the
wrong one.

Six cases: populated · empty · error/refusal · a large list · a proposal/approval action · **a
payload carrying a field the component schema does not expect**. The sixth is the case where
"render nothing" and "render fine" look identical, so it belongs in the set from the start.

## 6. What is not yet evidenced

The wave-1★ dogfood has not run. Until it does, the claim *"a machine-checkable contract catches
real defects without a human in the loop"* is **unproven**, and every "the renderer will verify
this" should be read as intent rather than guarantee. This is stated so that neither side builds
against a promise the other cannot yet keep.

## 7. Split of ownership

| Side | Owns |
|---|---|
| Agent ↔ Biz (eden-biz) | tool catalog (merging `toolregistry` and `mcpserver`), `agentloop`, principal and authorization per tool call, propose→approve (`agentactions`, objective 192) as an in-chat approval, the intent emitter, the fixtures |
| UI foundations (eden-ui-flutter, devflow-claude) | component catalog and schema, the renderer, how a spawned component is specified, its visual gate, the generated ids artifact, the fixture-drift test |

Neither blocks the other: the emitter and fixtures can be built while the catalog earns its
contracts.
