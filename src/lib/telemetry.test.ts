import { describe, it, expect } from "vitest";
import { mapGatewayRowToUiSample, hasAnyTelemetry } from "./telemetry";

describe("mapGatewayRowToUiSample", () => {
  it("maps gateway field names to UI metric keys", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "0492c447-9af1-44c8-8e44-80fe9d12412a",
      company_id: "numed-inc",
      ts: "2026-05-03T15:06:00Z",
      cs1: 0,
      compressor: 100,
      flow: null,
      he_pressure: null,
      chiller_temp: null,
      shield: null,
    });

    expect(sample.assetId).toBe("0492c447-9af1-44c8-8e44-80fe9d12412a");
    expect(sample.companyId).toBe("numed-inc");
    expect(sample.values.compressor_pressure_psi).toBe(100);
    expect(sample.values.coldhead_temp_k).toBe(0);
    expect(sample.values.compressor_helium_flow_g_min).toBeUndefined();
    expect(sample.values.magnet_pressure_mbar).toBeUndefined();
    expect(sample.values.room_temp_c).toBeUndefined();
    expect(sample.values.shield_temp_k).toBeUndefined();
  });

  it("treats sample as having telemetry when at least one value is present", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "x",
      ts: Date.now(),
      compressor: 100,
      cs1: null,
    });
    expect(hasAnyTelemetry(sample)).toBe(true);
  });

  it("hasAnyTelemetry is false when every metric is null", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "x",
      ts: Date.now(),
      compressor: null,
      cs1: null,
      flow: null,
    });
    expect(hasAnyTelemetry(sample)).toBe(false);
  });

  it("prefers canonical UI keys over gateway aliases", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "x",
      ts: Date.now(),
      compressor_pressure_psi: 42,
      compressor: 100,
    });
    expect(sample.values.compressor_pressure_psi).toBe(42);
  });

  it("reads from a nested values object as a last resort", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "x",
      ts: Date.now(),
      values: { helium_level_pct: 88.5 },
    });
    expect(sample.values.helium_level_pct).toBe(88.5);
  });

  it("ignores non-finite numbers", () => {
    const sample = mapGatewayRowToUiSample({
      asset_id: "x",
      ts: Date.now(),
      compressor: Number.NaN,
      cs1: Number.POSITIVE_INFINITY,
    });
    expect(sample.values.compressor_pressure_psi).toBeUndefined();
    expect(sample.values.coldhead_temp_k).toBeUndefined();
  });
});
