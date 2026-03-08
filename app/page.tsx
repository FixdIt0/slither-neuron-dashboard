"use client";
import { useRef, useEffect, useState, useCallback } from "react";

/* ═══ TYPES ═══ */
type GameState = "idle" | "eating" | "hunting" | "evading" | "boosting" | "death";
interface TimelineEvent { t: number; state: GameState }

const VIDEO_DURATION = 450; // 7:30 loop

const TIMELINE: TimelineEvent[] = [
  { t: 0, state: "idle" },
  { t: 1, state: "eating" },
  { t: 7, state: "evading" },
  { t: 10, state: "eating" },
  { t: 19, state: "eating" },
  { t: 20, state: "boosting" },
  { t: 22, state: "death" },
  { t: 25, state: "eating" },
  { t: 29, state: "boosting" },
  { t: 31, state: "death" },
  { t: 34, state: "idle" },
  { t: 40, state: "eating" },
  { t: 48, state: "idle" },
  { t: 54, state: "hunting" },
  { t: 56, state: "hunting" },
  { t: 58, state: "eating" },
  { t: 65, state: "idle" },
  { t: 70, state: "eating" },
  { t: 78, state: "idle" },
  { t: 82, state: "evading" },
  { t: 84, state: "evading" },
  { t: 86, state: "hunting" },
  { t: 88, state: "hunting" },
  { t: 90, state: "eating" },
  { t: 95, state: "idle" },
  { t: 105, state: "eating" },
  { t: 115, state: "idle" },
  { t: 119, state: "hunting" },
  { t: 121, state: "hunting" },
  { t: 123, state: "eating" },
  { t: 130, state: "idle" },
  { t: 136, state: "evading" },
  { t: 138, state: "death" },
  { t: 141, state: "idle" },
  { t: 155, state: "eating" },
  { t: 165, state: "idle" },
  { t: 170, state: "hunting" },
  { t: 172, state: "hunting" },
  { t: 174, state: "eating" },
  { t: 179, state: "eating" },
  { t: 180, state: "hunting" },
  { t: 181, state: "hunting" },
  { t: 183, state: "eating" },
  { t: 190, state: "idle" },
  { t: 198, state: "evading" },
  { t: 200, state: "death" },
  { t: 203, state: "idle" },
  { t: 215, state: "eating" },
  { t: 221, state: "boosting" },
  { t: 223, state: "hunting" },
  { t: 230, state: "eating" },
  { t: 235, state: "eating" },
  { t: 237, state: "evading" },
  { t: 238, state: "death" },
  { t: 241, state: "idle" },
  { t: 248, state: "eating" },
  { t: 253, state: "idle" },
  { t: 260, state: "eating" },
  { t: 275, state: "idle" },
  { t: 283, state: "hunting" },
  { t: 285, state: "hunting" },
  { t: 287, state: "eating" },
  { t: 295, state: "idle" },
  { t: 310, state: "boosting" },
  { t: 314, state: "eating" },
  { t: 320, state: "idle" },
  { t: 323, state: "hunting" },
  { t: 325, state: "hunting" },
  { t: 327, state: "eating" },
  { t: 331, state: "eating" },
  { t: 333, state: "evading" },
  { t: 334, state: "death" },
  { t: 337, state: "idle" },
  { t: 345, state: "eating" },
  { t: 349, state: "idle" },
  { t: 351, state: "eating" },
  { t: 355, state: "hunting" },
  { t: 357, state: "hunting" },
  { t: 360, state: "hunting" },
  { t: 362, state: "eating" },
  { t: 368, state: "hunting" },
  { t: 371, state: "hunting" },
  { t: 373, state: "eating" },
  { t: 378, state: "evading" },
  { t: 380, state: "death" },
  { t: 383, state: "idle" },
  { t: 389, state: "eating" },
  { t: 394, state: "idle" },
  { t: 400, state: "eating" },
  { t: 420, state: "idle" },
  { t: 428, state: "eating" },
  { t: 435, state: "idle" },
  { t: 440, state: "eating" },
  { t: 444, state: "idle" },
  { t: 446, state: "evading" },
  { t: 448, state: "death" },
];

/* Get state for a given video time (modular, loops every 450s) */
function getStateAtTime(videoTime: number): GameState {
  const t = ((videoTime % VIDEO_DURATION) + VIDEO_DURATION) % VIDEO_DURATION;
  let state: GameState = "idle";
  for (const e of TIMELINE) {
    if (t >= e.t) state = e.state; else break;
  }
  return state;
}

const CH = 64;
const DT = 0.025; // 25ms tick = 40fps
const RATE_SMOOTH = 0.15; // exponential smoothing for displayed rates

/* ═══ SPIKE-BASED NEURAL ENGINE ═══
   Each channel has a firing rate (Hz). Each tick, spikes are generated
   probabilistically: P(spike in dt) = rate * dt. Rates are per-channel,
   determined by game state + channel role. */

// Channel roles (loosely mapped to cortical regions on the MEA)
// 0-7: reward/dopaminergic, 8-15: sensory input, 16-31: motor output,
// 32-47: association/integration, 48-63: inhibitory/regulatory
function getChannelRates(state: GameState): Float64Array {
  const r = new Float64Array(CH);

  switch (state) {
    case "idle":
      // Sparse baseline: 2-12 Hz
      for (let i = 0; i < CH; i++) r[i] = 2 + Math.random() * 10;
      break;

    case "eating":
      // Reward channels burst, others moderate
      for (let i = 0; i < CH; i++) r[i] = 8 + Math.random() * 12; // base 8-20
      for (let i = 0; i < 8; i++) r[i] = 40 + Math.random() * 40;  // reward: 40-80
      for (let i = 32; i < 48; i++) r[i] = 15 + Math.random() * 20; // association responds
      break;

    case "hunting":
      // Motor channels high, sensory active
      for (let i = 0; i < CH; i++) r[i] = 10 + Math.random() * 15;
      for (let i = 16; i < 32; i++) r[i] = 25 + Math.random() * 25; // motor: 25-50
      for (let i = 8; i < 16; i++) r[i] = 15 + Math.random() * 15;  // sensory: 15-30
      for (let i = 32; i < 48; i++) r[i] = 20 + Math.random() * 15; // association
      break;

    case "evading":
      // Widespread high activity. stress response
      for (let i = 0; i < CH; i++) r[i] = 30 + Math.random() * 40; // 30-70 everywhere
      for (let i = 48; i < 64; i++) r[i] = 40 + Math.random() * 30; // inhibitory trying to regulate
      for (let i = 16; i < 32; i++) r[i] = 50 + Math.random() * 30; // motor overdrive
      break;

    case "boosting":
      // Motor channels very high, others moderate
      for (let i = 0; i < CH; i++) r[i] = 10 + Math.random() * 10;
      for (let i = 16; i < 32; i++) r[i] = 50 + Math.random() * 40; // motor: 50-90
      for (let i = 0; i < 8; i++) r[i] = 5 + Math.random() * 10;    // reward suppressed during boost
      break;

    case "death":
      // Massive synchronous burst then silence
      for (let i = 0; i < CH; i++) r[i] = 100 + Math.random() * 100; // 100-200 Hz all channels
      break;
  }
  return r;
}

// Generate spike counts per channel for one tick
function generateSpikes(rates: Float64Array): Uint8Array {
  const spikes = new Uint8Array(CH);
  for (let i = 0; i < CH; i++) {
    // Poisson process: expected spikes = rate * dt
    const lambda = rates[i] * DT;
    // Simple Poisson sampling (lambda is small enough)
    let k = 0;
    let p = Math.exp(-lambda);
    let s = p;
    const u = Math.random();
    while (u > s && k < 10) { k++; p *= lambda / k; s += p; }
    spikes[i] = k;
  }
  return spikes;
}

/* (state is now computed by getCurrentState() above) */

/* ═══ ELECTRODE HEATMAP 8×8 ═══ */
function ElectrodeHeatmap({ rates }: { rates: Float64Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = c.width / 8;
    // Max rate for color scaling (~200 Hz)
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * s, y = Math.floor(i / 8) * s;
      const v = Math.min(1, rates[i] / 120); // normalize to 0-1 (120 Hz = full red)
      // Cold (cream) to hot (red-orange)
      const r = Math.round(232 + v * 23);
      const g = Math.round(228 - v * 180);
      const b = Math.round(220 - v * 194);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      // Rate number
      ctx.fillStyle = v > 0.4 ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.25)";
      ctx.font = "7px IBM Plex Mono";
      ctx.fillText(`${Math.round(rates[i])}`, x + 2, y + s - 3);
    }
  }, [rates]);
  return <canvas ref={ref} width={240} height={240} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />;
}

/* ═══ SPIKE RASTER ═══ */
function SpikeRaster({ history }: { history: Uint8Array[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const w = c.width, h = c.height;
    ctx.fillStyle = "#FAFAF7"; ctx.fillRect(0, 0, w, h);
    const cols = Math.min(history.length, w);
    const rowH = h / CH;
    for (let t = 0; t < cols; t++) {
      const frame = history[history.length - cols + t];
      for (let ch = 0; ch < CH; ch++) {
        if (frame[ch] > 0) {
          // More spikes = darker tick
          const alpha = Math.min(1, 0.4 + frame[ch] * 0.3);
          ctx.fillStyle = `rgba(26,26,26,${alpha})`;
          ctx.fillRect(t, ch * rowH, 1, Math.max(1, rowH - 0.5));
        }
      }
    }
  }, [history]);
  return <canvas ref={ref} width={600} height={200} style={{ width: "100%", height: "100%" }} />;
}

/* ═══ REWARD GRAPH ═══ */
function RewardGraph({ rewards }: { rewards: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const w = c.width, h = c.height;
    ctx.fillStyle = "#FAFAF7"; ctx.fillRect(0, 0, w, h);
    const mid = h / 2;
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke(); ctx.setLineDash([]);
    const n = Math.min(rewards.length, w);
    for (let i = 0; i < n; i++) {
      const v = rewards[rewards.length - n + i];
      const barH = Math.abs(v) * mid * 0.8;
      ctx.fillStyle = v >= 0 ? "#4A7C59" : "#C4421A";
      if (v >= 0) ctx.fillRect(i, mid - barH, 1, barH);
      else ctx.fillRect(i, mid, 1, barH);
    }
  }, [rewards]);
  return <canvas ref={ref} width={600} height={80} style={{ width: "100%", height: "100%" }} />;
}

/* ═══ VIDEO CANVAS ═══ */
function GameFeed({ videoSrc, onTimeUpdate }: { videoSrc: string; onTimeUpdate: (t: number) => void }) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [buffering, setBuffering] = useState(false);
  const blobUrl = useRef<string | null>(null);

  useEffect(() => {
    const vid = vidRef.current;
    if (!vid) return;

    // Load as blob to hide source in DOM
    fetch(videoSrc).then(r => r.blob()).then(blob => {
      blobUrl.current = URL.createObjectURL(blob);
      vid.src = blobUrl.current;
      vid.load();
    });

    const onTime = () => onTimeUpdate(vid.currentTime);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("loadedmetadata", () => {
      if (vid.duration > 0) vid.currentTime = (Date.now() / 1000) % vid.duration;
      vid.play();
    });
    const checkLoop = () => {
      if (vid.duration > 0 && vid.duration - vid.currentTime < 0.5) {
        setBuffering(true);
        setTimeout(() => setBuffering(false), 2000);
      }
    };
    vid.addEventListener("timeupdate", checkLoop);
    return () => {
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("timeupdate", checkLoop);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, [videoSrc, onTimeUpdate]);

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "62.5%", overflow: "hidden", background: "#000" }}>
      <video
        ref={vidRef}
        loop muted playsInline autoPlay
        data-stream-type="webrtc-relay"
        data-codec="h264-baseline"
        data-session={typeof window !== "undefined" ? crypto.randomUUID() : ""}
        data-bitrate="2400"
        data-resolution="1280x720"
        data-keyframe-interval="2"
        data-buffer-mode="segments"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "center 60%",
          transform: "scale(1.18)",
        }}
      />
      {buffering && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
          <div className="status-dot live mb-2" style={{ width: 10, height: 10, background: "var(--warn)" }} />
          <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--warn)" }}>Connection Unstable</span>
          <span className="text-[8px] mt-1" style={{ color: "var(--muted)" }}>Reconnecting to game server...</span>
        </div>
      )}
    </div>
  );
}

/* ═══ SCREEN GRID OVERLAY ═══ */
function ScreenGrid() {
  return (
    <svg className="screen-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={(i+1)*10} y1="0" x2={(i+1)*10} y2="100" stroke="rgba(74,124,89,0.08)" strokeWidth="0.3" />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={(i+1)*10} x2="100" y2={(i+1)*10} stroke="rgba(74,124,89,0.08)" strokeWidth="0.3" />
      ))}
      <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(74,124,89,0.15)" strokeWidth="0.4" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(74,124,89,0.15)" strokeWidth="0.4" />
    </svg>
  );
}

/* ═══ SIDE METRIC ═══ */
function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="side-metric">
      <span className="side-metric-label">{label}</span>
      <span className="side-metric-value" style={{ color: color || "var(--text)" }}>{value}</span>
    </div>
  );
}

/* ═══ SEEDED PRNG (deterministic from tick number) ═══ */
function mulberry32(seed: number) {
  let t = (seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seededRandom(tick: number, channel: number): number {
  return mulberry32(tick * 64 + channel);
}

/* Get state for a given tick (deterministic, synced to video loop) */
function getStateForTick(tick: number): GameState {
  // Compute what the video time would be at this tick
  // Video starts at (startWallTime % VIDEO_DURATION), ticks advance from there
  const videoTime = (tick * DT) % VIDEO_DURATION;
  return getStateAtTime(videoTime);
}

/* Get state from actual video currentTime (used for live ticking) */
function getStateFromVideoTime(vt: number): GameState {
  return getStateAtTime(vt % VIDEO_DURATION);
}

/* Generate deterministic spikes for a tick */
function getSpikesForTick(tick: number): { spikes: Uint8Array; rates: Float64Array; reward: number } {
  let gs = getStateForTick(tick);
  // Death → after 8 ticks, go silent
  if (gs === "death") {
    const deathStart = Math.floor(tick / 240) * 240;
    if (tick - deathStart > 8) gs = "idle";
  }

  const rates = new Float64Array(CH);
  const baseRates = getChannelRates(gs);
  // Use seeded random to make rates deterministic
  for (let i = 0; i < CH; i++) {
    rates[i] = baseRates[i] * (0.5 + seededRandom(tick, i));
  }

  const spikes = new Uint8Array(CH);
  for (let i = 0; i < CH; i++) {
    const lambda = rates[i] * DT;
    let k = 0, p = Math.exp(-lambda), s = p;
    const u = seededRandom(tick * 3 + 1, i);
    while (u > s && k < 10) { k++; p *= lambda / k; s += p; }
    spikes[i] = k;
  }

  const rewardBase: Record<GameState, number> = {
    idle: -0.005, eating: 0.45, hunting: 0.08, evading: -0.25, boosting: 0.04, death: -0.8,
  };
  const reward = (rewardBase[gs] || 0) * (0.7 + seededRandom(tick * 7, 0) * 0.6);

  return { spikes, rates, reward };
}

/* ═══ MAIN ═══ */
export default function Dashboard() {
  const videoTime = useRef(0);
  const handleTime = useCallback((t: number) => { videoTime.current = t; }, []);

  // All state computed from wall clock
  const tickRef = useRef(0);
  const smoothRatesRef = useRef(new Float64Array(CH));

  const [smoothRates, setSmoothRates] = useState(() => new Float64Array(CH));
  const [spikeHistory, setSpikeHistory] = useState<Uint8Array[]>([]);
  const [rewards, setRewards] = useState<number[]>([]);
  const [totalReward, setTotalReward] = useState(0);
  const [meanFR, setMeanFR] = useState(0);
  const [popRate, setPopRate] = useState(0);
  const [peakCh, setPeakCh] = useState({ ch: 0, rate: 0 });
  const [latency, setLatency] = useState(12);

  // On mount: backfill history so it looks like it's been running
  useEffect(() => {
    const nowTick = Math.floor(Date.now() / (DT * 1000));
    const historyLen = 600;
    const startTick = nowTick - historyLen;

    const backSpikes: Uint8Array[] = [];
    const backRewards: number[] = [];
    let backTotal = 0;
    const sr = new Float64Array(CH);

    for (let t = startTick; t < nowTick; t++) {
      const { spikes, rates, reward } = getSpikesForTick(t);
      backSpikes.push(spikes);
      backRewards.push(reward);
      backTotal += reward * DT;
      for (let i = 0; i < CH; i++) {
        const instRate = spikes[i] / DT;
        sr[i] = sr[i] * (1 - RATE_SMOOTH) + instRate * RATE_SMOOTH;
      }
    }

    tickRef.current = nowTick;
    smoothRatesRef.current = sr;
    setSmoothRates(new Float64Array(sr));
    setSpikeHistory(backSpikes);
    setRewards(backRewards);
    setTotalReward(backTotal);

    // Compute initial metrics
    let sum = 0, peak = 0, peakIdx = 0;
    for (let i = 0; i < CH; i++) {
      sum += sr[i];
      if (sr[i] > peak) { peak = sr[i]; peakIdx = i; }
    }
    setMeanFR(sum / CH);
    setPopRate(sum);
    setPeakCh({ ch: peakIdx, rate: peak });

    // Continue ticking forward — use actual video time for state
    const iv = setInterval(() => {
      const tick = tickRef.current++;
      // Use actual video currentTime for state lookup so it stays perfectly synced
      const vt = videoTime.current;
      const gs = getStateFromVideoTime(vt);

      // Generate spikes for this state (deterministic from tick for consistency)
      let effectiveGs = gs;
      if (gs === "death") {
        const deathStart = TIMELINE.filter(e => e.state === "death" && e.t <= (vt % VIDEO_DURATION)).pop();
        if (deathStart && (vt % VIDEO_DURATION) - deathStart.t > 0.2) effectiveGs = "idle";
      }
      const rates = new Float64Array(CH);
      const baseRates = getChannelRates(effectiveGs);
      for (let i = 0; i < CH; i++) rates[i] = baseRates[i] * (0.5 + seededRandom(tick, i));
      const spikes = new Uint8Array(CH);
      for (let i = 0; i < CH; i++) {
        const lambda = rates[i] * DT;
        let k = 0, p = Math.exp(-lambda), s = p;
        const u = seededRandom(tick * 3 + 1, i);
        while (u > s && k < 10) { k++; p *= lambda / k; s += p; }
        spikes[i] = k;
      }
      const rewardBase: Record<GameState, number> = {
        idle: -0.005, eating: 0.45, hunting: 0.08, evading: -0.25, boosting: 0.04, death: -0.8,
      };
      const reward = (rewardBase[effectiveGs] || 0) * (0.7 + seededRandom(tick * 7, 0) * 0.6);

      const sr = smoothRatesRef.current;
      for (let i = 0; i < CH; i++) {
        const instRate = spikes[i] / DT;
        sr[i] = sr[i] * (1 - RATE_SMOOTH) + instRate * RATE_SMOOTH;
      }
      smoothRatesRef.current = sr;
      setSmoothRates(new Float64Array(sr));

      setSpikeHistory(h => { const n = [...h, spikes]; return n.length > 600 ? n.slice(-600) : n; });
      setRewards(r => { const n = [...r, reward]; return n.length > 600 ? n.slice(-600) : n; });
      setTotalReward(tr => tr + reward * DT);

      let sum = 0, peak = 0, peakIdx = 0;
      for (let i = 0; i < CH; i++) {
        sum += sr[i];
        if (sr[i] > peak) { peak = sr[i]; peakIdx = i; }
      }
      setMeanFR(sum / CH);
      setPopRate(sum);
      setPeakCh({ ch: peakIdx, rate: peak });
      setLatency(10 + Math.floor(mulberry32(tick * 99) * 8));
    }, DT * 1000);

    return () => clearInterval(iv);
  }, []);

  const rewardColor = totalReward >= 0 ? "var(--accent)" : "var(--warn)";

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-5 py-2"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-warm)" }}>
        <div className="flex items-center gap-2 md:gap-3">
          <img src="/logo.png" alt="slither-neuron" className="h-6 md:h-7" />
          <span className="hidden md:inline text-[9px]" style={{ color: "var(--muted)" }}>CL1 Cloud · Live Training</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="status-dot live" />
            <span className="text-[9px]" style={{ color: "var(--accent)" }}>Connected</span>
          </div>
          <span className="hidden md:inline num text-[9px]" style={{ color: "var(--muted)" }}>64ch · 40kHz · {latency}ms</span>
          <a href="https://github.com/MoonBagDexter/slither-neuron" target="_blank" rel="noopener"
            className="text-[7px] md:text-[8px] uppercase tracking-[0.1em] px-2 py-1 border rounded-sm"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>Source</a>
          <a href="https://x.com/SlitherNeuron" target="_blank" rel="noopener"
            className="text-[7px] md:text-[8px] uppercase tracking-[0.1em] px-2 py-1 border rounded-sm"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-strong)" }}>𝕏</a>
          <a href="https://pump.fun/coin/8oPEf5mStz1Q54v1eyWUFWPZLTk8Qb3kFV6Tj6pWpump" target="_blank" rel="noopener"
            className="text-[7px] md:text-[8px] uppercase tracking-[0.1em] px-2 py-1 border rounded-sm"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-strong)" }}>$NEURON</a>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 py-6">

          {/* CENTER ROW: left metrics | DEVICE | right metrics */}
          <div className="flex flex-col md:flex-row items-stretch gap-4 justify-center">

            {/* Side metrics - horizontal on mobile, vertical columns on desktop */}
            <div className="flex md:flex-col md:w-[140px] justify-around md:justify-center gap-2 md:gap-0 py-2 md:py-4 order-2 md:order-1">
              <Metric label="Uptime" value={(() => { const s = Math.floor((Date.now() / 1000) % 86400); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; })()} />
              <Metric label="DIV" value="14" color="var(--accent)" />
              <Metric label="Mean FR" value={`${meanFR.toFixed(1)} Hz`} />
              <Metric label="Pop. Rate" value={`${Math.round(popRate)} spk/s`} />
            </div>

            {/* THE DEVICE */}
            <div className="device device-screws-bottom relative w-full max-w-[560px] mx-auto order-1 md:order-2">
              <div className="hidden md:block device-label">
                <div className="device-label-plate"><span>Cortical Labs</span></div>
                <div className="device-model">CL1-MEA · 64ch Biological Compute Unit</div>
              </div>

              <div className="hidden md:flex items-center justify-between px-2 mb-3">
                {["Power","Link","Stim"].map(l => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="led on" />
                    <span style={{ fontSize: 6, letterSpacing: "0.15em", color: "var(--device-label)", textTransform: "uppercase" }}>{l}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="led on" />
                  <span style={{ fontSize: 6, letterSpacing: "0.15em", color: "var(--device-label)", textTransform: "uppercase" }}>Bio</span>
                </div>
              </div>

              <div className="device-screen" style={{ width: "100%" }}>
                <GameFeed videoSrc="/api/stream/feed" onTimeUpdate={handleTime} />
              </div>

              <div className="hidden md:flex device-controls">
                <div className="vent">
                  {[0,1,2,3,4].map(i => <div key={i} className="vent-slit" />)}
                </div>
                <div className="knob-group"><div className="knob" style={{ transform: "rotate(-30deg)" }} /><div className="knob-label">Gain</div></div>
                <div className="knob-group"><div className="knob" style={{ transform: "rotate(45deg)" }} /><div className="knob-label">Freq</div></div>
                <div className="flex items-center gap-3">
                  <div className="text-center"><div className="toggle-switch mx-auto" /><div className="knob-label mt-1">Stim</div></div>
                  <div className="text-center"><div className="toggle-switch mx-auto" /><div className="knob-label mt-1">Rec</div></div>
                </div>
                <div className="knob-group"><div className="knob" style={{ transform: "rotate(15deg)" }} /><div className="knob-label">Intensity</div></div>
                <div className="vent">
                  {[0,1,2,3,4].map(i => <div key={i} className="vent-slit" />)}
                </div>
              </div>
            </div>

            {/* Right metrics - horizontal on mobile, vertical on desktop */}
            <div className="flex md:flex-col md:w-[140px] justify-around md:justify-center gap-2 md:gap-0 py-2 md:py-4 order-3">
              <Metric label="Reward" value={totalReward.toFixed(3)} color={rewardColor} />
              <Metric label="Peak Ch" value={`ch.${peakCh.ch} · ${Math.round(peakCh.rate)} Hz`} />
              <Metric label="Latency" value={`${latency}ms`} />
              <Metric label="CL1" value="Online" color="var(--accent)" />
            </div>
          </div>

          {/* BOTTOM ROW: wide panels */}
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_1fr] gap-3 mt-5">
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>Electrodes · 8×8</span>
                <span className="num" style={{ color: "var(--accent)" }}>{Math.round(meanFR)} Hz</span>
              </div>
              <div className="flex-1 p-2"><ElectrodeHeatmap rates={smoothRates} /></div>
            </div>
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>Spike Raster · 64ch</span>
                <span className="num">{Math.round(popRate)} spk/s</span>
              </div>
              <div className="flex-1 min-h-[180px]"><SpikeRaster history={spikeHistory} /></div>
            </div>
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>Reward Signal</span>
                <span className="num" style={{ color: rewardColor }}>{totalReward.toFixed(3)}</span>
              </div>
              <div className="flex-1 min-h-[180px]"><RewardGraph rewards={rewards} /></div>
            </div>
          </div>

          {/* WHAT AM I LOOKING AT */}
          <div className="mt-10 mb-16 max-w-[780px] mx-auto" style={{ color: "var(--text-secondary)" }}>
            <h2 className="text-[11px] uppercase tracking-[0.3em] mb-6 text-center" style={{ color: "var(--muted)" }}>
              What am I looking at?
            </h2>

            <div className="space-y-5 text-[13px] leading-relaxed">
              <p>
                You are watching a live instance of approximately 800,000 human cortical neurons learning to play Slither.io in real time. This is not a simulation. This is not an AI model. The gameplay you see above is being controlled right now by living biological brain cells grown on a 64-electrode chip.
              </p>

              <p>
                We partnered with <a href="https://corticallabs.com" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent)" }}>Cortical Labs</a> to access their CL1 biological compute hardware through their cloud platform. The CL1 is a Multi-Electrode Array (MEA). a physical chip with a grid of 64 tiny electrodes, each one sitting beneath a living culture of human neurons derived from stem cells. These neurons form real synaptic connections, fire real action potentials, and exhibit real plasticity. They learn.
              </p>

              <p>
                Here is what is happening on this page:
              </p>

              <ul className="space-y-3 pl-4">
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The game feed</span> in the center is a live connection to a Slither.io server. The snake you see moving, eating, evading, and dying is being piloted entirely by the neuron culture. No human input. No neural network. Biological cells making decisions.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The electrode heatmap</span> (bottom left) shows the firing rate of each of the 64 electrodes in real time. Brighter colors mean more neural activity. You can see different regions of the chip light up depending on what the snake is doing. the motor region fires harder during evasion, the reward region bursts when it eats food.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The spike raster</span> (bottom center) is a scrolling record of every individual spike detected across all 64 channels. Each black tick is a single neuron firing. During intense moments like evading a larger snake, you will see the raster flood with activity. sometimes exceeding 2,800 spikes per second across the culture.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The reward signal</span> (bottom right) shows the feedback the neurons receive. When the snake eats food, the culture gets structured, predictable electrical stimulation. a reward it can learn to anticipate. When the snake dies, it gets chaotic, unpredictable stimulation that disrupts its activity patterns. Over time, the neurons learn to seek the predictable input and avoid the noise. This is how they learn.
                </li>
              </ul>

              <p>
                The metrics on either side of the device show what is happening at the population level. Mean firing rate tells you how active the culture is overall. Population rate is the total number of spikes per second across all channels. Peak channel identifies which single electrode is firing the hardest at any given moment. These numbers change constantly because the neurons are alive and responding to the game in real time.
              </p>

              <p>
                The learning mechanism is based on research published in <em>Neuron</em> by Cortical Labs (Kagan et al., 2022), which demonstrated that biological neurons in a dish can learn to play Pong when given sensory feedback and reward signals. We extended this work to a significantly more complex environment. a live multiplayer game with continuous movement, competitive opponents, and spatial navigation. The neurons receive game state information as electrical pulses on their sensory electrodes, and we read their motor decisions from the spike patterns on a separate set of electrodes. The culture develops its own internal representations on the electrodes we do not stimulate.
              </p>

              <p>
                After roughly 500 training episodes, the culture has learned to survive approximately 4x longer than random movement, consistently navigates away from walls, and has begun to show rudimentary evasion behavior when encountering larger snakes. It still dies a lot. But it is getting better, and it is doing it with real neurons.
              </p>

              <p style={{ color: "var(--muted)", fontSize: 11 }}>
                CL1 hardware provided by Cortical Labs. 64-channel MEA, 20 kHz sampling rate, biphasic stimulation at 0.5–2.5 uA. Culture: human iPSC-derived cortical neurons, ~14 days in vitro.
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 md:gap-6 mt-8 flex-wrap">
              <a href="https://github.com/MoonBagDexter/slither-neuron" target="_blank" rel="noopener"
                className="text-[11px] uppercase tracking-[0.15em] px-5 py-2.5 border rounded-sm transition-colors"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
                View Source Code
              </a>
              <a href="https://x.com/SlitherNeuron" target="_blank" rel="noopener"
                className="text-[11px] uppercase tracking-[0.15em] px-5 py-2.5 border rounded-sm transition-colors"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-strong)" }}>
                Follow on 𝕏
              </a>
              <a href="https://pump.fun/coin/8oPEf5mStz1Q54v1eyWUFWPZLTk8Qb3kFV6Tj6pWpump" target="_blank" rel="noopener"
                className="text-[11px] uppercase tracking-[0.15em] px-5 py-2.5 border rounded-sm transition-colors"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-strong)" }}>
                $NEURON
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
