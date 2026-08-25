# Deployment verification (conditional — only when devcluster is installed)

## Why this exists

Objective verification checks that code is **correct**. It cannot check that
code is **deployable**. Those are different failures, and the second kind is
invisible to every check that reads source:

- A config key the deployment sets that no code reads — inert config. The
  manifest looks right, the code looks right, the feature does nothing.
- Two halves that must ship together: an image that reads a new env var and the
  chart value that supplies it. Either alone is a silent no-op.
- Cross-origin assumptions. A value that is correct in a single-origin dev loop
  and wrong behind real ingress hostnames.
- Cross-service seams: mTLS, cluster DNS, NetworkPolicy, trust anchors. None of
  these exist outside a cluster, so nothing local exercises them.

If the project has a local deployment-test environment, USE IT before declaring
an objective verified. If it does not, say so in the verification result rather
than implying deployment was checked.

## Detection

devcluster is optional. Detect it; never assume it.

```bash
# `find`, not a glob: zsh errors on an unmatched glob ("no matches found")
# rather than passing it through, so a glob-based probe emits noise — or fails
# outright — on the exact path where devcluster is absent.
DC="$(command -v devcluster 2>/dev/null)"
[ -n "$DC" ] || DC="$(find "$HOME/.claude/plugins/cache" \
  -path '*/devcluster/*/harness/devcluster' -type f 2>/dev/null | head -1)"

if [ -n "$DC" ] && [ -x "$DC" ]; then
  echo "devcluster: $DC"
else
  echo "devcluster not installed"
fi
```

If absent: continue with normal verification and record
`deployment_verification: not_available` in your result. Do not treat its
absence as a pass, and do not try to install it.

## When it applies

Run deployment verification when the objective touched any of:

- Kubernetes manifests, Helm values, ingress, or hostnames
- environment variables, ConfigMaps, Secrets, or mounted certificates
- a call from one service to another
- tenant provisioning, database roles/schemas, or grants
- anything whose failure mode is "works locally, breaks when deployed"

Skip it for pure library, docs, or test-only changes — and say that you skipped
it and why.

## What to run

Cheapest first. Stop at the first failure and report it; do not run the
expensive layers to "get more data" when an earlier one already failed.

```bash
"$DC" t0 <app>                    # ~5s  manifests vs source: inert config, collapsed origins, placement
"$DC" verify <app> --json         # ~10s the deployed app: replicas, origins, data plane
"$DC" test L4 --json              # cross-service seams
"$DC" test L5 --json              # isolation invariants (tenant, network, pod security)
```

For a change spanning services, bring the set up in dependency order first:

```bash
"$DC" up --list                   # named co-change bundles
"$DC" up aodex-aocore             # e.g. aoid → aocore → aodex
```

Before editing a shared library, get the blast radius — the fan-out is larger
than it looks and nothing in the repos states it:

```bash
"$DC" impact eden-platform-go     # 7 Go services
"$DC" impact eden-ui-flutter      # 5 Flutter UIs
```

## Reading the result

Both `test` and `verify` emit a single JSON document on stdout (human output
goes to stderr) and exit non-zero on failure.

```json
{ "schema": "devcluster.test/v1", "ok": false,
  "summary": {"passed": 40, "failed": 1, "skipped": 1},
  "failures": ["L4.1"],
  "assertions": [{"id":"L4.1","level":"L4","status":"fail","message":"…"}] }
```

Rules:

1. **Key on `ok` and `failures[]`.** Do not scrape the text.
2. **A skip is not a pass.** `skipped` counts checks that could not be
   evaluated. Report skips explicitly; never fold them into a success claim.
3. **Quote the failing `message` verbatim.** Each one names the production
   incident that check descends from — that context is the fastest route to a
   fix, and paraphrasing loses it.
4. **`L1.1` failing outranks everything.** It means the conformance gate itself
   stopped rejecting known bugs, so every other green result is suspect.

## What it cannot prove

State these as limits rather than letting a green run imply them:

- **Cilium L7/DNS-aware policy** is not enforced (the local cluster runs
  flannel). Standard NetworkPolicy IS enforced.
- **Telemetry is off by default**, so missing-span and wrong-service-name
  regressions are not detectable locally.
- The **in-cluster dev loop** (`devcluster dev`) runs your binary on a
  shell-bearing base image, not the distroless production image. Config,
  network and identity fidelity are complete; image fidelity is not. A change
  is not verified until it has run through `devcluster deploy <app>`.

## Screenshots are not evidence on their own

If verification involves driving a UI, the capture itself has to be verified
before anything measured from it is trusted. This is not pedantry — it has
already produced a false defect report against a clean build, escalated to the
owning team, with four independent provenance checks passing the whole time.

A single-page app reads its boot parameters **once**, when the document loads.
Navigating between URLs that differ only in query string or hash moves the URL
without re-booting the app, so the address bar and the running application
silently disagree. A screenshot taken in that state shows one thing and is
labelled another.

Server-side provenance does not detect this. Confirming the pod digest, the
served bundle hash, a `cache: no-store` re-fetch and the absence of service
workers proves the browser received the right *artifact*. None of them looks at
the *page*.

So, before every capture:

1. Hard-navigate (or open a fresh browser context) — never a same-document nav.
2. Assert in-page that the app booted with the parameters under test:
   `performance.getEntriesByType('navigation')[0].type === 'navigate'`, and the
   framework root attached.
3. Save that assertion next to the screenshot.

devcluster enforces this: `bin/uitest.py` requires a `<name>.boot.json` receipt
per PNG and **fails** — never skips — when one is missing or disagrees with the
filename. `bin/capture_guard.js` produces the receipt.

The wider rule this is an instance of: **when a reviewer's evidence contradicts
yours, chase the contradiction before defending the finding.** Two builds with
the same hash cannot render differently. That impossibility was the fastest
route to the truth and it was available before the report went out.

## Do not fight the cluster

ArgoCD runs with `selfHeal: true`. A manual `kubectl scale`, `edit` or `patch`
is reverted within seconds, and a check that appears to pass afterwards is
measuring the reverted state, not your change. Change the manifest and
redeploy. Never use `kubectl` without the harness's own kubeconfig
(`"$DC" t2 kubeconfig`) — the operator's default context is frequently a
production cluster.
