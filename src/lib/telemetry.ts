import type { SupabaseClient } from "@supabase/supabase-js";

export const UI_METRIC_KEYS = [
  "helium_level_pct",
  "shield_temp_k",
  "coldhead_temp_k",
  "coldhead_runtime_hr",
  "compressor_pressure_psi",
  "compressor_oil_temp_c",
  "compressor_helium_flow_g_min",
  "magnet_pressure_mbar",
  "room_temp_c",
  "humidity_pct",
] as const;

export type UiMetricKey = (typeof UI_METRIC_KEYS)[number];

export type TelemetrySample = {
  assetId: string;
  companyId: string | null;
  ts: number;
  values: Partial<Record<UiMetricKey, number>>;
  raw: Record<string, unknown>;
};

const TELEMETRY_TABLE = "telemetry";

const GATEWAY_TO_UI: Record<string, UiMetricKey> = {
  compressor: "compressor_pressure_psi",
  cs1: "coldhead_temp_k",
  flow: "compressor_helium_flow_g_min",
  he_pressure: "magnet_pressure_mbar",
  chiller_temp: "room_temp_c",
  shield: "shield_temp_k",
};

export function mapGatewayRowToUiSample(row: Record<string, unknown>): TelemetrySample {
  const values: Partial<Record<UiMetricKey, number>> = {};

  for (const k of UI_METRIC_KEYS) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
  }

  for (const [gwField, uiKey] of Object.entries(GATEWAY_TO_UI)) {
    if (values[uiKey] != null) continue;
    const v = row[gwField];
    if (typeof v === "number" && Number.isFinite(v)) values[uiKey] = v;
  }

  const nestedValues = (row as { values?: Record<string, unknown> }).values;
  if (nestedValues && typeof nestedValues === "object") {
    for (const k of UI_METRIC_KEYS) {
      if (values[k] != null) continue;
      const v = nestedValues[k];
      if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    }
  }

  const tsRaw = row.ts ?? row.created_at ?? row.recorded_at;
  const ts =
    typeof tsRaw === "string" ? Date.parse(tsRaw) : typeof tsRaw === "number" ? tsRaw : Date.now();

  return {
    assetId: String(row.asset_id ?? ""),
    companyId: row.company_id == null ? null : String(row.company_id),
    ts,
    values,
    raw: row,
  };
}

export async function fetchLatestTelemetryByAsset(
  supabase: SupabaseClient,
  assetIds: string[],
): Promise<Map<string, TelemetrySample>> {
  const out = new Map<string, TelemetrySample>();
  if (assetIds.length === 0) return out;

  const { data, error } = await supabase
    .from(TELEMETRY_TABLE)
    .select("*")
    .in("asset_id", assetIds)
    .order("ts", { ascending: false })
    .limit(assetIds.length * 5);

  if (error) {
    console.warn("[telemetry] fetchLatestTelemetryByAsset failed", error.message);
    return out;
  }

  for (const row of data ?? []) {
    const sample = mapGatewayRowToUiSample(row as Record<string, unknown>);
    if (!sample.assetId) continue;
    const existing = out.get(sample.assetId);
    if (!existing || sample.ts > existing.ts) out.set(sample.assetId, sample);
  }
  return out;
}

export async function fetchTelemetryHistory(
  supabase: SupabaseClient,
  assetId: string,
  limit = 60,
): Promise<TelemetrySample[]> {
  const { data, error } = await supabase
    .from(TELEMETRY_TABLE)
    .select("*")
    .eq("asset_id", assetId)
    .order("ts", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[telemetry] fetchTelemetryHistory failed", error.message);
    return [];
  }
  return (data ?? [])
    .map(r => mapGatewayRowToUiSample(r as Record<string, unknown>))
    .sort((a, b) => a.ts - b.ts);
}

export function subscribeLatestTelemetry(
  supabase: SupabaseClient,
  assetIds: string[],
  onUpdate: (sample: TelemetrySample) => void,
): () => void {
  if (assetIds.length === 0) return () => undefined;

  const channel = supabase
    .channel(`telemetry:${assetIds.slice(0, 3).join(",")}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TELEMETRY_TABLE },
      payload => {
        const row = payload.new as Record<string, unknown>;
        if (!assetIds.includes(String(row.asset_id))) return;
        onUpdate(mapGatewayRowToUiSample(row));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function hasAnyTelemetry(sample: TelemetrySample | null | undefined): boolean {
  if (!sample) return false;
  return Object.values(sample.values).some(v => v != null);
}
