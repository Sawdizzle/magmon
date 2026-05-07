export interface Company {
  id: string
  name: string
}

export interface Site {
  id: string
  name: string
  city: string | null
  state: string | null
  company_id: string
}

export interface Gateway {
  id: string
  hostname: string | null
  site_id: string | null
  company_id: string | null
  status: 'online' | 'offline' | 'never'
  last_heartbeat: number | null
  type: string | null
}

export interface Asset {
  id: string
  name: string
  site_id: string | null
  company_id: string | null
  gateway_id: string | null
  model: string | null
  serial: string | null
  magmon_ip: string | null
  site?: Site | null
  gateway?: Gateway | null
  telemetry?: LatestTelemetry | null
  status?: 'online' | 'offline' | 'warning' | 'critical'
}

export interface LatestTelemetry {
  asset_id: string
  helium_level: number | null
  water_flow: number | null
  chiller_temp: number | null
  shield_temp: number | null
  he_pressure: number | null
  compressor: number | null
  cs1: number | null
  coldhead_temp_k: number | null
  sampled_at: string | null
}

export interface Alert {
  id: string
  asset_id: string
  rule_id: string
  severity: string
  message: string
  opened_at: string
  closed_at: string | null
  acked_at: string | null
  asset?: { name: string }
}

export interface ThresholdRule {
  id: string
  company_id: string
  metric: string
  operator: string
  threshold: number | null
  severity: string
  enabled: boolean
}

export interface TelemetrySample {
  asset_id: string
  sampled_at: string
  helium_level: number | null
  water_flow: number | null
  chiller_temp: number | null
  he_pressure: number | null
}
