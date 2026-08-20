# 0002 — Where D3 ends and React begins

**Status:** accepted
**Date:** 2026-08-20

## Context

D3 is two libraries wearing one name. There is a set of pure mathematical
modules — `d3-scale`, `d3-array`, `d3-shape` — which turn data into numbers and
path strings. And there is `d3-selection`, which is a DOM manipulation library
with its own data-join, lifecycle and event model.

React is also a DOM manipulation library with its own lifecycle. Point both at
the same subtree and neither can reason about it. This is not a theoretical
concern; the project this one replaces demonstrates each failure mode:

- Every chart began its update with `select(svg).selectAll('*').remove()` and
  rebuilt from scratch, because incremental updates were not safely expressible.
- Tooltips were appended to `<body>` and never removed, so they accumulated —
  one leaked node per render.
- Transitions were lost mid-flight whenever a re-render occurred.

None of these are D3 defects. They are what happens when ownership of a node is
ambiguous.

## Decision

**React owns the DOM. D3 owns the maths. The exception is that D3 may own a
subtree when it owns a _gesture_ — and that subtree must be a leaf React never
renders into.**

Three tiers follow.

### Tier 1 — React-rendered SVG (the default)

`d3-scale` and friends compute; JSX emits `<rect>`, `<path>`, `<circle>`. Axes
are hand-written React components driven by `scale.ticks()`.

`d3-axis`, `d3-transition` and the `d3` meta-package are **banned by lint**, not
by convention:

```js
{
  name: 'd3-axis',
  message: 'Axes are React components built from scale.ticks(). d3-axis renders
    imperatively into a node React also controls, which is the exact
    shared-ownership bug this project is avoiding.',
}
```

Five of the seven charts are entirely this tier.

### Tier 2 — `useRef` + `useEffect` (exactly one use: `d3-brush`)

Brushing qualifies because d3-brush owns a state machine bound to a node: it
handles pointer capture, touch, modifier keys, and exposes a programmatic
`move()`. Reimplementing that in React means reimplementing all of it, worse.

So [`BrushX`](../../src/charts/primitives/BrushX.tsx) renders `<g ref={gRef} />`
— empty in JSX — and D3 fills it. Ownership is never shared.

The subtle part is the feedback-loop guard. `brush.move()` emits the same events
a real gesture does, but with no `sourceEvent`. Without checking for it, syncing
the brush from the store re-reports its own move, which dispatches a state
change, which syncs the brush again, forever. Two tests cover it.

### Tier 3 — Canvas (exactly one use: the telemetry strip chart)

SVG degrades past a few thousand nodes. A 500 Hz waveform in a 30-second window
is 15,000 points, and asking React to reconcile that every frame is not a close
call. D3 still computes the scales; the draw loop is imperative.

## Consequences

**Charts became testable without a renderer, and transforms without React.**
The rule that follows from tier 1 is that a chart takes a view model, never a
domain object: `AgeHistogram` receives `AgeBin[]`, not `SurgeryCase[]`. Its
entire test file is a hand-written array of four bins.

**Accessibility became possible.** Marks are real elements, so they can carry
`role`, `tabIndex` and `aria-pressed`. The department bars are genuine buttons
reachable by Tab and activated by Enter or Space — unreachable in the original,
where the bars existed only inside a D3-managed subtree.

**`package.json` is the proof.** `d3-scale` and `d3-shape` are present;
`d3-axis` is not. That is a stronger claim than any comment.

**The canvas exception costs accessibility, and is paid for separately.** A
painted trace tells a screen reader nothing, so each carries a live numeric
readout written straight to the DOM — a leaf React renders once and never
reconciles into, which is tier 2's rule applied to text instead of a gesture.

## Alternatives considered

**A charting library (Recharts, visx, nivo).** Rejected: it deletes the exercise.
It is the right answer for most products and the wrong one here.

**All D3, React only for layout.** This is the original's approach. Rejected for
the reasons in Context — and it gives up the reconciler, testability and
keyboard access at once.

**All React, no D3 at all.** Tempting, and viable until you need `bin`,
`quantile` or a brush. Hand-rolling Wilson intervals is reasonable; hand-rolling
pointer capture is not.

## What this does not fix

The boundary makes rendering predictable. It does not make a chart correct. The
original's worst problems — an additive risk model that understated a combined
cohort by eight percentage points, a linear fit captioned as a threshold — were
untouched by any of this and are recorded in the README and the commit history.

Getting the architecture right and the statistics wrong is entirely possible,
and the second matters more.
