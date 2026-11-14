"use client";

// Plan B mockup: the demo as a top-down floor plan for big projector screens.
// Every waiter is an equal token standing in their zone; one magnified wrist
// shows what the lead waiter feels. The presenter steps through scripted
// beats with the arrow keys. All states are hand-set for the mockup; there is
// no live routing behind them.

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

// ---- light projector palette ----------------------------------------------
// Light ground survives a washed-out projector; every pair below is checked
// for contrast against the ground or its own fill.
const C = {
  ground: "#f3efe6", // page
  room: "#ffffff", // zone floors
  roomLine: "#d6cfc1",
  ink: "#17141f", // 16:1 on ground
  muted: "#57505f", // 6.7:1 on ground
  seat: "#cfc7b8",
  wait: "#e89a00", // amber chairs, lines
  waitTint: "#fff2cf",
  urgent: "#d42a1e",
  urgentTint: "#ffe3df",
  greeted: "#0f7a55",
  greetedTint: "#dcf3e8",
  clean: "#2458d6",
};

type TableState = "free" | "wait" | "urgent" | "dining";
type Tone = "wait" | "urgent";

type Beat = {
  title: string;
  caption: string;
  tables: Partial<Record<number, { s: TableState; text: string }>>;
  moved?: Partial<Record<number, [number, number]>>; // waiter → new position
  alerted?: Partial<Record<number, Tone>>; // waiter → pulse tone
  busy?: number[];
  links: { table: number; staff: number; tone: Tone; runner?: boolean }[];
  wrist: WristState;
  score: { greeted: number; onTime: number };
  finale?: boolean;
};

type WristState =
  | { kind: "ready"; staff: number; zone: string }
  | { kind: "alert"; staff: number; zone: string; table: number; time: string; urgent: boolean; note: string }
  | { kind: "greeted"; staff: number; zone: string; table: number; seconds: number };

// ---- floor geometry (SVG user units, viewBox 960 × 600) ---------------------

const ZONES = [
  { id: "A", x: 20, tables: [1, 2, 3, 4], staff: [1, 4, 7] },
  { id: "B", x: 330, tables: [5, 6, 7, 8], staff: [2, 5, 8] },
  { id: "C", x: 640, tables: [9, 10, 11, 12], staff: [3, 6] },
];

const TABLE_POS: Record<number, [number, number]> = {};
const HOME: Record<number, [number, number]> = {};
for (const z of ZONES) {
  z.tables.forEach((t, i) => {
    TABLE_POS[t] = [z.x + (i % 2 === 0 ? 80 : 220), i < 2 ? 150 : 330];
  });
  // Waiters stand in the wide aisle between the two rows of tables.
  z.staff.forEach((s, i) => {
    HOME[s] = [z.x + 60 + i * 90, 240];
  });
}
HOME[10] = [400, 535]; // runners wait at the pass
HOME[11] = [560, 535];
HOME[9] = [860, 535]; // on break

const DINING_START = {
  2: { s: "dining", text: "W4" },
  6: { s: "dining", text: "W5" },
  11: { s: "dining", text: "W6" },
} as const;

// ---- the script -------------------------------------------------------------

const BEATS: Beat[] = [
  {
    title: "The floor",
    caption: "12 tables, 3 zones, 11 staff, each wearing a ZeroBell band.",
    tables: { ...DINING_START },
    links: [],
    wrist: { kind: "ready", staff: 1, zone: "Zone A" },
    score: { greeted: 0, onTime: 0 },
  },
  {
    title: "A guest sits at Table 4",
    caption: "Nobody waved. The seat sensor did it, and Zone A's bands buzz.",
    tables: { ...DINING_START, 4: { s: "wait", text: "00:15" } },
    alerted: { 1: "wait", 4: "wait", 7: "wait" },
    links: [
      { table: 4, staff: 1, tone: "wait" },
      { table: 4, staff: 4, tone: "wait" },
      { table: 4, staff: 7, tone: "wait" },
    ],
    wrist: { kind: "alert", staff: 1, zone: "Zone A", table: 4, time: "00:15", urgent: false, note: "Seat sensor alert" },
    score: { greeted: 0, onTime: 0 },
  },
  {
    title: "5 seconds left",
    caption: "Still waiting? After 8 seconds the runners are called in too.",
    tables: { ...DINING_START, 4: { s: "urgent", text: "00:05" } },
    alerted: { 1: "urgent", 4: "urgent", 7: "urgent", 10: "urgent", 11: "urgent" },
    links: [
      { table: 4, staff: 1, tone: "urgent" },
      { table: 4, staff: 4, tone: "urgent" },
      { table: 4, staff: 7, tone: "urgent" },
      { table: 4, staff: 10, tone: "urgent", runner: true },
      { table: 4, staff: 11, tone: "urgent", runner: true },
    ],
    wrist: { kind: "alert", staff: 1, zone: "Zone A", table: 4, time: "00:05", urgent: true, note: "Seat sensor alert" },
    score: { greeted: 0, onTime: 0 },
  },
  {
    title: "Greeted in 11 seconds",
    caption: "W1 taps Attending and walks over. The guest did nothing.",
    tables: { ...DINING_START, 4: { s: "dining", text: "W1" } },
    moved: { 1: [240, 412] },
    busy: [1],
    links: [],
    wrist: { kind: "greeted", staff: 1, zone: "Zone A", table: 4, seconds: 11 },
    score: { greeted: 1, onTime: 1 },
  },
  {
    title: "Rush hour",
    caption: "Four guests at once. Each zone's free staff are buzzed; runners back up Table 7.",
    tables: {
      ...DINING_START,
      4: { s: "dining", text: "W1" },
      1: { s: "wait", text: "00:12" },
      7: { s: "urgent", text: "00:04" },
      9: { s: "wait", text: "00:13" },
      12: { s: "wait", text: "00:13" },
    },
    moved: { 1: [240, 412] },
    busy: [1],
    alerted: { 4: "wait", 7: "wait", 2: "urgent", 5: "urgent", 8: "urgent", 3: "wait", 6: "wait", 10: "urgent", 11: "urgent" },
    links: [
      { table: 1, staff: 4, tone: "wait" },
      { table: 1, staff: 7, tone: "wait" },
      { table: 7, staff: 2, tone: "urgent" },
      { table: 7, staff: 5, tone: "urgent" },
      { table: 7, staff: 8, tone: "urgent" },
      { table: 7, staff: 10, tone: "urgent", runner: true },
      { table: 7, staff: 11, tone: "urgent", runner: true },
      { table: 9, staff: 3, tone: "wait" },
      { table: 9, staff: 6, tone: "wait" },
      { table: 12, staff: 3, tone: "wait" },
      { table: 12, staff: 6, tone: "wait" },
    ],
    wrist: { kind: "alert", staff: 2, zone: "Zone B", table: 7, time: "00:04", urgent: true, note: "Seat sensor alert" },
    score: { greeted: 1, onTime: 1 },
  },
  {
    title: "Everyone greeted",
    caption: "Five guests, five greetings inside 15 seconds, zero guest taps.",
    tables: {
      ...DINING_START,
      4: { s: "dining", text: "W1" },
      1: { s: "dining", text: "W4" },
      7: { s: "dining", text: "W2" },
      9: { s: "dining", text: "W3" },
      12: { s: "dining", text: "W6" },
    },
    moved: { 1: [240, 412], 4: [100, 70], 2: [410, 412], 3: [720, 70], 6: [860, 412] },
    busy: [1, 4, 2, 3, 6],
    links: [],
    wrist: { kind: "greeted", staff: 2, zone: "Zone B", table: 7, seconds: 13 },
    score: { greeted: 5, onTime: 5 },
    finale: true,
  },
];

// ---- page -------------------------------------------------------------------

export default function PlanB() {
  const [step, setStep] = useState(0);
  const beat = BEATS[step];
  const go = useCallback(
    (d: number) => setStep((s) => Math.min(BEATS.length - 1, Math.max(0, s + d))),
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "r" || e.key === "R" || e.key === "Home") {
        setStep(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <main
      className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden"
      style={{ background: C.ground, color: C.ink }}
    >
      <style>{`
        @keyframes pb-pulse { 0% { r: 24; opacity: .9 } 100% { r: 44; opacity: 0 } }
        .pb-pulse { animation: pb-pulse 1.1s cubic-bezier(.16,1,.3,1) infinite; }
        .pb-pulse-fast { animation-duration: .7s; }
        .pb-token { transition: transform 700ms cubic-bezier(.16,1,.3,1); }
        .pb-link { stroke-dasharray: 600; animation: pb-draw 500ms cubic-bezier(.16,1,.3,1) both; }
        .pb-link-dash { stroke-dasharray: 12 10; }
        @keyframes pb-draw { from { stroke-dashoffset: 600 } to { stroke-dashoffset: 0 } }
        @keyframes pb-flash { 0%,100% { background: #b91c1c } 50% { background: #e0362a } }
        .pb-flash { animation: pb-flash 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pb-pulse, .pb-flash, .pb-link { animation: none; }
          .pb-token { transition: none; }
        }
      `}</style>
      <div className="sr-only" role="status" aria-live="polite">
        {`Beat ${step + 1} of ${BEATS.length}: ${beat.title}. ${beat.caption}`}
      </div>

      {/* Top bar: brand and promise on the left, the scoreboard on the right */}
      <header
        className="mx-auto flex w-full max-w-[1800px] flex-wrap items-end gap-x-10 gap-y-3 px-6 pt-5 pb-3 lg:max-w-[178vh]"
      >
        <div className="mr-auto">
          <p className="text-lg font-bold tracking-tight">ZeroBell</p>
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight">
            Every guest greeted within 15 seconds.
          </h1>
        </div>
        <Score label="Greeted under 15s" value={`${beat.score.onTime}/${beat.score.greeted}`} good />
        <Score label="Times a guest had to wave or ring" value="0" good />
      </header>

      <div className="mx-auto grid w-full max-w-[1800px] flex-1 grid-cols-1 gap-5 px-6 pb-5 lg:min-h-0 lg:max-w-[178vh] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]">
        {/* Floor plan */}
        <section
          aria-label="Restaurant floor plan"
          className="relative flex min-h-0 flex-col rounded-2xl"
        >
          <Floor beat={beat} />
          {beat.finale && <Finale />}
        </section>

        {/* Magnified wrist + beat controls */}
        <aside className="flex min-h-0 flex-col items-center justify-between gap-4">
          <div className="w-full">
            <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
              Beat {step + 1} of {BEATS.length}
            </p>
            <h2 className="text-[1.6rem] font-bold leading-tight">{beat.title}</h2>
            <p className="mt-1 text-lg leading-snug" style={{ color: C.muted }}>
              {beat.caption}
            </p>
          </div>
          <BigWrist w={beat.wrist} />
          <nav aria-label="Demo steps" className="flex w-full items-center justify-between gap-3">
            <button
              onClick={() => go(-1)}
              disabled={step === 0}
              className="min-h-11 rounded-full border-2 px-5 text-base font-bold disabled:opacity-30"
              style={{ borderColor: C.ink }}
            >
              Back
            </button>
            <div className="flex gap-1.5" aria-hidden>
              {BEATS.map((b, i) => (
                <span
                  key={b.title}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: i === step ? C.ink : C.seat }}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              disabled={step === BEATS.length - 1}
              className="min-h-11 rounded-full px-5 text-base font-bold text-white disabled:opacity-30"
              style={{ background: C.ink }}
            >
              Next
            </button>
          </nav>
          <p className="w-full text-sm" style={{ color: C.muted }}>
            Keys: → next · ← back · R restart ·{" "}
            <Link href="/" className="underline underline-offset-2">
              live demo
            </Link>
          </p>
        </aside>
      </div>
    </main>
  );
}

function Score({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="text-right">
      <p className="font-mono text-[2.2rem] font-bold leading-none tabular-nums" style={{ color: good ? C.greeted : C.ink }}>
        {value}
      </p>
      <p className="text-sm font-semibold" style={{ color: C.muted }}>
        {label}
      </p>
    </div>
  );
}

// ---- floor plan -------------------------------------------------------------

const STATE_FILL: Record<TableState, { tile: string; line: string; chair: string; text: string }> = {
  free: { tile: C.room, line: C.roomLine, chair: C.seat, text: C.muted },
  wait: { tile: C.waitTint, line: C.wait, chair: C.wait, text: "#7a4f00" },
  urgent: { tile: C.urgentTint, line: C.urgent, chair: C.urgent, text: C.urgent },
  dining: { tile: C.greetedTint, line: C.greeted, chair: C.greeted, text: C.greeted },
};

function Floor({ beat }: { beat: Beat }) {
  const pos = (s: number) => beat.moved?.[s] ?? HOME[s];
  return (
    <svg
      viewBox="0 0 960 600"
      className="h-full max-h-full w-full"
      role="img"
      aria-label="Top-down floor plan: three zones of four tables, waiters standing in each zone, runners at the pass"
    >
      {/* rooms */}
      {ZONES.map((z) => (
        <g key={z.id}>
          <rect x={z.x} y={40} width={300} height={400} rx={18} fill={C.room} stroke={C.roomLine} strokeWidth={2} />
          <text x={z.x + 14} y={28} fontSize={20} fontWeight={700} fill={C.ink}>
            Zone {z.id}
          </text>
          <text x={z.x + 300} y={28} fontSize={16} fill={C.muted} textAnchor="end">
            Tables {z.tables[0]}–{z.tables[3]}
          </text>
        </g>
      ))}
      {/* the pass, where runners wait, and the break room */}
      <rect x={20} y={470} width={760} height={120} rx={18} fill="none" stroke={C.roomLine} strokeWidth={2} strokeDasharray="8 8" />
      <text x={36} y={500} fontSize={16} fontWeight={700} fill={C.muted}>
        The pass · runners
      </text>
      <rect x={790} y={470} width={150} height={120} rx={18} fill="none" stroke={C.roomLine} strokeWidth={2} strokeDasharray="8 8" />
      <text x={806} y={500} fontSize={16} fontWeight={700} fill={C.muted}>
        Break
      </text>

      {/* lines from a lit table to every band it buzzes (under tables and tokens) */}
      {beat.links.map((l) => {
        const [x1, y1] = TABLE_POS[l.table];
        const [x2, y2] = pos(l.staff);
        const col = l.tone === "urgent" ? C.urgent : C.wait;
        return (
          <line
            key={`${l.table}-${l.staff}-${l.tone}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={col}
            strokeWidth={5}
            strokeLinecap="round"
            className={l.runner ? "pb-link-dash" : "pb-link"}
          />
        );
      })}

      {/* tables */}
      {Object.keys(TABLE_POS).map((k) => {
        const id = Number(k);
        const t = beat.tables[id] ?? { s: "free" as TableState, text: "Free" };
        return <Table key={id} id={id} state={t.s} text={t.text} />;
      })}

      {/* staff tokens: all the same size */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 9].map((s) => (
        <Token
          key={s}
          id={s}
          at={pos(s)}
          tone={beat.alerted?.[s]}
          busy={beat.busy?.includes(s) ?? false}
          onBreak={s === 9}
        />
      ))}
    </svg>
  );
}

function Table({ id, state, text }: { id: number; state: TableState; text: string }) {
  const [cx, cy] = TABLE_POS[id];
  const f = STATE_FILL[state];
  const mono = /^\d\d:\d\d$/.test(text);
  return (
    <g>
      {/* chairs */}
      <rect x={cx - 22} y={cy - 52} width={44} height={12} rx={6} fill={f.chair} />
      <rect x={cx - 22} y={cy + 40} width={44} height={12} rx={6} fill={f.chair} />
      <rect x={cx - 62} y={cy - 18} width={12} height={36} rx={6} fill={f.chair} />
      <rect x={cx + 50} y={cy - 18} width={12} height={36} rx={6} fill={f.chair} />
      {/* table top */}
      <rect x={cx - 45} y={cy - 35} width={90} height={70} rx={12} fill={f.tile} stroke={f.line} strokeWidth={3} />
      <text x={cx - 34} y={cy - 10} fontSize={18} fontWeight={800} fill={C.ink}>
        T{id}
      </text>
      <text
        x={cx}
        y={cy + 22}
        fontSize={mono ? 22 : 17}
        fontWeight={700}
        fill={f.text}
        textAnchor="middle"
        fontFamily={mono ? "var(--font-geist-mono)" : undefined}
      >
        {text}
      </text>
    </g>
  );
}

function Token({
  id,
  at,
  tone,
  busy,
  onBreak,
}: {
  id: number;
  at: [number, number];
  tone?: Tone;
  busy: boolean;
  onBreak: boolean;
}) {
  const ring = tone === "urgent" ? C.urgent : C.wait;
  const fill = busy ? C.greeted : tone ? (tone === "urgent" ? C.urgent : C.wait) : C.room;
  const textCol = busy || tone === "urgent" ? "#ffffff" : C.ink;
  return (
    <g className="pb-token" style={{ transform: `translate(${at[0]}px, ${at[1]}px)`, opacity: onBreak ? 0.45 : 1 }}>
      {tone && !busy && (
        <circle r={24} fill="none" stroke={ring} strokeWidth={4} className={`pb-pulse ${tone === "urgent" ? "pb-pulse-fast" : ""}`} />
      )}
      <circle r={24} fill={fill} stroke={C.ink} strokeWidth={3} />
      <text y={6} fontSize={17} fontWeight={800} fill={textCol} textAnchor="middle" fontFamily="var(--font-geist-mono)">
        W{id}
      </text>
      {onBreak && (
        <text y={44} fontSize={14} fill={C.muted} textAnchor="middle">
          on break
        </text>
      )}
    </g>
  );
}

function Finale() {
  return (
    <div className="absolute inset-x-[12%] top-[22%] rounded-3xl px-8 py-7 text-center shadow-[0_24px_60px_rgba(23,20,31,0.25)]" style={{ background: C.ink, color: "#fff" }}>
      <p className="text-[3.4rem] font-bold leading-none tracking-tight">5 of 5</p>
      <p className="mt-2 text-[1.6rem] font-semibold">guests greeted inside 15 seconds</p>
      <p className="mt-4 text-xl" style={{ color: "#cfc9d8" }}>
        0 waves · 0 bells · 0 buttons pressed by a guest
      </p>
    </div>
  );
}

// ---- the magnified wrist ----------------------------------------------------

function BigWrist({ w }: { w: WristState }) {
  let face = "";
  let faceStyle: CSSProperties = { background: "#0b0a12", color: "#fff" };
  let status = "Ready";
  let body: ReactNode;
  if (w.kind === "ready") {
    body = (
      <>
        <p className="text-[1.6em] font-bold">Ready</p>
        <p className="text-[0.95em]" style={{ color: "#b3aec6" }}>
          Waiting for a table
        </p>
      </>
    );
  } else if (w.kind === "alert") {
    status = w.urgent ? "Hurry" : "Alert";
    if (w.urgent) face = "pb-flash";
    else faceStyle = { background: C.wait, color: C.ink };
    body = (
      <>
        <p className="text-[1.25em] font-bold">Table {w.table}</p>
        <p className="text-[0.95em]">{w.note}</p>
        <p className="font-mono text-[3em] font-bold leading-none tabular-nums">{w.time}</p>
        <p
          className="mt-[0.3em] w-full rounded-full py-[0.35em] text-[1.05em] font-extrabold"
          style={w.urgent ? { background: "#fff", color: "#b91c1c" } : { background: C.ink, color: C.wait }}
        >
          Attending
        </p>
      </>
    );
  } else {
    status = "Greeted";
    faceStyle = { background: C.greeted, color: "#fff" };
    body = (
      <>
        <svg aria-hidden viewBox="0 0 24 24" className="h-[2em] w-[2em]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <p className="font-mono text-[3em] font-bold leading-none tabular-nums">{w.seconds}s</p>
        <p className="text-[1.05em] font-semibold">Greeted · under 15s</p>
        <p className="text-[0.95em]">Table {w.table}</p>
      </>
    );
  }
  return (
    <figure className="flex flex-col items-center" aria-label={`Waiter ${w.staff}'s band`}>
      <div className="h-3 w-[38%] rounded-t-xl" style={{ background: "#2a2640" }} />
      <div className="relative rounded-[2.6rem] border-[6px] p-2" style={{ borderColor: "#2a2640", background: "#15131f" }}>
        <div className="absolute -right-2.5 top-[30%] h-[18%] w-2 rounded-r-md" style={{ background: "#2a2640" }} />
        <div
          className={`flex aspect-[0.82] h-[min(19rem,42dvh)] flex-col items-center gap-[0.35em] rounded-[2rem] px-[1em] py-[1em] text-center text-[clamp(14px,2.2dvh,1.35rem)] ${face}`}
          style={faceStyle}
        >
          <div className="flex w-full justify-between text-[0.85em] font-semibold uppercase tracking-wide">
            <span className="font-mono">W{w.staff}</span>
            <span>{status}</span>
          </div>
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-[0.35em]">{body}</div>
        </div>
      </div>
      <div className="h-3 w-[38%] rounded-b-xl" style={{ background: "#2a2640" }} />
      <figcaption className="mt-2 text-base font-semibold" style={{ color: C.muted }}>
        W{w.staff}&apos;s wrist · {w.zone}
      </figcaption>
    </figure>
  );
}
