# magmon — telemetry fix + admin page

This repository (currently empty on GitHub) doesn't yet contain the actual production
source for `magnet-monitor.vercel.app`. The production source must live elsewhere —
this PR delivers the **drop-in code, SQL migrations and analysis** needed to fix
the reported telemetry rendering bug and add the admin page the user requested.

## What's in this PR

```
docs/
  TELEMETRY_BUG_FIX.md            — root-cause analysis + integration steps
db/migrations/
  20260503_admin_rpcs.sql         — Supabase migration: roles, RPCs, RLS, telemetry view
src/lib/
  telemetry.ts                    — Supabase telemetry reader + gateway→UI normalization
  telemetry.test.ts               — unit tests, including the Numed/NM1027 row
  health.ts                       — corrected computeAssetHealth()
src/components/
  AssetCard.partial.tsx           — drop-in card pieces with per-tile null tolerance
src/pages/admin/
  AdminPage.tsx                   — Admin/Settings page
package.json, tsconfig.json       — minimal scaffold so the new code typechecks + tests
```

## How to land it in the real app

1. Apply the SQL migration to the Supabase project (`wpplqdsyizwcjnshuhty`).
2. Copy the four source files in `src/lib/` and `src/components/` into the real
   tree, preserving paths.
3. Replace the call site of `je.getLatestTelemetry(assetId)` (in the production
   bundle's `xP()` / asset-status function) with `fetchLatestTelemetryByAsset`
   + `subscribeLatestTelemetry`. See `docs/TELEMETRY_BUG_FIX.md`.
4. Replace the per-tile rendering of the asset card with `AssetMetricsGrid` /
   `MetricTile`, which print `—` for null values instead of `undefined`.
5. Add `<AdminPage>` to the app router, gated on `is_app_admin()` OR
   `is_company_admin()` (see `db/migrations/20260503_admin_rpcs.sql`).

## Verification done in this branch

```
$ npm install
$ npm test            # 6 passing tests (telemetry mapping incl. Numed row)
$ npm run build       # tsc passes
```

## Vercel build command

The deployed bundle is a Vite build (single `assets/index-*.js`, no API routes).
The expected Vercel configuration is:

| Setting          | Value          |
| ---------------- | -------------- |
| Framework Preset | Vite           |
| Build Command    | `npm run build`|
| Output Directory | `dist`         |
| Install Command  | `npm install`  |

`vercel.json` is not required for a static SPA; if added, only `rewrites` to
`/index.html` are needed (the bundle uses hash routing — `window.location.hash =
"#/"` — so SPA fallback isn't strictly necessary, but setting it makes deep
links work after a refresh on non-hash routes if any are introduced).
