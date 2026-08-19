# 0001 — How telemetry gets from VitalDB into the browser

**Status:** accepted, with one open question for review
**Date:** 2026-08-19

## Context

The dashboard replays real intraoperative telemetry recorded alongside the case
table. The upstream source is the public VitalDB API. Before designing the
client, its actual behaviour was measured rather than assumed.

## What the API actually does

| Property           | Finding                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS               | `Access-Control-Allow-Origin: *`. The browser can read it directly; no backend is needed.                                                    |
| Track index        | `api.vitaldb.net/trks` — one static CSV, **13.86 MB gzipped, ~30 MB raw**, 486,449 rows, sorted by `caseid`.                                 |
| Per-case filtering | **None.** `?caseid=1` is accepted but ignored — identical `content-length`, and the response still ends at case 6388. `/trks/1` returns 403. |
| Track data         | `api.vitaldb.net/{tid}`, CSV of `Time,<value>`. A 0.5 Hz numeric is ~60 KB; a 500 Hz waveform is **61 MB / 5.77 M samples**.                 |
| Range requests     | `206 Partial Content` is returned, but see below.                                                                                            |

### Range requests do not do what they appear to

The origin stores these objects **already gzip-encoded**. Requesting with
`Accept-Encoding: identity` still returns `Content-Encoding: gzip`, and
`content-length` is unchanged at 13,857,879 bytes. A range request therefore
yields a slice of the _compressed_ stream:

```
$ curl -H "Accept-Encoding: identity" -r 1000000-1000400 .../trks
HTTP/2 206
content-encoding: gzip
content-range: bytes 1000000-1000400/13857879
<binary gzip fragment>
```

A fragment from the middle of a gzip stream cannot be decompressed on its own.
So the appealing trick — binary-searching byte ranges of a sorted remote CSV to
find one case's rows — **does not work here**. An earlier note in this project
claimed range requests made progressive chunked fetching possible; that claim
was wrong and this record supersedes it.

## Decision

**Streaming reads, not range requests.** `fetch` exposes `response.body` as a
`ReadableStream` and the browser decompresses gzip transparently as it arrives.
That gives progressive parsing and early abort without needing decodable byte
offsets. Because the index is sorted by `caseid`, a stream reading for case _N_
can stop as soon as it reads case _N+1_.

**A build-time index for track discovery.** Even with early abort, a client
looking up a late case reads most of 14 MB. Making every visitor download that
to find six track IDs is not a defensible design, and a real product would not
proxy an unfiltered 30 MB index to the client either. A checked-in script
derives a compact index of the channels this app actually uses and writes it to
`public/`, which is then served alongside `cases.csv`.

**The `TelemetrySource` interface is unaffected.** This is a transport decision
behind the seam. `VitalDBReplaySource` changes how it discovers and fetches;
charts and the playback UI do not change at all, which is the point of having
the interface.

## Open question for review

How much of the dataset the shipped index should cover:

- **All 6,388 cases, a handful of channels** — roughly 1.5 MB raw, ~600 KB
  gzipped, cached once. Any case in the dashboard can be replayed.
- **A curated set of ~50 cases** — roughly 12 KB. Far lighter, but telemetry
  only works for cases on the list, which has to be explained in the UI.

Recommendation: all cases, numerics only. 600 KB gzipped is comparable to the
case table already being shipped, and "select any case and watch it replay" is a
materially better demonstration than "select from these fifty".

## Consequences

- No backend, and the app still deploys as static files behind nginx.
- The 61 MB waveform tracks are fetched whole or not at all; there is no
  seeking into the middle of one without reading what precedes it. Numerics
  (~60 KB) have no such problem, which is another reason to lead with them.
- The derived index is a build artefact with a script in the repo, so it is
  reproducible and its provenance is auditable.
