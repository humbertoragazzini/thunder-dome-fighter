// ==================================================
// ORGANISM: SERVER & NETWORK DIAGNOSTICS MODAL
//
// WHAT IT DOES:
// Displays comprehensive real-time network and simulation performance metrics:
// 1. Live Round-Trip Ping (RTT), Min/Max/Avg, and Packet Jitter (ms).
// 2. Client Render Performance (FPS & Frame Time ms).
// 3. Authoritative Simulation Tick Rate (Hz) and State Patch Arrival Rate.
// 4. Root-cause diagnostic advice categorizing lag into Network, GPU, or Desync.
// 5. Host connection details (Room ID, Server Host, WebSocket & Fastify ports).
//
// HOW IT WORKS:
// - Subscribes to useNetworkDiagnosticsStore for reactive metric updates.
// - Starts high-frequency telemetry sampling while the modal is open.
// - Features an on-demand "Test Latency Now" button.
//
// WHY IT EXISTS:
// Resolves player ambiguity around lag, giving immediate visibility into
// network latency vs rendering frame drops vs server simulation health.
// ==================================================

import { useEffect } from "react";
import { FaArrowsRotate, FaCircleCheck, FaTriangleExclamation } from "react-icons/fa6";
import { GiRadarDish, GiServerRack } from "react-icons/gi";
import { useAppStore } from "../../../store/useAppStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { useNetworkDiagnosticsStore } from "../../../store/useNetworkDiagnosticsStore";
import { Badge } from "../atoms/Badge";
import { Button } from "../atoms/Button";
import { Spinner } from "../atoms/Spinner";
import { ModalBackdrop } from "../templates/ModalBackdrop";

export function ServerDiagnosticsModal() {
  const activeModal = useNavigationStore((state) => state.activeModal);
  const closeModal = useNavigationStore((state) => state.closeModal);
  const isOpen = activeModal === "DIAGNOSTICS";

  const room = useAppStore((state) => state.room);

  const ping = useNetworkDiagnosticsStore((state) => state.ping);
  const avgPing = useNetworkDiagnosticsStore((state) => state.avgPing);
  const minPing = useNetworkDiagnosticsStore((state) => state.minPing);
  const maxPing = useNetworkDiagnosticsStore((state) => state.maxPing);
  const jitter = useNetworkDiagnosticsStore((state) => state.jitter);
  const isTesting = useNetworkDiagnosticsStore((state) => state.isTesting);
  const measurePingNow = useNetworkDiagnosticsStore((state) => state.measurePingNow);

  const fps = useNetworkDiagnosticsStore((state) => state.fps);
  const avgFrameTimeMs = useNetworkDiagnosticsStore((state) => state.avgFrameTimeMs);

  const serverTick = useNetworkDiagnosticsStore((state) => state.serverTick);
  const serverTickRate = useNetworkDiagnosticsStore((state) => state.serverTickRate);
  const packetRate = useNetworkDiagnosticsStore((state) => state.packetRate);
  const packetIntervalMs = useNetworkDiagnosticsStore((state) => state.packetIntervalMs);
  const pendingInputsCount = useNetworkDiagnosticsStore((state) => state.pendingInputsCount);

  const startSampling = useNetworkDiagnosticsStore((state) => state.startSampling);

  // Activate telemetry sampling when modal opens
  useEffect(() => {
    if (isOpen) {
      startSampling();
    }
  }, [isOpen, startSampling]);

  // Determine qualitative latency rating
  const getLatencyTier = (ms: number | null) => {
    if (ms === null) return { label: "Testing...", variant: "slate" as const, color: "text-slate-400" };
    if (ms < 30) return { label: "Optimal (Local / Wired LAN)", variant: "emerald" as const, color: "text-emerald-400" };
    if (ms < 70) return { label: "Good (Standard Wi-Fi)", variant: "cyan" as const, color: "text-cyan-400" };
    if (ms < 120) return { label: "Moderate Latency", variant: "amber" as const, color: "text-amber-400" };
    return { label: "High Latency (Lagging)", variant: "red" as const, color: "text-rose-400" };
  };

  const latencyTier = getLatencyTier(ping);

  // Diagnostic root-cause assessment
  const isGpuLag = fps < 45;
  const isNetworkLag = (ping ?? 0) > 90;
  const isJitterLag = (jitter ?? 0) > 30;

  return (
    <ModalBackdrop
      isOpen={isOpen}
      onClose={closeModal}
      title="Server & Network Diagnostics"
      icon={<GiRadarDish className="text-cyan-400 text-xl" />}
      maxWidth="lg"
    >
      <div className="flex flex-col gap-5 select-none">
        {/* 1. Main Latency & RTT Display */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-slate-800 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              className="text-xs uppercase font-bold tracking-wider text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              WebSocket Flight Latency (RTT)
            </span>
            <Badge variant={latencyTier.variant} pulse={isTesting}>
              {latencyTier.label}
            </Badge>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-black font-mono tracking-tight ${latencyTier.color}`}>
              {ping !== null ? ping : "--"}
            </span>
            <span className="text-xl font-bold font-mono text-slate-400">ms</span>
            {isTesting && (
              <span className="ml-3 flex items-center gap-1.5 text-xs text-cyan-400 font-mono">
                <Spinner size="sm" color="cyan" /> Sampling...
              </span>
            )}
          </div>

          {/* Latency Stats Sub-Row */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-center">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Avg Ping</span>
              <span className="text-sm font-bold font-mono text-slate-200">
                {avgPing !== null ? `${avgPing}ms` : "--"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Min Ping</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {minPing !== null ? `${minPing}ms` : "--"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Max Ping</span>
              <span className="text-sm font-bold font-mono text-amber-400">
                {maxPing !== null ? `${maxPing}ms` : "--"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Jitter</span>
              <span className="text-sm font-bold font-mono text-cyan-400">
                {jitter !== null ? `±${jitter}ms` : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Client vs Server Performance Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Client Render Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold text-slate-300 uppercase tracking-wider"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                Client Rendering (GPU)
              </span>
              <Badge variant={fps >= 55 ? "emerald" : fps >= 35 ? "amber" : "red"}>
                {fps >= 55 ? "Smooth" : fps >= 35 ? "Warning" : "Dropping"}
              </Badge>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-black font-mono text-slate-100">{fps} FPS</span>
              <span className="text-xs font-mono text-slate-400">
                Frame: <strong className="text-slate-200">{avgFrameTimeMs}ms</strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/60 flex justify-between">
              <span>Input Queue Backlog:</span>
              <span className={pendingInputsCount > 10 ? "text-amber-400 font-bold" : "text-slate-300"}>
                {pendingInputsCount} in flight
              </span>
            </div>
          </div>

          {/* Authoritative Server Simulation Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold text-slate-300 uppercase tracking-wider"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                Server Simulation
              </span>
              <Badge variant={serverTickRate >= 50 ? "emerald" : "amber"}>
                Havok 60 Hz
              </Badge>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <span className="text-2xl font-black font-mono text-slate-100">
                {serverTickRate} Hz
              </span>
              <span className="text-xs font-mono text-slate-400">
                Tick: <strong className="text-slate-200">#{serverTick}</strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/60 flex justify-between">
              <span>Patch Delivery Rate:</span>
              <span className="text-slate-300">
                {packetRate} /s ({packetIntervalMs}ms)
              </span>
            </div>
          </div>
        </div>

        {/* 3. Diagnostic Root-Cause Assessment */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
          {isGpuLag || isNetworkLag || isJitterLag ? (
            <FaTriangleExclamation className="text-amber-400 text-lg shrink-0 mt-0.5" />
          ) : (
            <FaCircleCheck className="text-emerald-400 text-lg shrink-0 mt-0.5" />
          )}

          <div className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-slate-200 uppercase tracking-wide" style={{ fontFamily: "var(--font-tech)" }}>
              {isGpuLag
                ? "Diagnostic Alert: Client GPU / Rendering Bottleneck"
                : isNetworkLag
                  ? "Diagnostic Alert: Network Routing / Wi-Fi Latency"
                  : isJitterLag
                    ? "Diagnostic Alert: High Packet Jitter / Drop Rate"
                    : "Performance Status: Systems Operating Nominally"}
            </span>
            <p className="text-slate-400 leading-relaxed font-sans">
              {isGpuLag
                ? "Framerate is below 45 FPS. The browser is struggling to render Babylon.js WebGL frames. Check that GPU Hardware Acceleration is enabled in browser settings."
                : isNetworkLag
                  ? "Network ping is elevated (>90ms). This causes input delay or delayed hit registration. Verify your local Wi-Fi strength or Ethernet cable."
                  : isJitterLag
                    ? "Network packet intervals are fluctuating. Packet variance can cause characters to rubberband during reconciliation."
                    : "Your local frame rate is a stable 60 FPS and network latency to the authoritative simulation cluster is healthy."}
            </p>
          </div>
        </div>

        {/* 4. Active Connection Metadata */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GiServerRack className="text-cyan-400 text-base" />
            <span>Room:</span>
            <span className="text-slate-200 font-bold">
              {room?.roomId ? room.roomId : "Matchmaking Hub"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>Fastify: <strong className="text-slate-300">:3000</strong></span>
            <span>Colyseus: <strong className="text-slate-300">:2567</strong></span>
          </div>
        </div>

        {/* 5. Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void measurePingNow()}
            disabled={isTesting}
            leftIcon={<FaArrowsRotate className={isTesting ? "animate-spin" : ""} />}
          >
            {isTesting ? "Measuring..." : "Test Latency Now"}
          </Button>

          <Button variant="primary" size="sm" onClick={closeModal}>
            Dismiss
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
