import type { TelemetrySample } from "./telemetry";
import { hasAnyTelemetry } from "./telemetry";

export type AssetHealth =
  | "healthy"
  | "warning"
  | "critical"
  | "stale"
  | "awaiting_telemetry"
  | "gateway_offline"
  | "awaiting_gateway";

export type ActiveAlert = { severity: "warning" | "critical" };

export type Asset = { id: string; pollIntervalSec: number };
export type Gateway = { lastHeartbeat: number; offlineTimeoutSec: number };

const STALE_GRACE_MULTIPLIER = 6;

export function computeAssetHealth(args: {
  asset: Asset;
  gateway: Gateway;
  latest: TelemetrySample | null;
  activeAlerts: ActiveAlert[];
  now?: number;
}): { health: AssetHealth; freshnessSec: number; hasTelemetry: boolean } {
  const now = args.now ?? Date.now();
  const { asset, gateway, latest, activeAlerts } = args;

  const gatewayInstalled = gateway.lastHeartbeat > 0;
  const gatewayOnline =
    gatewayInstalled && (now - gateway.lastHeartbeat) / 1000 <= gateway.offlineTimeoutSec;

  const hasTelemetry = hasAnyTelemetry(latest);
  const freshnessSec = latest ? Math.round((now - latest.ts) / 1000) : Number.MAX_SAFE_INTEGER;
  const stale = hasTelemetry && freshnessSec > asset.pollIntervalSec * STALE_GRACE_MULTIPLIER;

  let health: AssetHealth;
  if (!gatewayInstalled) health = "awaiting_gateway";
  else if (!gatewayOnline) health = "gateway_offline";
  else if (!hasTelemetry) health = "awaiting_telemetry";
  else if (activeAlerts.some(a => a.severity === "critical")) health = "critical";
  else if (activeAlerts.some(a => a.severity === "warning")) health = "warning";
  else if (stale) health = "stale";
  else health = "healthy";

  return { health, freshnessSec, hasTelemetry };
}
