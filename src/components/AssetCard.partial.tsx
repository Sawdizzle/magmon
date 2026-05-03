import type { TelemetrySample, UiMetricKey } from "../lib/telemetry";

const LABELS: Record<UiMetricKey, string> = {
  helium_level_pct: "Helium level",
  shield_temp_k: "Shield temp",
  coldhead_temp_k: "Coldhead temp",
  coldhead_runtime_hr: "Coldhead runtime",
  compressor_pressure_psi: "Compressor pressure",
  compressor_oil_temp_c: "Compressor oil temp",
  compressor_helium_flow_g_min: "Helium flow",
  magnet_pressure_mbar: "Magnet pressure",
  room_temp_c: "Equipment room temp",
  humidity_pct: "Humidity",
};

const UNITS: Record<UiMetricKey, string> = {
  helium_level_pct: "%",
  shield_temp_k: "K",
  coldhead_temp_k: "K",
  coldhead_runtime_hr: "h",
  compressor_pressure_psi: "psi",
  compressor_oil_temp_c: "°C",
  compressor_helium_flow_g_min: "g/min",
  magnet_pressure_mbar: "mbar",
  room_temp_c: "°C",
  humidity_pct: "%",
};

const PRIMARY_TILES: UiMetricKey[] = [
  "helium_level_pct",
  "coldhead_temp_k",
  "compressor_pressure_psi",
  "shield_temp_k",
];

function formatNumber(v: number): string {
  if (Math.abs(v) >= 100 || Number.isInteger(v)) return v.toFixed(0);
  return v.toFixed(1);
}

export function MetricTile({ metric, value }: { metric: UiMetricKey; value: number | undefined }) {
  return (
    <div data-testid={`metric-${metric}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {LABELS[metric]}
      </div>
      <div className="text-sm tabular-nums">
        {value == null ? "—" : `${formatNumber(value)} ${UNITS[metric]}`}
      </div>
    </div>
  );
}

export function AssetMetricsGrid({ latest }: { latest: TelemetrySample | null }) {
  const v = latest?.values ?? {};
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PRIMARY_TILES.map(k => (
        <MetricTile key={k} metric={k} value={v[k]} />
      ))}
    </div>
  );
}

export function LatestSampleLabel({ latest }: { latest: TelemetrySample | null }) {
  if (!latest) return <span className="text-xs text-muted-foreground">no telemetry yet</span>;
  const sec = Math.max(0, Math.round((Date.now() - latest.ts) / 1000));
  const rel =
    sec < 5 ? "just now" :
    sec < 60 ? `${sec}s ago` :
    sec < 3600 ? `${Math.round(sec / 60)}m ago` :
    sec < 86400 ? `${Math.round(sec / 3600)}h ago` :
    `${Math.round(sec / 86400)}d ago`;
  return <span className="text-xs text-muted-foreground" data-testid="text-latest-sample">updated {rel}</span>;
}
