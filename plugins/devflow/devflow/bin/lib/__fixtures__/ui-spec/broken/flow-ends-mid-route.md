---
surface: projects-rail                # unique within the repo
patterns: [navigation/disclosure-group, navigation/section-caption]
references:
  mockup: refs/projects-rail/mockup.png
  donor: refs/projects-rail/donor/     # Trades React captures, completeness only
  locked: refs/projects-rail/locked/   # look-locked story renders, one per state x theme x width
design_read: "utility rail; expression low, motion minimal, density compact"
mode: redesign                         # greenfield | redesign

routes:
  - id: project.conversations
    path: /projects/:id/conversations
    entry: [{control: rail.project.header}, deeplink]                  # >=1 required
    back: {target: conversations.all, via: [app-back, browser-back]}   # required unless root
    guards: [member-of-workspace]      # each guard names its denied state
    reachable_from_nav: true           # false requires `justification:`
    title: "{project.name}"            # every route has a visible title
  - id: conversations.all
    path: /conversations
    entry: [deeplink]
    root: true                         # the declared root — this one needs no `back`
    reachable_from_nav: true
    title: Conversations

controls:
  - id: rail.project.header            # MUST equal the semantics identifier on the widget
    kind: disclosure-header
    visible_in: [populated, long-content, narrow]
    # `when` clauses are exclusive and together cover visible_in
    behaviors:
      - when: {control_state: collapsed, viewport: desktop}
        does: "expands children; selects the project and scopes the middle pane"
        effect: [toggle, select]       # machine-classifiable effect classes
      - when: {control_state: expanded, viewport: desktop}
        does: "collapses children; selection unchanged"
        effect: [toggle]
        must_not: ["change route", "lose selection"]
      - when: {viewport: narrow}
        does: "opens the project in the drawer"
        effect: [navigation]
    must_not: ["fire twice per activation", "cover sibling hit rects"]
    activation: {pointer: true, keyboard: [Enter, Space]}
    disabled_when: null                # or {condition: "...", reason_shown: "..."}
    a11y: {role: button, announces: [expanded, collapsed]}
    hit_rect: {disjoint_from: [rail.project.chevron]}   # reciprocal; the probe measures the rects
    destructive: false                 # true requires `confirm:` naming the dialog control

  - id: rail.project.chevron
    kind: toggle
    visible_in: [populated, long-content, narrow]
    does: "toggles children visibility only"
    effect: [toggle]
    must_not: ["select the project", "change route"]
    hit_rect:
      max: "40x40"                     # an upper bound the probe asserts, not a layout instruction
      disjoint_from: [rail.project.header]   # reciprocal with the header, above

states:
  - id: populated
    seed: projects-3-conversations-12  # seed profile the e2e entrypoint honours
    as: workspace-member               # identity from the e2e identity set
    ref: locked/populated.png
    content: {must_show: ["{project.name}"], must_not_show: []}
  - id: long-content
    seed: projects-long-names
    content: {rule: "names ellipsize; rail width unchanged"}
  - id: empty
    seed: projects-0
    content: {must_show: ["Create a project"], must_not_show: ["unavailable", "error"]}
  - id: error
    seed: projects-3
    fault: projects-list-500
    content: {must_show: ["Try again"], must_not_show: ["Create a project"]}
  - id: outage
    seed: projects-3
    fault: knowledge-service-503
    content: {must_show: ["unavailable"], must_not_show: ["Create a project"]}
  - id: guard-denied
    seed: projects-3
    as: non-member
    content: {must_show: ["You don't have access"], must_not_show: ["{project.name}"]}
  - id: narrow
    viewport: "390x844"
    seed: projects-3-conversations-12
  - id: dark
    theme: dark
    seed: projects-3-conversations-12

flows:
  - id: open-project-conversation
    steps:
      - {click: rail.project.header, expect: {route: project.conversations, control_state: {rail.project.header: expanded}}}
      - {click: "rail.conversation[0]", expect: {route: conversation.detail}}

scope_rules:
  - {on: workspace-switch, reset: [selected-project, expanded-groups]}
  - {on: project-move, invalidate: [project-pane, project-count-badge]}

acceptance:
  locked_sheet: "sha256:9f2c1b7e4a6d0835c1e9b4f7a2d6c8e013b5a7f9d2c4e6081a3b5c7d9e1f3a5b"
  locked_by: mark@aocyber.ai
  locked_at: 2026-09-18
---

<!-- Transcribed by hand from PROPOSAL-ui-oracle-loop.md §4.2 (the AMENDED text, commit 4e27123
     on branch docs/ui-oracle-loop-design). Transcription notes:

     * The amended §4.2 already writes `activation` as a MAP
       (`{pointer: true, keyboard: [Enter, Space]}`), the `narrow` and `dark` states in BLOCK
       syntax, and `acceptance.locked_sheet` as a quoted full 64-hex digest. The three
     * ONE character dropped from that digest, by TRD 34-03 (its <error_recovery>: "if the
       positive control fails, diagnose whether the invariant or the transcription is wrong").
       The amended proposal's illustrative digest is SIXTY-FIVE hex characters and therefore
       cannot be any sha256; the schema's `^sha256:[0-9a-f]{64}$` is right and the literal is
       not. The trailing `7` is dropped so the positive control carries a well-formed digest.
       Noted in 34-02-SUMMARY.md and 34-03-SUMMARY.md; the proposal itself still reads 65.
       normalisations TRD 34-02 anticipated are therefore not needed: the constructs that
       yaml-lite refuses (an implicit single-pair map inside a flow sequence — 34-01 case Y11b
       — and a bare key followed by a flow map on one line) are no longer in the source.
     * ONE LINE DROPPED from the chevron's `hit_rect`, by TRD 34-04, for the same reason and
       under the same authority as the digest above. The amended §4.2 writes the chevron as
       `{max: "40x40", within: rail.project.header, disjoint_from: [rail.project.header]}` —
       but the AMENDED §4.5 invariant 6, added in the same commit, reads "a `hit_rect.within`
       entry resolves and does not also appear in that control's `disjoint_from` — a control
       cannot be both inside another's area and disjoint from it". The example therefore
       violates the rule stated four sections later: §4.2 and §4.5 of the amendment contradict
       each other, and with only two controls no spec can exercise BOTH a reciprocal
       `disjoint_from` pair and a resolvable `within` between them.
       The NORMATIVE text wins over the illustrative one, so `within: rail.project.header` is
       dropped here and the reciprocal pair is kept (which §4.2 itself annotates "reciprocal").
       The §4.2 line survives verbatim as the known-broken fixture
       `broken/hit-rect-within-and-disjoint.md`, whose whole point is that the proposal's own
       example is the violation. Recorded in 34-04-SUMMARY.md under "I6 decision"; the proposal
       needs a follow-up amendment to one side or the other.
     * ONE addition beyond §4.2's prose block, made on TRD 34-02's instruction: the second
       route `conversations.all`, marked `root: true`. §4.2 names it only as
       `back.target`; invariant I2 ("every route has a back or is the declared root") needs it
       declared so the positive control has a root to point at.
     * Section-order, key-order and comments follow §4.2. Comments that ran to three lines in
       the proposal are compressed to one; no field is added, renamed or dropped.

     TWO yaml-lite traps the transcription had to route around. Both are COMMENT-level and
     neither touches a value, but both are worth knowing before authoring a real spec:
       a. An apostrophe in a TRAILING comment ("the widget's identifier") is read as an
          opening single quote and refused as `unterminated single-quoted string`. yaml-lite
          masks quotes over the whole line before it locates the comment, so a lone `'` after
          a `#` is still a quote to it. Two comments here were reworded to avoid apostrophes.
       b. A key whose value is ENTIRELY a trailing comment (`behaviors:   # ...`) does not
          read as an empty value: yaml-lite starts its comment scan one character past the
          value start, so the comment BECOMES the value and the block beneath it then fails
          with `indentation does not match any open block`. The `behaviors:` comment was
          moved onto its own full line above the key.
     Neither was normalised by editing yaml-lite — its refusal list is 34-01's, closed and
     deliberate, and both cases fail LOUDLY with a line number rather than mis-parsing.
-->

<!-- BROKEN: I7 — a flow that ends mid-route — expected code FLOW002.

     ONE edit of the positive control: the flow's final step,
     `{back: app-back, expect: {route: project.conversations, ...}}`, is deleted. The flow now
     ends on `{click: "rail.conversation[0]", expect: {route: conversation.detail}}` — neither
     a `back` nor a declared TERMINAL route. §4.5 I7: a flow ends in a `back` or a declared
     terminal route, because a flow that stops in the middle of a journey never says how the
     reader gets out, and "no way back" is the defect class this whole program exists to catch.

     TERMINAL ROUTE, as this engine defines it: a route of THIS spec declaring `root: true`.
     `conversation.detail` is not declared here at all (it belongs to another surface), so it
     cannot be the terminal route of a flow this spec ends. See 34-04-SUMMARY.md, "the
     terminal-route rule".
-->

## Intent

The projects rail is the workspace's persistent left-hand navigator: it lists the projects a
member can see, lets one be opened without losing where they were, and keeps the middle pane
scoped to whatever is selected. It is a utility surface — it should recede, and the reader's
attention should land on the content beside it, not on the rail itself.

## Walkthrough

**open-project-conversation.** From the conversations root a member activates a project's
disclosure header. The project's conversations appear beneath it and the middle pane scopes to
that project. Choosing the first conversation opens it. Going back returns to the project's
conversation list with the header still open — the return trip restores what the outbound trip
established, rather than collapsing the rail and stranding the reader at the top.
