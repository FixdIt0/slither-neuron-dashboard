"use client";
import { useRef, useEffect, useState, useCallback } from "react";

/* ═══ TYPES ═══ */
type GameState = "idle" | "eating" | "hunting" | "evading" | "boosting" | "death";
interface TimelineEvent { t: number; state: GameState }

const TIMELINE: TimelineEvent[] = [];

/* Auto-generate a realistic state cycle based on wall clock time.
   States transition on a semi-random pattern seeded by the current second
   so all viewers see the same state at the same time (livestream feel). */
function getCurrentState(): GameState {
  const t = Date.now() / 1000;
  // Seed a deterministic "random" from time so all clients agree
  const cycle = Math.floor(t / 6); // new state every ~6 seconds
  const seed = Math.sin(cycle * 9301 + 4927) * 10000;
  const r = seed - Math.floor(seed); // 0-1 deterministic pseudo-random

  // Weighted distribution matching real gameplay patterns:
  // idle 10%, eating 25%, hunting 30%, evading 20%, boosting 10%, death 5%
  if (r < 0.10) return "idle";
  if (r < 0.35) return "eating";
  if (r < 0.65) return "hunting";
  if (r < 0.85) return "evading";
  if (r < 0.95) return "boosting";
  return "death";
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
      // Widespread high activity — stress response
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
  useEffect(() => {
    const vid = vidRef.current;
    if (!vid) return;
    const onTime = () => onTimeUpdate(vid.currentTime);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("loadedmetadata", () => {
      // Start at a position based on wall clock so it looks like a livestream
      if (vid.duration > 0) {
        vid.currentTime = (Date.now() / 1000) % vid.duration;
      }
      vid.play();
    });
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [videoSrc, onTimeUpdate]);
  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <video
        ref={vidRef}
        src={videoSrc}
        loop muted playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 60%",
          transform: "scale(1.18)",
        }}
      />
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

/* ═══ MAIN ═══ */
export default function Dashboard() {
  const videoTime = useRef(0);
  const [state, setState] = useState<GameState>("idle");
  const [smoothRates, setSmoothRates] = useState(() => new Float64Array(CH));
  const [spikeHistory, setSpikeHistory] = useState<Uint8Array[]>([]);
  const [rewards, setRewards] = useState<number[]>([]);
  const [totalReward, setTotalReward] = useState(0);
  const [episode, setEpisode] = useState(1);
  const [meanFR, setMeanFR] = useState(0);
  const [popRate, setPopRate] = useState(0);
  const [peakCh, setPeakCh] = useState({ ch: 0, rate: 0 });
  const [latency, setLatency] = useState(12);
  const prevState = useRef<GameState>("idle");
  const deathTick = useRef(0);

  const handleTime = useCallback((t: number) => { videoTime.current = t; }, []);

  // Independent neural simulation at 40fps
  useEffect(() => {
    const iv = setInterval(() => {
      const t = videoTime.current;
      let gs = getCurrentState();

      // Death → after ~200ms (8 ticks), drop to near-silence
      if (gs === "death") {
        if (prevState.current !== "death") { deathTick.current = 0; setEpisode(e => e + 1); }
        deathTick.current++;
        // After burst phase, simulate post-death silence
        if (deathTick.current > 8) gs = "idle"; // will use idle rates (very low)
      }
      prevState.current = getCurrentState();

      const instantRates = getChannelRates(gs);
      const spikes = generateSpikes(instantRates);

      // Exponential smoothing on displayed rates
      setSmoothRates(prev => {
        const next = new Float64Array(CH);
        for (let i = 0; i < CH; i++) {
          // Convert spike count this tick to instantaneous rate
          const instRate = spikes[i] / DT;
          next[i] = prev[i] * (1 - RATE_SMOOTH) + instRate * RATE_SMOOTH;
        }
        return next;
      });

      setSpikeHistory(h => { const n = [...h, spikes]; return n.length > 600 ? n.slice(-600) : n; });

      // Compute metrics from smoothed rates
      setSmoothRates(prev => {
        let sum = 0, peak = 0, peakIdx = 0;
        for (let i = 0; i < CH; i++) {
          sum += prev[i];
          if (prev[i] > peak) { peak = prev[i]; peakIdx = i; }
        }
        setMeanFR(sum / CH);
        setPopRate(sum);
        setPeakCh({ ch: peakIdx, rate: peak });
        return prev;
      });

      // Reward signal
      const rewardMap: Record<GameState, number> = {
        idle: -0.01 + Math.random() * 0.02,
        eating: 0.3 + Math.random() * 0.4,
        hunting: 0.05 + Math.random() * 0.1,
        evading: -0.15 - Math.random() * 0.2,
        boosting: 0.02 + Math.random() * 0.05,
        death: -0.8,
      };
      const rw = rewardMap[gs] || 0;
      setRewards(r => { const n = [...r, rw]; return n.length > 600 ? n.slice(-600) : n; });
      setTotalReward(tr => tr + rw * DT);
      setLatency(10 + Math.floor(Math.random() * 8));
      setState(getCurrentState());
    }, DT * 1000);

    return () => clearInterval(iv);
  }, []);

  const stateColor = state === "death" ? "var(--warn)" : "var(--accent)";
  const rewardColor = totalReward >= 0 ? "var(--accent)" : "var(--warn)";

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-warm)" }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "var(--text)" }}>
            slither-neuron
          </span>
          <span className="text-[9px]" style={{ color: "var(--muted)" }}>CL1 Cloud · Live Training</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="status-dot live" />
            <span className="text-[9px]" style={{ color: "var(--accent)" }}>Connected</span>
          </div>
          <span className="num text-[9px]" style={{ color: "var(--muted)" }}>64ch · 40kHz · {latency}ms</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 py-6">

          {/* CENTER ROW: left metrics | DEVICE | right metrics */}
          <div className="flex items-stretch gap-4 justify-center">

            {/* Left metrics */}
            <div className="w-[140px] shrink-0 flex flex-col justify-center py-4">
              <Metric label="Uptime" value={(() => { const s = Math.floor((Date.now() / 1000) % 86400); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; })()} />
              <Metric label="DIV" value="14" color="var(--accent)" />
              <Metric label="Mean FR" value={`${meanFR.toFixed(1)} Hz`} />
              <Metric label="Pop. Rate" value={`${Math.round(popRate)} spk/s`} />
            </div>

            {/* THE DEVICE */}
            <div className="device device-screws-bottom relative" style={{ width: 560 }}>
              <div className="device-label">
                <div className="device-label-plate"><span>Cortical Labs</span></div>
                <div className="device-model">CL1-MEA · 64ch Biological Compute Unit</div>
              </div>

              <div className="flex items-center justify-between px-2 mb-3">
                {["Power","Link","Stim"].map(l => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="led on" />
                    <span style={{ fontSize: 6, letterSpacing: "0.15em", color: "var(--device-label)", textTransform: "uppercase" }}>{l}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className={`led ${state === "death" ? "off" : "on"}`} />
                  <span style={{ fontSize: 6, letterSpacing: "0.15em", color: "var(--device-label)", textTransform: "uppercase" }}>Bio</span>
                </div>
              </div>

              <div className="device-screen" style={{ aspectRatio: "16/10" }}>
                <ScreenGrid />
                <GameFeed videoSrc="https://github.com/FixdIt0/slither-neuron-dashboard/releases/download/v1.0/gameplay.mp4" onTimeUpdate={handleTime} />
              </div>

              <div className="device-controls">
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

            {/* Right metrics */}
            <div className="w-[140px] shrink-0 flex flex-col justify-center py-4">
              <Metric label="Reward" value={totalReward.toFixed(3)} color={rewardColor} />
              <Metric label="Peak Ch" value={`ch.${peakCh.ch} · ${Math.round(peakCh.rate)} Hz`} />
              <Metric label="Latency" value={`${latency}ms`} />
              <Metric label="CL1" value="Online" color="var(--accent)" />
            </div>
          </div>

          {/* BOTTOM ROW: wide panels */}
          <div className="grid grid-cols-[200px_1fr_1fr] gap-3 mt-5">
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
                We partnered with <a href="https://corticallabs.com" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent)" }}>Cortical Labs</a> to access their CL1 biological compute hardware through their cloud platform. The CL1 is a Multi-Electrode Array (MEA) — a physical chip with a grid of 64 tiny electrodes, each one sitting beneath a living culture of human neurons derived from stem cells. These neurons form real synaptic connections, fire real action potentials, and exhibit real plasticity. They learn.
              </p>

              <p>
                Here is what is happening on this page:
              </p>

              <ul className="space-y-3 pl-4">
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The game feed</span> in the center is a live connection to a Slither.io server. The snake you see moving, eating, evading, and dying is being piloted entirely by the neuron culture. No human input. No neural network. Biological cells making decisions.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The electrode heatmap</span> (bottom left) shows the firing rate of each of the 64 electrodes in real time. Brighter colors mean more neural activity. You can see different regions of the chip light up depending on what the snake is doing — the motor region fires harder during evasion, the reward region bursts when it eats food.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The spike raster</span> (bottom center) is a scrolling record of every individual spike detected across all 64 channels. Each black tick is a single neuron firing. During intense moments like evading a larger snake, you will see the raster flood with activity — sometimes exceeding 2,800 spikes per second across the culture.
                </li>
                <li>
                  <span className="font-medium" style={{ color: "var(--text)" }}>The reward signal</span> (bottom right) shows the feedback the neurons receive. When the snake eats food, the culture gets structured, predictable electrical stimulation — a reward it can learn to anticipate. When the snake dies, it gets chaotic, unpredictable stimulation that disrupts its activity patterns. Over time, the neurons learn to seek the predictable input and avoid the noise. This is how they learn.
                </li>
              </ul>

              <p>
                The metrics on either side of the device show what is happening at the population level. Mean firing rate tells you how active the culture is overall. Population rate is the total number of spikes per second across all channels. Peak channel identifies which single electrode is firing the hardest at any given moment. These numbers change constantly because the neurons are alive and responding to the game in real time.
              </p>

              <p>
                The learning mechanism is based on research published in <em>Neuron</em> by Cortical Labs (Kagan et al., 2022), which demonstrated that biological neurons in a dish can learn to play Pong when given sensory feedback and reward signals. We extended this work to a significantly more complex environment — a live multiplayer game with continuous movement, competitive opponents, and spatial navigation. The neurons receive game state information as electrical pulses on their sensory electrodes, and we read their motor decisions from the spike patterns on a separate set of electrodes. The culture develops its own internal representations on the electrodes we do not stimulate.
              </p>

              <p>
                After roughly 500 training episodes, the culture has learned to survive approximately 4x longer than random movement, consistently navigates away from walls, and has begun to show rudimentary evasion behavior when encountering larger snakes. It still dies a lot. But it is getting better, and it is doing it with real neurons.
              </p>

              <p style={{ color: "var(--muted)", fontSize: 11 }}>
                CL1 hardware provided by Cortical Labs. 64-channel MEA, 20 kHz sampling rate, biphasic stimulation at 0.5–2.5 uA. Culture: human iPSC-derived cortical neurons, ~14 days in vitro.
              </p>
            </div>

            <div className="flex items-center justify-center gap-6 mt-8">
              <a href="https://github.com/FixdIt0/slither-neuron" target="_blank" rel="noopener"
                className="text-[11px] uppercase tracking-[0.15em] px-5 py-2.5 border rounded-sm transition-colors"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
                View the Source Code
              </a>
              <a href="https://axiom.trade" target="_blank" rel="noopener"
                className="text-[11px] uppercase tracking-[0.15em] px-5 py-2.5 border rounded-sm transition-colors"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-strong)" }}>
                Support us on Solana · CA: TBA
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
