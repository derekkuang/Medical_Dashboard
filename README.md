# Vitals Unveiled

An operator-style dashboard over the [VitalDB](https://vitaldb.net) surgical dataset from
Seoul National University Hospital: 6,388 anonymised cases, plus live replay of the
intraoperative telemetry recorded during them.

This is a ground-up rebuild of a course data-visualisation project
([chewycrunch/final-proj-dsc106](https://github.com/chewycrunch/final-proj-dsc106),
SvelteKit + D3) as a production-shaped React application.

## Status

Scaffolding in progress. See `docs/decisions/` for architecture decision records.

## Data

| Source | Shape |
| --- | --- |
| `public/cases.csv` | 6,388 rows x 74 columns — one row per surgical case |
| `api.vitaldb.net/trks` | 486,449 waveform track descriptors across those cases |
| `api.vitaldb.net/{tid}` | Per-track time series, `Time,<value>`, 0.5 Hz to 500 Hz |

The VitalDB API sends `Access-Control-Allow-Origin: *` and honours HTTP range
requests, so telemetry is streamed directly from the browser. There is no backend.

## Licence

Code is MIT. The VitalDB dataset is subject to its own
[terms of use](https://vitaldb.net/dataset/) and is not redistributed here beyond the
case table used for offline development.
