# Telemetry rendering bug — root cause and fix

## Symptom
Customer **Numed, Inc.** is selected. Asset **NM1027** is visible. Gateway **NM1027-pi** shows online. Supabase has fresh telemetry rows for `asset_id 0492c447-9af1-44c8-8e44-80fe9d12412a, company_id numed-inc` (latest ~2026-05-03 15:06 UTC). Yet the asset card shows **AWAITING TELEMETRY / no telemetry yet**.

## Root cause (two independent problems)

### 1. Latest telemetry is read from a local in-memory Map, not from Supabase
In the deployed bundle the asset-status function (`xP` in the minified source) calls:

```js
const a = je.getLatestTelemetry(r.id);   // <- in-memory Map `Ds`, never populated from Supabase
const h = !!a;                            // hasTelemetry
// f && m && !h  =>  health = "awaiting_telemetry"
```

`Ds` (a JS `Map`) is only populated by the in-app demo data flow. There is no `.from('telemetry').select(...)` anywhere in the bundle (verified by grepping the production bundle for telemetry tables — none found). So even when Supabase has fresh rows, the client never reads them, `a` stays `null`, and the card renders **AWAITING TELEMETRY**.

### 2. Schema mismatch between gateway and UI metric names
The UI hard-codes these metric keys (from `Ml` and the asset card render):

```
helium_level_pct, shield_temp_k, coldhead_temp_k, coldhead_runtime_hr,
compressor_pressure_psi, compressor_oil_temp_c, compressor_helium_flow_g_min,
magnet_pressure_mbar, room_temp_c, humidity_pct
```

The Supabase rows the gateway is producing use a different vocabulary:

```
cs1, compressor, flow, he_pressure, chiller_temp, shield, raw_minute_*
```

So even if (1) is fixed, the existing card would render `undefined K` / `undefined psi` for every tile because the Supabase column names do not match the UI's expected keys.

The card render is also strict — it builds template strings like:

```js
e ? `${e.compressor_pressure_psi} psi · ${e.compressor_oil_temp_c}°C` : "—"
```

When `e` exists but a field is null, you get the literal string `"undefined psi · undefined°C"`.

## Fix — three coordinated changes

### A. Wire latest telemetry from Supabase
Replace `je.getLatestTelemetry(assetId)` with a real Supabase read. See `src/lib/telemetry.ts` for the drop-in module. It exposes:

```ts
fetchLatestTelemetryByAsset(assetIds: string[]): Promise<Map<string, TelemetrySample>>
fetchTelemetryHistory(assetId: string, limit: number): Promise<TelemetrySample[]>
subscribeLatestTelemetry(assetIds: string[], onUpdate: (s: TelemetrySample) => void): () => void
```

Internally it queries the `telemetry` table (or whatever table name your gateway writes to — adjust `TELEMETRY_TABLE` constant) and:

* Selects `id, asset_id, company_id, ts, values` plus the raw flat columns the gateway produces (`cs1, compressor, flow, he_pressure, chiller_temp, shield, raw_minute_*`).
* Normalizes the row into the UI's expected shape via `mapGatewayRowToUiSample()` (see B).
* Subscribes via Postgres changes (`postgres_changes`) so cards update live.

The asset-status function should treat `latest` as the maximum-timestamp row from Supabase, not from `Ds`. `hasTelemetry` becomes `latest && (Date.now() - latest.ts) <= STALE_LIMIT`. The `STALE_LIMIT` should be a generous window (e.g. `pollIntervalSec * 6` or 30 minutes) so a row that's 10 minutes old still counts as **received**.

### B. Map gateway field names → UI metric keys
Add `mapGatewayRowToUiSample()` in `src/lib/telemetry.ts`. It is intentionally permissive: any field that is null/undefined is **omitted**, not zero-filled. Mapping (verified against your bundle's metric list):

| Gateway field          | UI metric key                  | Notes                          |
| ---------------------- | ------------------------------ | ------------------------------ |
| `compressor`           | `compressor_pressure_psi`      | already psi per existing UI    |
| `cs1`                  | `coldhead_temp_k`              | coldhead stage 1 temp          |
| `flow`                 | `compressor_helium_flow_g_min` | g/min                          |
| `he_pressure`          | `magnet_pressure_mbar`         | magnet/HE pressure             |
| `chiller_temp`         | `room_temp_c`                  | equipment-room/chiller temp °C |
| `shield`               | `shield_temp_k`                | shield temp K                  |
| `helium_level_pct`     | `helium_level_pct`             | passthrough if present         |
| `compressor_oil_temp_c`| `compressor_oil_temp_c`        | passthrough if present         |
| `humidity_pct`         | `humidity_pct`                 | passthrough if present         |
| `coldhead_runtime_hr`  | `coldhead_runtime_hr`          | passthrough if present         |

> The exact mapping above reflects the user-supplied row contents. If the gateway later starts writing UI-canonical names, the passthrough branch already handles them — the alias map is only consulted when the canonical key is missing.

### C. Card render must handle partial telemetry
Update the asset card so each tile is independent and only renders when its specific metric is non-null. Pseudocode:

```tsx
function MetricTile({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">
        {value == null ? "—" : `${formatNumber(value)} ${unit}`}
      </div>
    </div>
  );
}
```

And drive it from a `presentMetrics(latest)` helper that returns `{ key, label, value, unit }[]` for every key in `Ml` whose value is non-null. If at least one metric is present, the card is "received", regardless of whether other metrics are missing.

In the status function:

```ts
const hasTelemetry = !!latest && Object.values(latest.values).some(v => v != null);
```

Also surface `latest.ts` as the **last telemetry time** (e.g. `Last sample: 2 min ago`). The bundle already has `Uo()` for relative time formatting — pass `freshnessSec` from the new Supabase-based latest row.

## Files added in this PR
- `src/lib/telemetry.ts` — Supabase read + subscription + gateway→UI normalization
- `src/lib/health.ts` — corrected `computeAssetHealth()` that uses the new latest source and tolerates partial fields
- `src/components/AssetCard.partial.tsx` — drop-in card renderer with per-tile null tolerance
- `db/migrations/20260503_telemetry_view.sql` — optional `v_latest_telemetry` view that simplifies the client query

## Verification
After applying the fix and re-deploying:

1. Sign in, select **Numed, Inc.**, locate **NM1027**.
2. Asset card should change from `AWAITING TELEMETRY` to a healthy or warning state with `compressor_pressure_psi = 100 psi` (the value behind `compressor=100`) and the coldhead tile showing `cs1 = 0 K`.
3. The freshness indicator should read `updated <Ns ago>` matching `2026-05-03 15:06 UTC` (or fresher).
4. Tiles whose underlying gateway field is null (`flow`, `he_pressure`, `chiller_temp`, `shield`) should display `—`, **not** `undefined`.
5. Inserting a new row into Supabase `telemetry` should update the card live within a few seconds (Postgres changes subscription).
