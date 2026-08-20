# Vitals Unveiled

An analytics dashboard over the [VitalDB](https://vitaldb.net) surgical dataset from Seoul
National University Hospital — 6,388 anonymised cases — built as a ground-up rebuild of a
university data-visualisation project ([chewycrunch/final-proj-dsc106](https://github.com/chewycrunch/final-proj-dsc106),
SvelteKit + D3) in a production-shaped React stack.

The rebuild is not a translation. Several of the original's statistics did not support the
claims attached to them, and this version corrects them rather than reproducing them. Those
corrections are the most interesting thing in the repository and are documented below.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173

npm test               # 371 tests
npm run test:coverage  # thresholds enforced on the logic layers
npm run lint           # includes the architecture boundary rules
npm run typecheck

npm run build && npm run preview   # then, in another shell:
npm run smoke                      # drives a real browser; see below
```

Container, which is what CI publishes:

```bash
docker build -t vitals-unveiled .
docker run --rm -p 8080:8080 vitals-unveiled   # http://localhost:8080
```

The image is a multi-stage build — `node:22-slim` to compile, `nginx:1.27-alpine` to serve —
running unprivileged as uid 101, 84 MB final.

## Deployment

Two paths, kept deliberately consistent with each other.

**Vercel** hosts the live build. Push to `main`, it builds and deploys; every branch gets a
preview URL. `vercel.json` restates the caching policy from `nginx.conf` — a year on
content-hashed assets, an hour on `cases.csv` and `track-index.json`, which are not hashed —
so the two hosts behave the same. Compression is Vercel's own, which is why there is no gzip
configuration to mirror.

Its build also does something CI currently cannot: it compiles the project on a clean machine,
with no `node_modules`, no cached Vite state and nothing present locally but uncommitted. A
broken build fails the deploy.

**The container** is the portable artefact and is what CI publishes. Anywhere that runs a
Dockerfile — Fly.io, Render, Cloud Run — will serve the app through the nginx configuration in
this repository rather than a platform's static host.

## Stack

React 18 · TypeScript (strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) ·
Redux Toolkit · MUI · D3 (as a maths library — see below) · Vite · Vitest + React Testing Library ·
ESLint + Prettier · Docker + nginx · GitHub Actions

No charting library. The point of the exercise is the D3/React boundary, and a chart library
deletes it.

## The D3/React boundary

This is the decision the whole codebase is arranged around; the full record,
including the alternatives rejected, is in
[docs/decisions/0002-d3-react-boundary.md](docs/decisions/0002-d3-react-boundary.md).

**React owns the DOM. D3 owns the maths. Except where D3 owns a _gesture_ — and there it gets a
leaf node it exclusively controls.**

It resolves into three tiers.

**Tier 1 — React-rendered SVG. The default, and almost everything.**
`d3-scale`, `d3-array` and `d3-shape` compute numbers and path strings; JSX emits `<rect>`,
`<path>`, `<circle>`. Axes are hand-written React components driven by `scale.ticks()`.

`d3-axis`, `d3-transition` and the `d3` meta-package are **banned by lint**, not by convention:

```js
// eslint.config.js
{ name: 'd3-axis', message: 'Axes are React components built from scale.ticks(). d3-axis renders
  imperatively into a node React also controls, which is the exact shared-ownership bug this
  project is avoiding.' }
```

The original demonstrates why. Every one of its charts ran `select(svg).selectAll('*').remove()`
and rebuilt from scratch on each update — which is why it leaked tooltip `<div>`s onto `<body>`
and dropped transition state mid-animation. React's reconciler diffs instead of nuking.

**Tier 2 — `useRef` + `useEffect`. Exactly one use: `d3-brush`.**
Brushing qualifies because d3-brush owns a state machine bound to a node, handles pointer
capture, touch and modifier keys, and exposes a programmatic `move()`. Reimplementing that in
React means reimplementing all of it, worse. So [`BrushX`](src/charts/primitives/BrushX.tsx)
renders `<g ref={gRef} />` — empty in JSX — and D3 fills it. Ownership is never shared, which is
the failure mode; imperative code is not.

The subtle part is the feedback-loop guard. `brush.move()` emits the same events a real gesture
does, but with no `sourceEvent`. Without checking for it, syncing the brush from the store
re-reports its own move, which dispatches a state change, which syncs the brush again, forever.
Two tests cover it.

**Tier 3 — Canvas. Reserved for the high-rate telemetry strip chart.**
SVG degrades past a few thousand nodes; a 500 Hz waveform in a 30-second window is 15,000 points.
D3 still computes the scales.

The expected follow-up — _"isn't React slower for many marks?"_ — is yes, past a few thousand,
which is precisely why tier 3 exists. `package.json` is the proof of the architecture: `d3-scale`
and `d3-shape` are present, `d3-axis` is not.

## Architecture

```text
src/
  app/            store, typed hooks, MUI theme
  data/           schema, CSV parse boundary, RTK Query endpoints
  transforms/     PURE. binning, facets, risk, statistics. no React, no DOM
  telemetry/      DATA PLANE. ring buffer, LTTB, TelemetrySource. outside React
  charts/         PRESENTATIONAL. props in, SVG out. no store access
  containers/     CONNECTED. store -> transform -> chart
  features/       slices, selectors, URL codec
  components/     shell, loading / empty / error states
  hooks/          useResizeObserver, useUrlSyncedFilters
```

**Charts take view models, never domain objects.** `AgeHistogram` receives `AgeBin[]`, not
`SurgeryCase[]`. That one constraint is what makes the binning testable without React and the
chart testable without data loading — its whole test file is a hand-written array of four bins.

The boundary is enforced in lint, because an architecture rule CI cannot check is a suggestion:

- `src/charts/**` may not import the store, features, data, or `react-redux`
- `src/transforms/**` and `src/telemetry/**` may not import React at all

**No derived data is stored.** The slice holds the selection; cohorts come from memoised
selectors. This is the structural fix for the original's cross-filter bug — it kept a mutable
`filteredCases` in component state and fed it back into two children under different conditions,
so brushing an age range collapsed the very selection that produced it. With one authoritative
source that bug is unrepresentable rather than merely repaired, and there is a regression test.

**Control plane and data plane are separate.** Redux holds what the operator asked for — filters,
selected case, playback state. It will never hold telemetry samples: at 500 Hz a dispatch per
sample is 500 actions a second, each waking every connected component, against a store that
cannot be garbage collected. Samples live in a fixed-capacity ring buffer outside React, and
charts read it on `requestAnimationFrame` — rendering at the display's rate, not the data's.

Static reference data in the store is not a contradiction of that rule. The objection is to
unbounded high-frequency writes, not to size.

## What was corrected, and why

Each of these is a test, not just a claim.

**The additive risk model was wrong.** The original summed each risk factor's marginal difference
in mortality onto a baseline. That predicts **11.7%**; the 51 patients who actually carry all four
factors died at **19.6%**. It was also biased upward by construction — contributions were clamped
at zero, so no factor could ever be protective. The panel now reports observed rates with 95%
intervals and draws the additive prediction alongside, so the claim is shown to be wrong rather
than quietly dropped.

The honest reading is more interesting than the headline: 19.6% carries an interval of
**11.0%–32.5%** on 51 patients. The additive prediction doesn't merely differ from the point
estimate — it sits at the very bottom edge of what that cohort can support.

**Intervals are Wilson, not Wald.** Mortality here is 57 of 6,255 — 0.9% — and users can filter to
a few dozen cases. At those proportions the textbook normal approximation is not imprecise but
incoherent: for zero deaths in 51 patients it returns a **zero-width interval**, asserting
certainty that the true rate is exactly zero. Wilson gives 0%–7.0%.

**The "albumin cliff" was contradicted by its own chart.** The original captioned a threshold at
3.5 g/dL and fitted a _straight line_ — which cannot express a threshold. Binned by value with
intervals, ICU admission runs from 5.9% above 5.0 g/dL to 84.6% below 2.0, rising continuously and
steepening. The increase crossing 3.5 is real and large, but it is not the largest step, so the
shape is a gradient, not a cliff. The panel says so and computes where the steepest step actually
falls.

**Composite risk weights were inverted by a unit mismatch.** The original's score added a raw
percentage (0–3) to two 0–100 normalised values. Despite a comment reading _"weight mortality more
heavily as it's the most critical outcome"_, blood loss dominated and mortality was nearly
irrelevant. Units now live in field names — `intraopBloodLossMl`, `icuDays`, `anesthesiaStartSec` —
so that class of error is visible at the call site.

**Missing data is not zero.** The original coerced empty CSV cells to `''` and read missing
outcomes as "did not happen". Albumin is absent for 372 cases and blood loss for 2,401. Everything
is `number | null`, parsed once at the boundary, and unrecorded outcomes are excluded from
denominators rather than counted as negatives.

**Smaller ones:** the axis no longer rescales under filtering (the original's did, so two cohorts
could not be compared by eye); a department excluded by a filter stays visible instead of
vanishing; the sex split is stacked rather than two translucent series overlaid; medians replace
means on right-skewed distributions; and "median 59.0" is computed rather than hard-coded prose
that silently became wrong under any filter.

**And one that held up.** The original claimed breast surgery averages ~34 minutes from
anaesthesia to incision and transplantation ~70. The data gives 33.9 and 69.7. That is now a test.

## Testing

371 tests. Coverage thresholds apply to `transforms/`, `telemetry/`, `data/` and `features/` —
the layers that carry logic. Charts get render tests with fixture props; thresholds there would
reward asserting on SVG internals, which is the brittle test this design exists to avoid.

There is also a browser smoke test — `npm run smoke` — because the unit suite
cannot establish that this application works. jsdom has no canvas, no layout and
no real ResizeObserver, and a stub that behaved unlike a browser once let a bug
ship where every chart rendered blank while 368 tests passed. It drives a real
Chrome over the DevTools Protocol, with no added dependencies, and asserts that
pixels were actually painted. CI blocks on the half that needs nothing but this
app, and treats the half that calls the live VitalDB API as advisory, since an
outage there is not a defect here.

Several suites assert against the **published dataset**, not fixtures: 6,388 rows, the department
split, 57 in-hospital deaths, exact missingness counts. If the upstream data is ever replaced,
those fail loudly instead of quietly changing every number on the dashboard.

## Accessibility

Built in, not retrofitted, and audited by a test that runs over the whole rendered dashboard —
so a future panel shipping an unlabelled control fails CI rather than quietly eroding the work.

Every panel is a landmark region labelled by its own heading. Charts
are `role="img"` with a description carrying the actual finding — one accurate sentence serves a
screen reader better than forty unlabelled rects — and charts with real controls opt into
`role="group"` so their children stay reachable. Department bars are true buttons: tabbable,
Enter and Space, `aria-pressed`. `d3-brush` has no keyboard affordance at all, so the age filter
is paired with a range slider that writes the same state, and an integration test drives that
filter entirely from the keyboard. Reduced motion is honoured globally; nothing here conveys
meaning through movement. Each telemetry trace carries a live numeric readout, which is the
accommodation a canvas actually needs — a picture of a waveform tells a screen reader nothing,
but the current value in text tells everyone something.

## Telemetry

Selecting a case replays the vital signs actually recorded during that operation: heart rate,
SpO₂, end-tidal CO₂, mean arterial pressure, anaesthetic depth, and a 500 Hz ECG, on one
timeline at their own rates.

This is not a simulation of a stream. The `Time` column is real elapsed seconds from the case
origin, so replaying it on a clock reproduces the genuine irregular intervals, dropouts and
missing samples — the properties synthetic data is always too clean to have. It is also how
operator consoles are actually built: against recorded data, not a live robot.

`TelemetrySource` is the seam. `VitalDBReplaySource` reads recorded tracks; `WebSocketSource`
satisfies the same interface and is asserted to, so swapping playback for a live feed is a
constructor change and nothing downstream can tell the difference.

The transport is streaming, not ranged. VitalDB stores its objects pre-gzipped, so a byte range
is a slice of a compressed stream and cannot be decompressed alone — `response.body` sidesteps
that because the browser decompresses as it reads, which also lets a 61 MB waveform start
drawing on its first chunk. Track discovery uses a build-time index
(`scripts/build-track-index.js`) rather than shipping the upstream 30 MB catalogue to every
visitor. Both decisions, and the measurements behind them, are in
[docs/decisions/0001-telemetry-transport.md](docs/decisions/0001-telemetry-transport.md).

## Status

Complete: data layer, state and URL-synced filters, six analytical panels, telemetry replay,
accessibility and responsive passes.

**CI has not yet executed** — the repository's GitHub Actions are blocked by an account billing
issue, not by the code. Every commit has been verified locally against the exact CI sequence
(`format:check → lint → typecheck → test:coverage → build`), and the container has been built and
exercised, but nothing has been checked on a clean machine.

## Licence

Code is MIT. The VitalDB dataset is subject to its own [terms of use](https://vitaldb.net/dataset/).
