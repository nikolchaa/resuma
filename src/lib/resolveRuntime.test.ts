import { describe, expect, it } from "vitest";
import type { SystemInfo } from "@/contexts/SystemContext";
import { getRuntimes } from "./resolveRuntime";
import { selectRecommendedRuntime } from "./selectRecommendedRuntime";

const gpu = (over: Partial<SystemInfo["gpu"]> = {}): SystemInfo["gpu"] => ({
  manufacturer: "Unknown",
  model: "Unknown",
  vramMb: 0,
  sharedMemoryMb: 0,
  kind: "integrated",
  supportsCuda: false,
  supportsVulkan: false,
  supportsHip: false,
  supportsMetal: false,
  ...over,
});

const system = (os: string, arch: string, gpus: SystemInfo["gpu"][] = []): SystemInfo => ({
  cpu: { manufacturer: "x", model: "x", maxFrequency: 3000, threads: 8 },
  gpus,
  gpu: gpus[0] ?? gpu({ kind: "unknown" }),
  ram: { sizeMb: 16384 },
  os: { name: os, version: "1", arch },
});

const offered = (s: SystemInfo) =>
  getRuntimes(s)
    .filter((r) => r.status === "confirmed")
    .map((r) => r.runtime.name);

describe("runtimes per platform and CPU architecture", () => {
  it("offers ARM builds on ARM computers, and prefers OpenCL on Snapdragon", () => {
    const adreno = gpu({ manufacturer: "Qualcomm", model: "Qualcomm(R) Adreno(TM) X1-85 GPU", supportsVulkan: true, sharedMemoryMb: 8192 });
    const snapdragon = system("Windows 11 Pro", "arm64", [adreno]);
    expect(offered(snapdragon)).toEqual(["llama-cpu-win-arm64", "llama-vulkan-win-arm64", "llama-opencl-win-arm64"]);
    expect(selectRecommendedRuntime(getRuntimes(snapdragon))?.name).toBe("llama-opencl-win-arm64");
    expect(offered(system("Ubuntu 24.04", "arm64"))).toEqual(["llama-cpu-linux-arm64"]);
  });

  it("never offers an x64 build to an ARM computer, or the other way round", () => {
    expect(offered(system("Windows 11 Pro", "arm64"))).not.toContain("llama-cpu-win");
    expect(offered(system("Windows 11 Pro", "x64"))).toEqual(["llama-cpu-win"]);
    expect(offered(system("Fedora Linux 43", "x64"))).toEqual(["llama-cpu-linux"]);
  });

  it("gives Intel Macs the x64 CPU build and Apple silicon the Metal build", () => {
    expect(offered(system("macOS", "x64"))).toEqual(["llama-cpu-mac-x64"]);
    expect(offered(system("macOS", "arm64"))).toEqual(["llama-metal"]);
  });

  it("goes by platform alone while the architecture is unknown", () => {
    expect(offered(system("Windows 11 Pro", ""))).toEqual(["llama-cpu-win", "llama-cpu-win-arm64"]);
  });
});
