"use client";

// Phone companion: one staff member's watch, mirrored live from the laptop
// demo over the local network. The laptop runs the simulation; this page
// listens for its snapshots, works out this person's alerts with the same
// rules, and sends Accept / Done / shift taps back.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  STAFF,
  Watch,
  alertOrder,
  initials,
  recipientsFor,
  type ShiftMap,
  type Staff,
  type StatsMap,
  type Table,
  type TaskMap,
} from "../floor-demo";
import { isLocalHost, postSync, type SyncAction } from "../sync";

type Snapshot = {
  tables: Table[];
  tasks: TaskMap;
  shifts: ShiftMap;
  stats?: StatsMap;
  sentAt: number;
};
type Status = "connecting" | "live" | "offline" | "hosted";

const SHIFT_LABEL = { in: "On shift", break: "On break", out: "Clocked out" } as const;

// One shared stream for the page: the latest snapshot and connection state.
function useLaptop() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  // Laptop clock minus phone clock, so timings match the projector.
  const offset = useRef(0);

  useEffect(() => {
    if (!isLocalHost(window.location.hostname)) {
      const id = setTimeout(() => setStatus("hosted"));
      return () => clearTimeout(id);
    }
    const source = new EventSource("/api/sync");
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("offline"); // the browser keeps retrying
    source.addEventListener("snapshot", (e) => {
      const s = JSON.parse((e as MessageEvent<string>).data) as Snapshot;
      offset.current = s.sentAt - Date.now();
      setSnap(s);
      setStatus("live");
    });
    return () => source.close();
  }, []);

  return { snap, status, offset };
}

export default function Companion({ staffId }: { staffId: number | null }) {
  const laptop = useLaptop();
  const staff = STAFF.find((s) => s.id === staffId) ?? null;
  return staff ? <Band staff={staff} {...laptop} /> : <Picker snap={laptop.snap} />;
}

// ---- pick who this phone is ---------------------------------------------------

function Picker({ snap }: { snap: Snapshot | null }) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-ground px-4 py-6 text-ink">
      <header>
        <p className="text-sm font-semibold text-muted">ZeroBell watch</p>
        <h1 className="text-2xl font-bold tracking-tight">Who is wearing this watch?</h1>
        <p className="mt-1 text-base text-muted">
          Tap a table on the laptop and every clocked-in watch buzzes. The first to Accept
          takes it.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {STAFF.map((s) => {
          const shift = snap?.shifts[s.id];
          return (
            <Link
              key={s.id}
              href={`/watch?w=${s.id}`}
              className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-bezel bg-face px-3 py-2 transition-colors hover:border-muted"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-sm font-bold ring-1 ring-white/25">
                {initials(s.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold">{s.name}</span>
                {shift && <span className="block text-sm text-muted">{SHIFT_LABEL[shift]}</span>}
                {snap?.stats?.[s.id] && snap.stats[s.id].accepted > 0 && (
                  <span className="block font-mono text-sm text-muted tabular-nums">
                    {snap.stats[s.id].accepted} accepted ·{" "}
                    {(snap.stats[s.id].totalMs / snap.stats[s.id].accepted / 1000).toFixed(1)}s avg
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

// ---- the watch --------------------------------------------------------------------

function Band({
  staff,
  snap,
  status,
  offset,
}: {
  staff: Staff;
  snap: Snapshot | null;
  status: Status;
  offset: { current: number };
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(id);
  }, [offset]);

  const tasks = snap?.tasks ?? {};
  const shifts = snap?.shifts ?? {};
  const shift = shifts[staff.id] ?? "out";
  const task = tasks[staff.id] ?? null;
  const alerts = snap
    ? snap.tables
        .filter((t) => recipientsFor(t, tasks, shifts).includes(staff.id))
        .sort(alertOrder)
    : [];

  // Buzz when a new alert reaches this watch (Android; iPhone browsers do not
  // allow vibration).
  const alertKey = alerts.map((t) => `${t.id}:${t.status}`).join(",");
  const previous = useRef("");
  useEffect(() => {
    const before = new Set(previous.current.split(",").filter(Boolean));
    const fresh = alertKey.split(",").filter((k) => k && !before.has(k));
    if (fresh.length > 0) navigator.vibrate?.([180, 80, 180]);
    previous.current = alertKey;
  }, [alertKey]);

  const send = (action: SyncAction) => postSync({ type: "action", action });

  const statusLine: Record<Status, { dot: string; text: string }> = {
    connecting: { dot: "bg-dim", text: "Connecting to the laptop…" },
    live: snap
      ? { dot: "bg-greeted", text: "Live from the laptop" }
      : { dot: "bg-wait", text: "Connected. Open the demo on the laptop." },
    offline: { dot: "bg-urgent", text: "Can't reach the laptop. Same Wi-Fi?" },
    hosted: {
      dot: "bg-dim",
      text: "Phone mode works when the demo runs on a laptop on this Wi-Fi.",
    },
  };
  const line = statusLine[status];

  return (
    <main className="flex min-h-dvh flex-col bg-ground px-4 pt-4 pb-6 text-ink">
      <header className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <span className={`h-2 w-2 shrink-0 rounded-full ${line.dot}`} aria-hidden />
          {line.text}
        </p>
        <Link
          href="/watch"
          className="flex min-h-11 shrink-0 items-center rounded-full border border-line px-4 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          Switch
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center py-4">
        <div className="w-full max-w-[24rem] [--face-h:min(66dvh,34rem)]">
          <Watch
            staff={staff}
            shift={shift}
            task={task}
            stats={snap?.stats?.[staff.id] ?? null}
            alerts={alerts}
            now={now}
            notice={null}
            onAccept={(tableId) => send({ kind: "accept", staffId: staff.id, tableId })}
            onDone={() => send({ kind: "done", staffId: staff.id })}
            onShift={(next) => send({ kind: "shift", staffId: staff.id, shift: next })}
          />
        </div>
      </div>
    </main>
  );
}
