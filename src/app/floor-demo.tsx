"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isLocalHost, postSync, type SyncAction } from "./sync";

// ---------------------------------------------------------------------------
// Demo rules
// ---------------------------------------------------------------------------

const GREETING_LIMIT_S = 15; // the promise: every guest greeted within 15s
const URGENT_AT_S = 5; // table card turns red in the last 5 seconds
const NOTICE_FOR_MS = 6000; // "Table 4 taken by Waiter 1" fades after this

// "cleaning" means someone accepted the cleaning alert and is on it.
type TableStatus = "available" | "needsGreeting" | "dining" | "needsCleaning" | "cleaning";

export type Table = {
  id: number;
  status: TableStatus;
  alertAt: number | null;
  servedBy: number | null;
  waitedMs: number | null;
};

export type Staff = { id: number; name: string };

// Each watch sets its own shift. Only clocked-in staff without a task get
// table alerts; on a break or clocked out, the watch sleeps.
export type Shift = "in" | "break" | "out";
export type ShiftMap = Record<number, Shift>;

// The one job a staff member has accepted, kept until they tap Done.
export type Task = { kind: "serve" | "clean"; tableId: number };
export type TaskMap = Record<number, Task>;

// Logged silently on every Accept: how long the alert had been out (from the
// moment it fired) when this staff member took it. Shown only on their own
// profile, never during an alert.
export type StaffStats = { accepted: number; totalMs: number };
export type StatsMap = Record<number, StaffStats>;

type Notices = Record<number, { text: string; at: number } | null>;

// ---------------------------------------------------------------------------
// Local sample data
// ---------------------------------------------------------------------------

const TOTAL_TABLES = 12;

// Eleven staff, no zones: any free waiter can take any table. Demo names.
export const STAFF: Staff[] = [
  "Aisyah",
  "Wei Ming",
  "Priya",
  "Daniel",
  "Mei Ling",
  "Arjun",
  "Nurul",
  "Jason",
  "Kavitha",
  "Hafiz",
  "Siew Lan",
].map((name, i) => ({ id: i + 1, name }));

export function staffName(id: number | null) {
  return STAFF.find((s) => s.id === id)?.name ?? "Staff";
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Who is on shift when the demo opens: one on a break, one clocked out.
function startingShifts(): ShiftMap {
  const shifts: ShiftMap = {};
  for (const s of STAFF) shifts[s.id] = "in";
  shifts[9] = "break";
  shifts[11] = "out";
  return shifts;
}

// Tables already dining when the demo opens, and which waiter has them.
const DINING_AT_START: Record<number, number> = {
  2: 4,
  6: 5,
  11: 6,
};

function startingTables(): Table[] {
  return Array.from({ length: TOTAL_TABLES }, (_, i) => {
    const id = i + 1;
    const waiter = DINING_AT_START[id];
    return {
      id,
      status: waiter ? "dining" : "available",
      alertAt: null,
      servedBy: waiter ?? null,
      waitedMs: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers. readClock and the random picks are only used from click handlers
// and the ticking interval, never while rendering.
// ---------------------------------------------------------------------------

function readClock() {
  return Date.now();
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 3–4 random free tables at once.
function pickRushTables(tables: Table[]): number[] {
  const free = shuffled(tables.filter((t) => t.status === "available"));
  return free.slice(0, 3 + Math.floor(Math.random() * 2)).map((t) => t.id);
}

function listTables(ids: number[]) {
  const sorted = [...ids].sort((a, b) => a - b);
  return `${sorted.length === 1 ? "Table" : "Tables"} ${sorted.join(", ")}`;
}

function mmss(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function secondsLeft(alertAt: number | null, now: number) {
  if (alertAt === null) return GREETING_LIMIT_S;
  const left = Math.ceil((GREETING_LIMIT_S * 1000 - (now - alertAt)) / 1000);
  return Math.min(GREETING_LIMIT_S, Math.max(0, left));
}

// How far past the 15-second promise a waiting table is, in whole seconds.
function secondsLate(alertAt: number | null, now: number) {
  if (alertAt === null) return 0;
  return Math.max(0, Math.floor((now - alertAt) / 1000) - GREETING_LIMIT_S);
}

// A greeting alert gets hotter as the promise runs out: calm amber when the
// guest sits, a red flash in the last 5 seconds, solid deep red once late.
type AlertPhase = "wait" | "urgent" | "late";

function alertPhase(alertAt: number | null, now: number): AlertPhase {
  const left = secondsLeft(alertAt, now);
  return left === 0 ? "late" : left <= URGENT_AT_S ? "urgent" : "wait";
}

const PHASE_FACE: Record<AlertPhase, string> = {
  wait: "bg-wait text-ground",
  urgent: "alert-flash text-white",
  late: "bg-alert-late text-white",
};

export function isFree(staffId: number, tasks: TaskMap, shifts: ShiftMap) {
  return shifts[staffId] === "in" && !tasks[staffId];
}

function withoutTable(tasks: TaskMap, tableId: number): TaskMap {
  const next: TaskMap = {};
  for (const [id, task] of Object.entries(tasks)) {
    if (task.tableId !== tableId) next[Number(id)] = task;
  }
  return next;
}

function isAlerting(t: Table) {
  return t.status === "needsGreeting" || t.status === "needsCleaning";
}

// Who gets this table's alert right now: every clocked-in staff member
// without a task. There are no zones; the first to tap Accept takes it, and
// the alert clears from everyone else's watch.
export function recipientsFor(t: Table, tasks: TaskMap, shifts: ShiftMap): number[] {
  if (!isAlerting(t) || t.alertAt === null) return [];
  return STAFF.filter((s) => isFree(s.id, tasks, shifts)).map((s) => s.id);
}

// New guests before cleaning; oldest first.
export function alertOrder(a: Table, b: Table) {
  if (a.status !== b.status) return a.status === "needsGreeting" ? -1 : 1;
  return (a.alertAt ?? 0) - (b.alertAt ?? 0);
}

// Move focus to an element that exists after the next render, so keyboard users
// keep their place when the button they pressed disappears. The first id that
// exists wins.
function focusAfterRender(...elementIds: string[]) {
  // A zero-delay timeout runs after React has committed the click's update,
  // and unlike requestAnimationFrame it isn't throttled in background panes.
  setTimeout(() => {
    for (const id of elementIds) {
      const el = document.getElementById(id);
      if (el) return el.focus({ preventScroll: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FloorDemo() {
  const [tables, setTables] = useState<Table[]>(startingTables);
  const [tasks, setTasks] = useState<TaskMap>({});
  const [shifts, setShifts] = useState<ShiftMap>(startingShifts);
  const [stats, setStats] = useState<StatsMap>({});
  const [now, setNow] = useState(0);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [tablesTurned, setTablesTurned] = useState(0);
  const [notices, setNotices] = useState<Notices>({});
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(readClock()), 250);
    return () => clearInterval(id);
  }, []);

  // ---- phone companion (/watch), on the local network only ----
  // This page stays the simulation: it publishes tables, tasks and shifts to
  // the phones, and applies the Accept / Done / shift taps they send back.
  const [phones, setPhones] = useState<{ url: string; qr: string }[] | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const handlers = useRef<{
    accept: (staffId: number, tableId: number) => void;
    done: (staffId: number) => void;
    setShift: (staffId: number, shift: Shift) => void;
  } | null>(null);
  useEffect(() => {
    handlers.current = { accept, done, setShift };
  });
  useEffect(() => {
    if (!isLocalHost(window.location.hostname)) return;
    fetch("/api/sync?info=1")
      .then((r) => r.json())
      .then((d: { phones: { url: string; qr: string }[] }) => setPhones(d.phones))
      .catch(() => {});
    const source = new EventSource("/api/sync");
    source.addEventListener("action", (e) => {
      const a = JSON.parse((e as MessageEvent<string>).data) as SyncAction;
      if (a.kind === "accept") handlers.current?.accept(a.staffId, a.tableId);
      else if (a.kind === "done") handlers.current?.done(a.staffId);
      else handlers.current?.setShift(a.staffId, a.shift);
    });
    return () => source.close();
  }, []);
  useEffect(() => {
    if (!isLocalHost(window.location.hostname)) return;
    postSync({ type: "snapshot", snapshot: { tables, tasks, shifts, stats, sentAt: Date.now() } });
  }, [tables, tasks, shifts, stats]);

  // ---- derived, live state ----
  const recipients = new Map<number, number[]>();
  for (const t of tables) recipients.set(t.id, recipientsFor(t, tasks, shifts));
  const alertsFor = (staffId: number) =>
    tables
      .filter((t) => recipients.get(t.id)?.includes(staffId))
      .sort(alertOrder);

  const activeTables = tables.filter((t) => t.status !== "available").length;
  const availableStaff = STAFF.filter((s) => isFree(s.id, tasks, shifts)).length;
  const avgResponseS =
    responseTimes.length === 0
      ? null
      : responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000;
  const avgResponse = avgResponseS === null ? "—" : `${avgResponseS.toFixed(1)}s`;
  const avgTone: MetricTone =
    avgResponseS === null ? "neutral" : avgResponseS <= GREETING_LIMIT_S ? "good" : "bad";
  const freeTables = TOTAL_TABLES - activeTables;

  // Time-based events for screen readers. These strings only change when a
  // table crosses a threshold, so the live region speaks once per event
  // instead of on every tick.
  const waiting = tables.filter((t) => t.status === "needsGreeting");
  const overdueIds = waiting
    .filter((t) => secondsLeft(t.alertAt, now) === 0)
    .map((t) => t.id);
  const urgentAnnouncement = [
    overdueIds.length > 0 && `Overdue: ${listTables(overdueIds)}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const visibleNotice = (staffId: number) => {
    const n = notices[staffId];
    return n && now - n.at < NOTICE_FOR_MS ? n.text : null;
  };

  // ---- actions ----
  function updateTable(id: number, patch: Partial<Table>) {
    setTables((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function guestSat(id: number) {
    const t = readClock();
    setNow(t);
    updateTable(id, {
      status: "needsGreeting",
      alertAt: t,
      servedBy: null,
      waitedMs: null,
    });
    setAnnouncement(`Table ${id} needs greeting. Every free waiter alerted.`);
    focusAfterRender(`table-${id}`);
  }

  function guestLeft(id: number) {
    const t = readClock();
    setNow(t);
    updateTable(id, {
      status: "needsCleaning",
      alertAt: t,
      servedBy: null,
      waitedMs: null,
    });
    // Whoever was still serving this table is done once the guests leave, so
    // their watch can pick up new alerts instead of a stale "Serving Table N".
    setTasks((ts) => withoutTable(ts, id));
    setAnnouncement(`Table ${id} needs cleaning.`);
    focusAfterRender(`table-${id}`);
  }

  function rushHour() {
    const t = readClock();
    const ids = new Set(pickRushTables(tables));
    setNow(t);
    setTables((ts) =>
      ts.map((x) =>
        ids.has(x.id) && x.status === "available"
          ? { ...x, status: "needsGreeting", alertAt: t, servedBy: null, waitedMs: null }
          : x
      )
    );
    setAnnouncement(`Rush hour: ${listTables([...ids])} need greeting.`);
  }

  // First to accept takes the table: it stops alerting, so the card clears
  // from every other watch, and this staff member gets the task until Done.
  function accept(staffId: number, tableId: number) {
    const t = readClock();
    const table = tables.find((x) => x.id === tableId);
    if (!table || !isAlerting(table) || !isFree(staffId, tasks, shifts)) return;
    const name = staffName(staffId);
    const others = recipientsFor(table, tasks, shifts).filter((id) => id !== staffId);
    setNow(t);
    // Silent performance log: alert fired → Accept, for greetings and cleaning.
    const responseMs = table.alertAt === null ? 0 : Math.max(0, t - table.alertAt);
    setStats((st) => {
      const prev = st[staffId] ?? { accepted: 0, totalMs: 0 };
      return {
        ...st,
        [staffId]: { accepted: prev.accepted + 1, totalMs: prev.totalMs + responseMs },
      };
    });
    if (table.status === "needsGreeting" && table.alertAt !== null) {
      const waited = t - table.alertAt;
      updateTable(tableId, { status: "dining", servedBy: staffId, waitedMs: waited });
      setTasks((ts) => ({ ...ts, [staffId]: { kind: "serve", tableId } }));
      setResponseTimes((r) => [...r, waited]);
      setAnnouncement(
        `${name} accepted Table ${tableId} after ${Math.round(waited / 1000)} seconds.`
      );
    } else {
      updateTable(tableId, { status: "cleaning", servedBy: staffId });
      setTasks((ts) => ({ ...ts, [staffId]: { kind: "clean", tableId } }));
      setAnnouncement(`${name} is cleaning Table ${tableId}.`);
    }
    setNotices((n) => {
      const next: Notices = { ...n, [staffId]: null };
      for (const id of others) next[id] = { text: `Table ${tableId} taken by ${name}`, at: t };
      return next;
    });
    focusAfterRender(`watch-${staffId}`);
  }

  // Done ends the task. For cleaning, that frees the table for the next guest.
  function done(staffId: number) {
    const task = tasks[staffId];
    if (!task) return;
    const t = readClock();
    setNow(t);
    setTasks((ts) => {
      const next = { ...ts };
      delete next[staffId];
      return next;
    });
    if (task.kind === "clean") {
      const table = tables.find((x) => x.id === task.tableId);
      if (table && table.status === "cleaning") {
        updateTable(task.tableId, {
          status: "available",
          alertAt: null,
          servedBy: null,
          waitedMs: null,
        });
        setTablesTurned((n) => n + 1);
      }
      setAnnouncement(`Table ${task.tableId} cleaned and available.`);
    } else {
      setAnnouncement(`${staffName(staffId)} is free for new tables.`);
    }
    focusAfterRender(`watch-${staffId}`);
  }

  // Clock in, take a break or clock out from the watch. Finish the current
  // task first: a break or clock-out is ignored while one is open.
  function setShift(staffId: number, shift: Shift) {
    if (shift !== "in" && tasks[staffId]) return;
    setShifts((sh) => ({ ...sh, [staffId]: shift }));
    setNotices((n) => ({ ...n, [staffId]: null }));
    const name = staffName(staffId);
    setAnnouncement(
      shift === "in"
        ? `${name} clocked in.`
        : shift === "break"
        ? `${name} is on a break.`
        : `${name} clocked out.`
    );
    focusAfterRender(`watch-${staffId}`);
  }

  function resetDemo() {
    setTables(startingTables());
    setTasks({});
    setShifts(startingShifts());
    setStats({});
    setResponseTimes([]);
    setTablesTurned(0);
    setNotices({});
    setAnnouncement("Demo reset.");
  }

  const freeStaff = availableStaff;

  return (
    <main className="flex min-h-dvh flex-col bg-ground text-ink lg:h-dvh lg:overflow-hidden">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {urgentAnnouncement}
      </div>

      {/* Top bar */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1800px] lg:max-w-[178vh] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 basis-80">
            {/* The brand, then the promise as the headline, then how it works. */}
            <h1 className="text-xl font-bold leading-tight tracking-tight">ZeroBell</h1>
            <p className="text-lg font-semibold leading-snug text-ink [text-wrap:balance]">
              Every guest greeted within {GREETING_LIMIT_S} seconds.{" "}
              {/* Break between the sentences, never inside one. */}
              <span className="sm:block">No waving, no bells.</span>
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5 text-sm">
              <SeatIcon />
              <span>
                <span className="font-semibold text-ink">Seat sensors detect each guest.</span>{" "}
                <span className="text-muted">Tap a table to simulate.</span>
              </span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active tables" value={`${activeTables}/${TOTAL_TABLES}`} />
            <Metric label="Staff free" value={`${availableStaff}/${STAFF.length}`} />
            <Metric label="Avg response" value={avgResponse} tone={avgTone} />
            <Metric label="Tables turned" value={String(tablesTurned)} />
          </dl>
          <div className="flex gap-2">
            <button
              onClick={rushHour}
              disabled={freeTables === 0}
              className="min-h-11 rounded-full bg-wait px-5 text-sm font-bold text-ground transition-colors hover:bg-wait-hover disabled:opacity-40"
            >
              Simulate Rush Hour
            </button>
            <button
              onClick={resetDemo}
              className="min-h-11 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Reset demo
            </button>
            {phones && (
              <div className="relative">
                <button
                  onClick={() => setPhoneOpen((o) => !o)}
                  aria-expanded={phoneOpen}
                  aria-controls="phone-panel"
                  className="min-h-11 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Phone
                </button>
                {phoneOpen && (
                  <div
                    id="phone-panel"
                    className="absolute right-0 top-full z-30 mt-2 w-max max-w-[24rem] rounded-xl border border-line bg-surface p-4 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
                  >
                    <p className="font-semibold text-ink">
                      On a phone on the same Wi-Fi, scan or open:
                    </p>
                    {phones.length > 0 ? (
                      phones.map((p) => (
                        <div key={p.url} className="mt-3 flex flex-col items-center gap-2">
                          {/* The QR is an SVG our own server generated from this address. */}
                          <div
                            role="img"
                            aria-label={`QR code for ${p.url}`}
                            className="w-48 overflow-hidden rounded-lg bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: p.qr }}
                          />
                          <p className="select-all font-mono text-base text-ink">{p.url}</p>
                        </div>
                      ))
                    ) : (
                      <p className="mt-1 text-muted">No network found. Connect this laptop to Wi-Fi.</p>
                    )}
                    <p className="mt-2 text-muted">
                      Pick a staff member there. The phone becomes their watch: Accept, Done and
                      the shift buttons work on both screens.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div id="floor"
        className="relative mx-auto flex w-full max-w-[1800px] lg:max-w-[178vh] flex-1 flex-col px-4 py-4 sm:px-6 lg:min-h-0">

        <h2 id="floor-heading" className="sr-only">
          Staff watches above, the floor below. Tap a table to seat a guest; in the
          restaurant, a seat sensor does this.
        </h2>
        <div className="grid grid-cols-1 gap-y-3 lg:min-h-0 lg:flex-1 lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-y-2 [--face-h:300px] lg:[--face-h:clamp(6rem,calc(100dvh-29rem),40rem)]">
          <h3 className="flex items-baseline justify-between gap-2 pl-2 text-base font-semibold">
            <span>
              Staff{" "}
              <span className="font-normal text-muted">· every free band buzzes</span>
            </span>
            <span className="text-sm font-normal text-muted">
              {freeStaff} of {STAFF.length} free
            </span>
          </h3>
          <div
            data-wrists
            className="grid grid-cols-3 items-start gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11"
          >
            {STAFF.map((s) => (
              <Watch
                key={s.id}
                staff={s}
                shift={shifts[s.id]}
                task={tasks[s.id] ?? null}
                stats={stats[s.id] ?? null}
                alerts={alertsFor(s.id)}
                now={now}
                notice={visibleNotice(s.id)}
                onAccept={(tableId) => accept(s.id, tableId)}
                onDone={() => done(s.id)}
                onShift={(shift) => setShift(s.id, shift)}
              />
            ))}
          </div>
          <div
            aria-label="Tables"
            className="mt-4 grid auto-rows-[minmax(3.5rem,1fr)] grid-cols-2 gap-2 sm:grid-cols-3 lg:mt-3 lg:min-h-0 lg:grid-cols-6"
          >
            {tables.map((t) => (
              <TableSeat
                key={t.id}
                table={t}
                now={now}
                alerted={recipients.get(t.id) ?? []}
                onGuestSat={() => guestSat(t.id)}
                onGuestLeft={() => guestLeft(t.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type MetricTone = "neutral" | "good" | "bad";

const METRIC_TONE: Record<MetricTone, string> = {
  neutral: "text-ink",
  good: "text-greeted", // within the 15-second promise
  bad: "text-urgent", // promise missed on average
};

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-mono text-xl font-bold tabular-nums ${METRIC_TONE[tone]}`}>
        {value}
      </dd>
    </div>
  );
}

// ---- floor ----------------------------------------------------------------

type SeatState = "free" | "waiting" | "urgent" | "dining" | "cleaning";

const SEAT_TILE: Record<SeatState, string> = {
  free: "border-line bg-surface hover:border-muted",
  waiting: "border-wait bg-wait-tint",
  urgent: "border-urgent bg-urgent-tint",
  dining: "border-greeted bg-greeted-tint hover:border-ink",
  cleaning: "border-dashed border-clean bg-clean-tint",
};

const SEAT_CHAIR: Record<SeatState, string> = {
  free: "bg-seat",
  waiting: "bg-wait",
  urgent: "bg-urgent",
  dining: "bg-greeted",
  cleaning: "border border-clean bg-transparent",
};

function TableSeat({
  table,
  now,
  alerted,
  onGuestSat,
  onGuestLeft,
}: {
  table: Table;
  now: number;
  alerted: number[];
  onGuestSat: () => void;
  onGuestLeft: () => void;
}) {
  const left = secondsLeft(table.alertAt, now);
  const state: SeatState =
    table.status === "available"
      ? "free"
      : table.status === "dining"
      ? "dining"
      : table.status === "needsCleaning" || table.status === "cleaning"
      ? "cleaning"
      : left <= URGENT_AT_S
      ? "urgent"
      : "waiting";
  const reach = alerted.length === 0 ? "No staff free" : `${alerted.length} alerted`;
  const spoken =
    table.status === "available"
      ? "free"
      : table.status === "needsGreeting"
      ? left > 0
        ? "needs greeting"
        : "overdue"
      : table.status === "dining"
      ? `dining, served by ${staffName(table.servedBy)}`
      : table.status === "cleaning"
      ? `being cleaned by ${staffName(table.servedBy)}`
      : "needs cleaning";

  let line1: ReactNode;
  let line2: ReactNode;
  switch (table.status) {
    case "available":
      line1 = <span className="text-muted">Free</span>;
      line2 = null;
      break;
    case "needsGreeting":
      line1 = (
        <span
          className={`font-mono text-lg font-bold tabular-nums ${
            state === "urgent" ? "text-urgent" : "text-wait"
          }`}
        >
          {left > 0 ? mmss(left) : `+${secondsLate(table.alertAt, now)}s late`}
        </span>
      );
      line2 = <span className="text-muted">{reach}</span>;
      break;
    case "dining":
      line1 = <span className="font-semibold text-greeted">{staffName(table.servedBy)}</span>;
      line2 = <span className="text-muted">Tap: guest left</span>;
      break;
    case "needsCleaning":
      line1 = <span className="font-semibold text-clean">To clean</span>;
      line2 = <span className="text-muted">{reach}</span>;
      break;
    case "cleaning":
      line1 = <span className="font-semibold text-clean">Cleaning</span>;
      line2 = <span className="text-muted">{staffName(table.servedBy)}</span>;
      break;
  }

  const action =
    table.status === "available"
      ? { onClick: onGuestSat, label: `Guest Sat at Table ${table.id}` }
      : table.status === "dining"
      ? { onClick: onGuestLeft, label: `Guest Left Table ${table.id}` }
      : null;

  const tileClass = `flex h-full w-full min-w-0 flex-col items-start justify-center rounded-lg border-2 px-2.5 py-1.5 text-left text-sm transition-colors ${SEAT_TILE[state]}`;
  const tileBody = (
    <>
      <span className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-base font-bold text-ink">T{table.id}</span>
        <span className="whitespace-nowrap">{line1}</span>
      </span>
      {line2 && <span className="line-clamp-2 w-full leading-tight">{line2}</span>}
    </>
  );
  const chair = `rounded-full ${SEAT_CHAIR[state]}`;

  return (
    <div
      id={`table-${table.id}`}
      tabIndex={-1}
      aria-label={`Table ${table.id}, ${spoken}`}
      className="relative z-10 grid min-h-0 grid-cols-[0.5rem_minmax(0,1fr)_0.5rem] grid-rows-[0.5rem_minmax(0,1fr)_0.5rem] gap-0.5 rounded-xl bg-ground"
    >
      <span aria-hidden className={`${chair} col-start-2 row-start-1 mx-auto h-2 w-2/5`} />
      <span aria-hidden className={`${chair} col-start-1 row-start-2 my-auto h-2/5 w-2`} />
      <div id={`seat-${table.id}`} className="col-start-2 row-start-2 min-h-0">
        {action ? (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            className={`${tileClass} min-h-11 cursor-pointer`}
          >
            {tileBody}
          </button>
        ) : (
          <div className={tileClass}>{tileBody}</div>
        )}
      </div>
      <span aria-hidden className={`${chair} col-start-3 row-start-2 my-auto h-2/5 w-2`} />
      <span aria-hidden className={`${chair} col-start-2 row-start-3 mx-auto h-2 w-2/5`} />
    </div>
  );
}

// ---- icons (drawn, one stroke weight) ---------------------------------------

function SeatIcon() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 self-center text-wait" fill="currentColor">
      <rect x="2" y="1" width="8" height="5" rx="1.5" />
      <rect x="1" y="7" width="10" height="2.5" rx="1" />
      <rect x="2" y="9" width="1.5" height="3" rx=".5" />
      <rect x="8.5" y="9" width="1.5" height="3" rx=".5" />
    </svg>
  );
}

// ---- wrist ----------------------------------------------------------------

// Face height: the row's target height, unless the column is too narrow for a
// face that tall (the face keeps a 0.82 width-to-height ratio inside a thin
// bezel). Type in the face scales with it: tighter in the narrow faces of the
// 11-watch row, roomier (with fuller labels) on a wide face such as the phone.
const FACE_H = "min(var(--face-h), calc((100cqw - 0.75rem) / 0.82))";

// A small round avatar: the staff member's initials (demo staff, no photos).
function Avatar({ name, dim }: { name: string; dim?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[1.55em] w-[1.55em] shrink-0 items-center justify-center rounded-full bg-raised font-bold ring-1 ring-white/25 ${dim ? "opacity-60" : ""}`}
    >
      <span className="text-[0.62em] tracking-wide text-ink">{initials(name)}</span>
    </span>
  );
}

export function Watch({
  staff,
  shift,
  task,
  stats,
  alerts,
  now,
  notice,
  onAccept,
  onDone,
  onShift,
}: {
  staff: Staff;
  shift: Shift;
  task: Task | null;
  stats: StaffStats | null;
  alerts: Table[];
  now: number;
  notice: string | null;
  onAccept: (tableId: number) => void;
  onDone: () => void;
  onShift: (shift: Shift) => void;
}) {
  const top = alerts[0];
  const more = alerts.length - 1;
  // Labels and controls that only fit on a wide face (the phone).
  const roomy = "hidden @[10rem]:flex";
  const bigButton =
    "mt-[0.25em] min-h-11 w-full rounded-full py-[0.35em] text-[1em] font-extrabold uppercase tracking-wide active:scale-95 lg:min-h-0";
  const smallButton =
    "min-h-11 flex-1 whitespace-nowrap rounded-full border border-current/40 px-[0.4em] py-[0.3em] text-[0.8em] font-semibold active:scale-95 lg:min-h-0 @[10rem]:text-[0.62em]";
  // The profile's performance line: tasks accepted and average response.
  const avgS = stats && stats.accepted > 0 ? stats.totalMs / stats.accepted / 1000 : null;
  const profileStats = (
    <dl className={`${roomy} w-full justify-center gap-[0.8em] rounded-lg bg-white/[0.06] px-[0.4em] py-[0.25em] text-[0.62em]`}>
      <div className="flex flex-col items-center">
        <dt className="text-muted">Accepted</dt>
        <dd className="font-mono text-[1.35em] font-bold tabular-nums text-ink">{stats?.accepted ?? 0}</dd>
      </div>
      <div className="flex flex-col items-center">
        <dt className="text-muted">Avg response</dt>
        <dd className="font-mono text-[1.35em] font-bold tabular-nums text-ink">
          {avgS === null ? "—" : `${avgS.toFixed(1)}s`}
        </dd>
      </div>
    </dl>
  );
  const tableBig = (id: number) => (
    <p className="flex flex-col items-center leading-none">
      <span className="hidden text-[0.75em] font-semibold uppercase tracking-widest @[10rem]:block">
        Table
      </span>
      <span className="text-[1.5em] font-black tabular-nums @[10rem]:text-[2.6em]">
        <span className="@[10rem]:hidden">T</span>
        {id}
      </span>
    </p>
  );

  let faceClass = "bg-face text-white";
  let status = "Ready";
  let dotClass = "bg-greeted";
  let spoken = "on shift, ready";
  let body: ReactNode;

  if (shift !== "in") {
    // Asleep: no table alerts until they clock back in.
    const onBreak = shift === "break";
    faceClass = "bg-[#08070d] text-dim";
    status = onBreak ? "Break" : "Off";
    dotClass = "bg-dim";
    spoken = onBreak ? "on a break, no alerts" : "clocked out, no alerts";
    body = (
      <>
        <p className="text-[1.1em] font-bold text-muted">{onBreak ? "On break" : "Clocked out"}</p>
        <p className={`${roomy} text-[0.8em]`}>No table alerts</p>
        {profileStats}
        <div className="flex w-full gap-[0.3em]">
          <button
            onClick={() => onShift("in")}
            aria-label={`${onBreak ? "End break" : "Clock in"} (${staff.name})`}
            className={`${smallButton} border-greeted/60 text-greeted`}
          >
            {onBreak ? "End break" : "Clock in"}
          </button>
          {onBreak && (
            <button
              onClick={() => onShift("out")}
              aria-label={`Clock out (${staff.name})`}
              className={`${smallButton} hidden text-muted @[10rem]:block`}
            >
              Clock out
            </button>
          )}
        </div>
      </>
    );
  } else if (task) {
    // The accepted job, until Done.
    const cleaning = task.kind === "clean";
    faceClass = cleaning ? "bg-face-clean text-white" : "bg-face-busy text-white";
    status = cleaning ? "Cleaning" : "Serving";
    dotClass = "bg-white";
    spoken = `${cleaning ? "cleaning" : "serving"} Table ${task.tableId}`;
    body = (
      <>
        <p className="text-[0.8em] font-semibold uppercase tracking-widest">
          {cleaning ? "Cleaning" : "Serving"}
        </p>
        {tableBig(task.tableId)}
        <button
          onClick={onDone}
          aria-label={`Done with Table ${task.tableId} (${staff.name})`}
          className={`${bigButton} bg-white ${cleaning ? "text-face-clean" : "text-face-busy"}`}
        >
          Done
        </button>
      </>
    );
  } else if (top) {
    // The alert card: high contrast, the table number large, one big Accept.
    const cleaning = top.status === "needsCleaning";
    const phase = alertPhase(top.alertAt, now);
    const calm = !cleaning && phase === "wait";
    faceClass = cleaning ? "bg-face-clean text-white" : PHASE_FACE[phase];
    status = cleaning ? "Clean" : phase === "wait" ? "New guest" : phase === "urgent" ? "Hurry" : "Late";
    dotClass = calm ? "bg-ground" : "bg-white";
    spoken = cleaning ? `Table ${top.id} needs cleaning` : `new guest at Table ${top.id}`;
    body = (
      <>
        {tableBig(top.id)}
        <p className={`${roomy} text-[0.85em] font-semibold leading-tight`}>
          {cleaning
            ? "Needs cleaning"
            : phase === "wait"
            ? "New guest seated"
            : phase === "urgent"
            ? "Guest still waiting"
            : `Past ${GREETING_LIMIT_S} seconds`}
        </p>
        <button
          onClick={() => onAccept(top.id)}
          aria-label={`Accept Table ${top.id} (${staff.name})`}
          className={`${bigButton} ${
            calm ? "bg-ground text-wait" : cleaning ? "bg-white text-face-clean" : "bg-white text-alert"
          }`}
        >
          Accept
        </button>
      </>
    );
  } else {
    // Home: ready for tables, with the shift controls.
    body = (
      <>
        <p className="text-[1.15em] font-bold text-ink">Ready</p>
        {notice ? (
          <p className={`${roomy} rounded-lg bg-white/10 px-[0.4em] py-[0.2em] text-[0.8em] leading-tight text-ink`}>
            {notice}
          </p>
        ) : (
          <p className={`${roomy} text-[0.8em] text-muted`}>Waiting for tables</p>
        )}
        {profileStats}
        <div className={`${roomy} w-full gap-[0.3em]`}>
          <button
            onClick={() => onShift("break")}
            aria-label={`Take break (${staff.name})`}
            className={`${smallButton} text-muted`}
          >
            Take break
          </button>
          <button
            onClick={() => onShift("out")}
            aria-label={`Clock out (${staff.name})`}
            className={`${smallButton} text-muted`}
          >
            Clock out
          </button>
        </div>
      </>
    );
  }

  const textOn = faceClass.includes("text-ground") ? "text-ground" : "";

  return (
    <div className="@container relative z-10 flex min-w-0 flex-col items-center">
      {/* strap */}
      <div className="h-1 w-[38%] rounded-t-md bg-raised" />
      <div className="relative max-w-full rounded-[1.1rem] border-2 border-bezel bg-ground p-1">
        {/* crown */}
        <div className="absolute -right-1.5 top-[30%] h-[18%] w-1 rounded-r-sm bg-bezel" />
        <div
          id={`watch-${staff.id}`}
          role="group"
          tabIndex={-1}
          aria-label={`${staff.name}'s watch, ${spoken}`}
          style={{
            height: FACE_H,
            width: `calc(${FACE_H} * 0.82)`,
            fontSize: `clamp(11px, calc(${FACE_H} * var(--fs)), 3rem)`,
          }}
          className={`flex max-w-full flex-col items-center gap-[0.25em] overflow-hidden rounded-[0.85rem] px-[0.45em] py-[0.45em] text-center transition-colors [--fs:0.12] @[10rem]:[--fs:0.095] ${faceClass}`}
        >
          {/* Profile: avatar and name, then status */}
          <div className={`flex w-full min-w-0 items-center gap-[0.3em] text-[0.85em] font-semibold ${textOn}`}>
            <Avatar name={staff.name} dim={shift !== "in"} />
            <span className="min-w-0 flex-1 truncate text-left">{staff.name}</span>
            {more > 0 && (
              <span className="hidden shrink-0 rounded-full bg-black/25 px-[0.4em] font-mono @[10rem]:inline">
                +{more}
              </span>
            )}
            <span
              title={status}
              className={`h-[0.45em] w-[0.45em] shrink-0 rounded-full ${dotClass}`}
            />
          </div>
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-[0.25em]">
            {body}
          </div>
        </div>
      </div>
      <div className="h-1 w-[38%] rounded-b-md bg-raised" />
    </div>
  );
}
