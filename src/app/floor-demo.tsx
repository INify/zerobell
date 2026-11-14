"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Demo rules
// ---------------------------------------------------------------------------

const GREETING_LIMIT_S = 15; // the promise: every guest greeted within 15s
const URGENT_AT_S = 5; // table card turns red in the last 5 seconds
const ESCALATE_AFTER_S = 8; // runners are alerted if nobody claims it by then
const BUSY_AFTER_ATTEND_S = 12; // staff are "Busy Serving" this long after attending
const NOTICE_FOR_MS = 6000; // "Table 4 taken by Waiter 1" fades after this

type ZoneId = "A" | "B" | "C";
type Role = ZoneId | "Runner";
type TableStatus = "available" | "needsGreeting" | "dining" | "needsCleaning";

type Table = {
  id: number;
  zone: ZoneId;
  status: TableStatus;
  alertAt: number | null;
  servedBy: number | null;
  waitedMs: number | null;
};

type Staff = { id: number; role: Role; onBreak: boolean };
type BusyInfo = { until: number; tableId: number; waitedMs: number };
type BusyMap = Record<number, BusyInfo>;
type Notices = Record<number, { text: string; at: number } | null>;

// ---------------------------------------------------------------------------
// Local sample data
// ---------------------------------------------------------------------------

const ZONES: { id: ZoneId; first: number; last: number }[] = [
  { id: "A", first: 1, last: 4 },
  { id: "B", first: 5, last: 8 },
  { id: "C", first: 9, last: 12 },
];
const TOTAL_TABLES = 12;

const STAFF: Staff[] = [
  { id: 1, role: "A", onBreak: false },
  { id: 2, role: "B", onBreak: false },
  { id: 3, role: "C", onBreak: false },
  { id: 4, role: "A", onBreak: false },
  { id: 5, role: "B", onBreak: false },
  { id: 6, role: "C", onBreak: false },
  { id: 7, role: "A", onBreak: false },
  { id: 8, role: "B", onBreak: false },
  { id: 9, role: "C", onBreak: true },
  { id: 10, role: "Runner", onBreak: false },
  { id: 11, role: "Runner", onBreak: false },
];

// After someone taps Attending, their face stays big this long so the
// handoff is visible even if the zone has other tables waiting.
const JUST_GREETED_MS = 4000;

const ROSTER_GROUPS: { label: string; role: Role }[] = [
  { label: "Zone A", role: "A" },
  { label: "Zone B", role: "B" },
  { label: "Zone C", role: "C" },
  { label: "Runners", role: "Runner" },
];

// Tables already dining when the demo opens, and which waiter has them.
const DINING_AT_START: Record<number, number> = {
  2: 4,
  6: 5,
  11: 6,
};

function zoneOf(tableId: number): ZoneId {
  const zone = ZONES.find((z) => tableId >= z.first && tableId <= z.last);
  return zone ? zone.id : "C";
}

function startingTables(): Table[] {
  return Array.from({ length: TOTAL_TABLES }, (_, i) => {
    const id = i + 1;
    const waiter = DINING_AT_START[id];
    return {
      id,
      zone: zoneOf(id),
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

// 3–4 random free tables, covering every zone that has a free table.
function pickRushTables(tables: Table[]): number[] {
  const free = shuffled(tables.filter((t) => t.status === "available"));
  const picked: Table[] = [];
  for (const z of ZONES) {
    const t = free.find((x) => x.zone === z.id);
    if (t) picked.push(t);
  }
  const target = 3 + Math.floor(Math.random() * 2);
  for (const t of free) {
    if (picked.length >= target) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.map((t) => t.id);
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

function isBusy(busy: BusyMap, staffId: number, now: number) {
  const b = busy[staffId];
  return !!b && b.until > now;
}

function isAvailable(s: Staff, busy: BusyMap, now: number) {
  return !s.onBreak && !isBusy(busy, s.id, now);
}

function isAlerting(t: Table) {
  return t.status === "needsGreeting" || t.status === "needsCleaning";
}

// Who gets this table's alert right now: the zone's free staff, plus free
// runners once 8 seconds pass unclaimed (or straight away if the zone has
// nobody free).
function recipientsFor(t: Table, busy: BusyMap, now: number): number[] {
  if (!isAlerting(t) || t.alertAt === null) return [];
  const zoneStaff = STAFF.filter(
    (s) => s.role === t.zone && isAvailable(s, busy, now)
  );
  const escalated =
    zoneStaff.length === 0 || now - t.alertAt >= ESCALATE_AFTER_S * 1000;
  const runners = escalated
    ? STAFF.filter((s) => s.role === "Runner" && isAvailable(s, busy, now))
    : [];
  return [...zoneStaff, ...runners].map((s) => s.id);
}

// New guests before cleaning; oldest first.
function alertOrder(a: Table, b: Table) {
  if (a.status !== b.status) return a.status === "needsGreeting" ? -1 : 1;
  return (a.alertAt ?? 0) - (b.alertAt ?? 0);
}

// Move focus to an element that exists after the next render, so keyboard users
// keep their place when the button they pressed disappears. The first id that
// exists wins (a waiter's big face, else their mini watch).
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

// Which waiter in a group gets the big face: whoever just greeted (so the
// handoff shows), then whoever is alerted to greet, then to clean, then busy,
// then ready. Runners only get a big face once one of them is needed.
function pickLead(
  group: Staff[],
  alertsOf: (id: number) => Table[],
  busy: BusyMap,
  now: number,
  runners: boolean
): Staff | null {
  const ranked = group.map((s, order) => {
    const alerts = alertsOf(s.id);
    const b = isBusy(busy, s.id, now) ? busy[s.id] : null;
    const greetedAt = b ? b.until - BUSY_AFTER_ATTEND_S * 1000 : 0;
    const rank = s.onBreak
      ? 5
      : b && now - greetedAt < JUST_GREETED_MS
      ? 0
      : alerts.some((t) => t.status === "needsGreeting")
      ? 1
      : alerts.length > 0
      ? 2
      : b
      ? 3
      : 4;
    // Among those who just greeted, the most recent one leads.
    return { s, rank, tie: rank === 0 ? -greetedAt : order };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.tie - b.tie);
  const best = ranked[0];
  if (!best || (runners && best.rank > 2)) return null;
  return best.s;
}

function roleLabel(role: Role) {
  return role === "Runner" ? "Runner · All zones" : `Zone ${role}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FloorDemo() {
  const [tables, setTables] = useState<Table[]>(startingTables);
  const [busy, setBusy] = useState<BusyMap>({});
  const [now, setNow] = useState(0);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [tablesTurned, setTablesTurned] = useState(0);
  const [notices, setNotices] = useState<Notices>({});
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(readClock()), 250);
    return () => clearInterval(id);
  }, []);

  // ---- derived, live state ----
  const recipients = new Map<number, number[]>();
  for (const t of tables) recipients.set(t.id, recipientsFor(t, busy, now));
  const alertedStaff = new Set([...recipients.values()].flat());
  const alertsFor = (staffId: number) =>
    tables
      .filter((t) => recipients.get(t.id)?.includes(staffId))
      .sort(alertOrder);

  const activeTables = tables.filter((t) => t.status !== "available").length;
  const availableStaff = STAFF.filter((s) => isAvailable(s, busy, now)).length;
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
  const escalatedIds = tables
    .filter(
      (t) =>
        isAlerting(t) &&
        t.alertAt !== null &&
        now - t.alertAt >= ESCALATE_AFTER_S * 1000 &&
        !overdueIds.includes(t.id)
    )
    .map((t) => t.id);
  const urgentAnnouncement = [
    overdueIds.length > 0 && `Overdue: ${listTables(overdueIds)}.`,
    escalatedIds.length > 0 && `Runners called for ${listTables(escalatedIds)}.`,
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
    setAnnouncement(`Table ${id} needs greeting, Zone ${zoneOf(id)}.`);
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
    // Whoever was serving this table is free as soon as the guests leave, so
    // their watch can pick up the cleaning alert instead of showing a stale
    // "Serving Table N".
    setBusy((b) => {
      const next: BusyMap = {};
      for (const [staffId, info] of Object.entries(b)) {
        if (info.tableId !== id) next[Number(staffId)] = info;
      }
      return next;
    });
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

  function attend(staffId: number, tableId: number) {
    const t = readClock();
    const table = tables.find((x) => x.id === tableId);
    if (!table || table.status !== "needsGreeting" || table.alertAt === null) return;
    const waited = t - table.alertAt;
    const others = recipientsFor(table, busy, t).filter((id) => id !== staffId);
    setNow(t);
    updateTable(tableId, { status: "dining", servedBy: staffId, waitedMs: waited });
    setBusy((b) => ({
      ...b,
      [staffId]: { until: t + BUSY_AFTER_ATTEND_S * 1000, tableId, waitedMs: waited },
    }));
    setResponseTimes((r) => [...r, waited]);
    setNotices((n) => {
      const next: Notices = { ...n, [staffId]: null };
      for (const id of others)
        next[id] = { text: `Table ${tableId} taken by Waiter ${staffId}`, at: t };
      return next;
    });
    setAnnouncement(
      `Waiter ${staffId} attending Table ${tableId} after ${Math.round(waited / 1000)} seconds.`
    );
    focusAfterRender(`watch-${staffId}`, `mini-${staffId}`);
  }

  function cleaned(staffId: number, tableId: number) {
    const t = readClock();
    const table = tables.find((x) => x.id === tableId);
    if (!table || table.status !== "needsCleaning") return;
    const others = recipientsFor(table, busy, t).filter((id) => id !== staffId);
    setNow(t);
    updateTable(tableId, {
      status: "available",
      alertAt: null,
      servedBy: null,
      waitedMs: null,
    });
    setTablesTurned((n) => n + 1);
    setNotices((n) => {
      const next: Notices = {
        ...n,
        [staffId]: { text: `Table ${tableId} cleaned · now Available`, at: t },
      };
      for (const id of others)
        next[id] = { text: `Table ${tableId} cleaned by Waiter ${staffId}`, at: t };
      return next;
    });
    setAnnouncement(`Table ${tableId} cleaned and available.`);
    focusAfterRender(`watch-${staffId}`, `mini-${staffId}`);
  }

  function resetDemo() {
    setTables(startingTables());
    setBusy({});
    setResponseTimes([]);
    setTablesTurned(0);
    setNotices({});
    setAnnouncement("Demo reset.");
  }

  // Each group's big face: one per zone, and a runner once one is needed.
  const leads = new Map<Role, Staff | null>();
  for (const role of ["A", "B", "C", "Runner"] as Role[]) {
    leads.set(
      role,
      pickLead(STAFF.filter((s) => s.role === role), alertsFor, busy, now, role === "Runner")
    );
  }

  // One line per alerting table per group it reaches: to that group's big
  // face when it is alerted, otherwise to the first alerted mini watch.
  const links: AlertLink[] = [];
  for (const t of tables) {
    if (!isAlerting(t)) continue;
    const left = secondsLeft(t.alertAt, now);
    const tone: LinkTone =
      t.status === "needsCleaning" ? "clean" : left <= URGENT_AT_S ? "urgent" : "wait";
    const reached = recipients.get(t.id) ?? [];
    for (const role of [t.zone, "Runner"] as Role[]) {
      const inGroup = reached.filter((id) => STAFF.find((s) => s.id === id)?.role === role);
      if (inGroup.length === 0) continue;
      const lead = leads.get(role);
      const toLead = !!lead && inGroup.includes(lead.id);
      links.push({
        tableId: t.id,
        target: toLead ? `watch-${lead.id}` : `mini-${inGroup[0]}`,
        mini: !toLead,
        tone,
        runner: role === "Runner",
      });
    }
  }

  const renderGroup = (role: Role, placeholder?: ReactNode) => {
    const lead = leads.get(role) ?? null;
    const others = STAFF.filter((s) => s.role === role && s.id !== lead?.id);
    return (
      <div data-wrists className="flex items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          {lead ? (
            <Watch
              key={lead.id}
              staff={lead}
              alerts={alertsFor(lead.id)}
              busyInfo={isBusy(busy, lead.id, now) ? busy[lead.id] : null}
              now={now}
              notice={visibleNotice(lead.id)}
              onAttend={(tableId) => attend(lead.id, tableId)}
              onCleaned={(tableId) => cleaned(lead.id, tableId)}
            />
          ) : (
            placeholder
          )}
        </div>
        <ul
          aria-label={`Other watches, ${role === "Runner" ? "runners" : `Zone ${role}`}`}
          className="flex w-[30%] shrink-0 flex-col gap-1.5 py-1.5"
        >
          {others.map((s) => (
            <li key={s.id} className="flex flex-1">
              <MiniWatch
                staff={s}
                alerts={alertsFor(s.id)}
                busyInfo={isBusy(busy, s.id, now) ? busy[s.id] : null}
                now={now}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  };

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
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="text-2xl font-bold tracking-tight">ZeroBell</h1>
              <p className="flex items-baseline gap-1.5 text-sm">
                <SeatIcon />
                <span>
                  <span className="font-semibold text-ink">Seat sensors detect each guest.</span>{" "}
                  <span className="text-muted">Tap a table to simulate.</span>
                </span>
              </p>
            </div>
            <p className="text-sm text-muted">
              Every guest greeted within {GREETING_LIMIT_S} seconds. No waving, no
              bells.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
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
          </div>
        </div>
      </header>

      <div id="floor"
        className="relative mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-4 py-4 sm:px-6 lg:min-h-0">
        <AlertLines links={links} />

        <h2 id="floor-heading" className="sr-only">
          Floor: each zone&apos;s waiters and their watches sit above its tables. Tap a
          table to seat a guest; in the restaurant, a seat sensor does this.
        </h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-y-2 [--face-h:300px] lg:[--face-h:clamp(160px,calc(100dvh-470px),420px)]">
          {ZONES.map((z) => {
            const zoneStaff = STAFF.filter((s) => s.role === z.id);
            const free = zoneStaff.filter((s) => isAvailable(s, busy, now)).length;
            return (
              <section
                key={z.id}
                aria-labelledby={`zone-${z.id}-heading`}
                className="flex flex-col gap-2 lg:row-span-3 lg:grid lg:min-h-0 lg:grid-rows-subgrid lg:gap-y-2"
              >
                <h3
                  id={`zone-${z.id}-heading`}
                  className="flex items-baseline justify-between gap-2 pl-2 text-sm font-semibold"
                >
                  <span>
                    Zone {z.id}{" "}
                    <span className="font-normal text-muted">
                      · Tables {z.first}–{z.last}
                    </span>
                  </span>
                  <span className="text-xs font-normal text-muted">
                    {free} of {zoneStaff.length} staff free
                  </span>
                </h3>
                {renderGroup(z.id)}
                <div
                  data-tables
                  className="grid auto-rows-[minmax(3.5rem,1fr)] grid-cols-2 gap-1.5 lg:mt-5 lg:min-h-0"
                >
                  {tables
                    .filter((t) => t.zone === z.id)
                    .map((t) => (
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
              </section>
            );
          })}
          <section
            aria-labelledby="runners-heading"
            className="flex flex-col gap-2 lg:row-span-3 lg:grid lg:min-h-0 lg:grid-rows-subgrid lg:gap-y-2"
          >
            <h3
              id="runners-heading"
              className="flex items-baseline justify-between gap-2 pl-2 text-sm font-semibold"
            >
              Runners
              <span className="text-xs font-normal text-muted">
                Backup after {ESCALATE_AFTER_S}s
              </span>
            </h3>
            {renderGroup(
              "Runner",
              <div className="flex min-h-24 flex-1 items-center justify-center rounded-[1.9rem] border-2 border-dashed border-line p-3 text-center text-sm text-muted">
                Runners step in when a table waits {ESCALATE_AFTER_S}s
              </div>
            )}
            <div className="lg:mt-5 lg:min-h-0">
              <Roster busy={busy} now={now} alerted={alertedStaff} />
            </div>
          </section>
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
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-mono text-xl font-bold tabular-nums ${METRIC_TONE[tone]}`}>
        {value}
      </dd>
    </div>
  );
}

// ---- alert lines ----------------------------------------------------------

type LinkTone = "wait" | "urgent" | "clean";
type AlertLink = { tableId: number; target: string; mini: boolean; tone: LinkTone; runner: boolean };

// Same values as the wait / urgent / clean tokens in globals.css.
const LINK_STROKE: Record<LinkTone, string> = {
  wait: "#ffb000",
  urgent: "#ff5a4f",
  clean: "#6aa8ff",
};

// Draws a line from each lit table to the wrist it is buzzing (dashed for a
// runner). The line leaves the table's left chair, climbs the gutter beside
// the table (never across another table), crosses in the channel between the
// floor and the wrists in its wrist's own lane, then rises to the strap.
// Paths are kept per table-and-wrist pair: a line draws in once when its alert
// starts, and later ticks only update its geometry.
function AlertLines({ links }: { links: AlertLink[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const tablesTop = document.querySelector("[data-tables]");
    if (!svg || !tablesTop) return;
    const box = svg.getBoundingClientRect();
    const floorTop = tablesTop.getBoundingClientRect().top - box.top;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new Set<string>();
    links.forEach((link, i) => {
      const seat = document.getElementById(`seat-${link.tableId}`);
      const table = document.getElementById(`table-${link.tableId}`);
      const watch = document.getElementById(link.target);
      const group = watch?.closest("[data-wrists]");
      if (!seat || !table || !watch || !group) return;
      const a = seat.getBoundingClientRect();
      const t = table.getBoundingClientRect();
      const b = watch.getBoundingClientRect();
      const g = group.getBoundingClientRect();
      const x0 = a.left - box.left; // the left chair
      const y0 = a.top + a.height / 2 - box.top;
      const xg = t.left - box.left - 3; // middle of the gutter
      // The channel under the wrists, each line in its own lane.
      const bendY = floorTop - 8 - (i % 4) * 4;
      let d: string;
      if (link.mini) {
        // Mini watches stack on the group's right: climb the gutter beside
        // the group and hook in from the right.
        const xr = g.right - box.left + 5;
        const ym = b.top + b.height / 2 - box.top;
        d = `M ${x0} ${y0} H ${xg} V ${bendY} H ${xr} V ${ym} H ${b.right - box.left + 1}`;
      } else {
        // The big face has nothing beneath it: rise straight to its strap.
        const x2 = b.left + b.width / 2 - box.left;
        const y2 = b.bottom - box.top + 18;
        d = `M ${x0} ${y0} H ${xg} V ${bendY} H ${x2} V ${y2}`;
      }
      const dash = link.runner ? "7 7" : "none";
      const key = `${link.tableId}-${link.target}`;
      seen.add(key);
      let path = svg.querySelector<SVGPathElement>(`path[data-key="${key}"]`);
      path?.setAttribute("d", d);
      if (!path) {
        const fresh = document.createElementNS("http://www.w3.org/2000/svg", "path");
        fresh.dataset.key = key;
        fresh.setAttribute("class", "alert-line");
        fresh.setAttribute("d", d);
        svg.appendChild(fresh);
        path = fresh;
        if (!reduceMotion) {
          const length = fresh.getTotalLength();
          fresh.dataset.drawing = "1";
          fresh.style.strokeDasharray = `${length}`;
          const settle = () => {
            if (!fresh.dataset.drawing) return;
            delete fresh.dataset.drawing;
            fresh.style.strokeDasharray = fresh.dataset.dash ?? "none";
          };
          fresh
            .animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
              duration: 450,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            })
            .finished.then(settle, settle);
          // Animations can be held back in background tabs; settle anyway.
          setTimeout(settle, 600);
        }
      }
      path.style.stroke = LINK_STROKE[link.tone];
      path.dataset.dash = dash;
      if (!path.dataset.drawing) path.style.strokeDasharray = dash;
    });
    for (const path of svg.querySelectorAll<SVGPathElement>("path[data-key]")) {
      if (!seen.has(path.dataset.key ?? "")) path.remove();
    }
  });

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 hidden h-full w-full lg:block"
    />
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
      : table.status === "needsCleaning"
      ? "cleaning"
      : left <= URGENT_AT_S
      ? "urgent"
      : "waiting";
  const runnersIn = alerted.some(
    (id) => STAFF.find((s) => s.id === id)?.role === "Runner"
  );
  const reach =
    alerted.length === 0
      ? "No staff free"
      : runnersIn
      ? `${alerted.length} + runners`
      : `${alerted.length} alerted`;
  const spoken =
    table.status === "available"
      ? "free"
      : table.status === "needsGreeting"
      ? left > 0
        ? "needs greeting"
        : "overdue"
      : table.status === "dining"
      ? `dining, served by Waiter ${table.servedBy}`
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
          className={`font-mono text-base font-bold tabular-nums ${
            state === "urgent" ? "text-urgent" : "text-wait"
          }`}
        >
          {left > 0 ? mmss(left) : "Overdue"}
        </span>
      );
      line2 = <span className="text-muted">{reach}</span>;
      break;
    case "dining":
      line1 = <span className="font-semibold text-greeted">Waiter {table.servedBy}</span>;
      line2 = <span className="text-muted">Tap: guest left</span>;
      break;
    case "needsCleaning":
      line1 = <span className="font-semibold text-clean">To clean</span>;
      line2 = <span className="text-muted">{reach}</span>;
      break;
  }

  const action =
    table.status === "available"
      ? { onClick: onGuestSat, label: `Guest Sat at Table ${table.id}` }
      : table.status === "dining"
      ? { onClick: onGuestLeft, label: `Guest Left Table ${table.id}` }
      : null;

  const tileClass = `flex h-full w-full min-w-0 flex-col items-start justify-center rounded-lg border-2 px-2 py-1 text-left text-xs transition-colors ${SEAT_TILE[state]}`;
  const tileBody = (
    <>
      <span className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-bold text-ink">T{table.id}</span>
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

// ---- roster ---------------------------------------------------------------

function Roster({
  busy,
  now,
  alerted,
}: {
  busy: BusyMap;
  now: number;
  alerted: Set<number>;
}) {
  const onBreak = STAFF.filter((s) => s.onBreak).length;
  const busyCount = STAFF.filter((s) => !s.onBreak && isBusy(busy, s.id, now)).length;
  const available = STAFF.length - onBreak - busyCount;
  const pct = (n: number) => `${(n / STAFF.length) * 100}%`;

  return (
    <section
      aria-labelledby="staff-heading"
      className="relative z-10 flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-3 lg:h-full lg:overflow-y-auto"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="staff-heading" className="text-base font-semibold">
          Shift · {STAFF.length} staff
        </h2>
        <p className="text-sm text-muted">
          <span className="text-ink">{available} free</span> ·{" "}
          <span className="text-greeted">{busyCount} serving</span> · {onBreak} on break
        </p>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-raised">
        <div className="bg-ink transition-all" style={{ width: pct(available) }} />
        <div className="bg-greeted transition-all" style={{ width: pct(busyCount) }} />
      </div>
      <ul className="flex flex-col gap-1">
        {ROSTER_GROUPS.map((g) => (
          <li key={g.role} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs font-semibold text-muted">{g.label}</span>
            <div className="flex flex-wrap gap-1">
              {STAFF.filter((s) => s.role === g.role).map((s) => {
                const isB = !s.onBreak && isBusy(busy, s.id, now);
                const isAlerted = alerted.has(s.id);
                const state = s.onBreak ? "On Break" : isB ? "Busy Serving" : "Available";
                const chipClass = s.onBreak
                  ? "border border-dashed border-line text-dim"
                  : isB
                  ? "bg-greeted-tint text-greeted ring-1 ring-greeted"
                  : isAlerted
                  ? "bg-urgent-tint text-ink ring-2 ring-urgent"
                  : "bg-raised text-ink ring-1 ring-line";
                return (
                  <span
                    key={s.id}
                    title={`Waiter ${s.id} · ${roleLabel(s.role)} · ${state}${
                      isAlerted ? " · alerted" : ""
                    }`}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${chipClass}`}
                  >
                    W{s.id}
                    {s.onBreak && <span className="font-sans font-normal">break</span>}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-auto flex items-center gap-1.5 text-xs text-muted">
        <span className="h-3 w-3 shrink-0 rounded-sm ring-2 ring-urgent" aria-hidden /> Ringed:
        alerted now
      </p>
    </section>
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

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[2.2em] w-[2.2em]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function WipeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[2.2em] w-[2.2em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="15" rx="9" ry="4" />
      <path d="M8 9c1.5-1 3-1 4 0s2.5 1 4 0M9 5.5c1-.7 2-.7 3 0s2 .7 3 0" />
    </svg>
  );
}

// ---- wrist ----------------------------------------------------------------

// A small watch for everyone in the group who isn't on the big face: it
// still flashes when alerted, so the whole zone's reach stays visible.
function MiniWatch({
  staff,
  alerts,
  busyInfo,
  now,
}: {
  staff: Staff;
  alerts: Table[];
  busyInfo: BusyInfo | null;
  now: number;
}) {
  const top = alerts[0];
  let faceClass = "bg-face text-white";
  let state: ReactNode = <span className="text-muted">Ready</span>;
  let spoken = "ready";
  if (staff.onBreak) {
    faceClass = "bg-face opacity-60";
    state = <span className="text-dim">On break</span>;
    spoken = "on break";
  } else if (top && top.status === "needsGreeting") {
    const left = secondsLeft(top.alertAt, now);
    faceClass = "alert-flash text-white";
    state = (
      <span className="font-mono tabular-nums">
        T{top.id} {mmss(left).slice(3)}s
      </span>
    );
    spoken = `alerted, Table ${top.id}`;
  } else if (top) {
    faceClass = "bg-face-clean text-white";
    state = <span>Clean T{top.id}</span>;
    spoken = `clean Table ${top.id}`;
  } else if (busyInfo) {
    faceClass = "bg-face-busy text-white";
    state = <span>Serving T{busyInfo.tableId}</span>;
    spoken = `serving Table ${busyInfo.tableId}`;
  }
  return (
    <div
      id={`mini-${staff.id}`}
      tabIndex={-1}
      aria-label={`Waiter ${staff.id}, ${spoken}`}
      className={`flex w-full min-w-0 flex-col justify-center rounded-xl border-2 border-bezel px-2 py-1 leading-tight transition-colors ${faceClass}`}
    >
      <span className="font-mono text-sm font-bold">W{staff.id}</span>
      <span className="truncate text-xs">{state}</span>
    </div>
  );
}

// Face height: the row's target height, unless the column is too narrow for a
// face that tall (the face keeps a 0.82 width-to-height ratio inside its bezel).
const FACE_H = "min(var(--face-h), calc((100cqw - 1.75rem) / 0.82))";

function Watch({
  staff,
  alerts,
  busyInfo,
  now,
  notice,
  onAttend,
  onCleaned,
}: {
  staff: Staff;
  alerts: Table[];
  busyInfo: BusyInfo | null;
  now: number;
  notice: string | null;
  onAttend: (tableId: number) => void;
  onCleaned: (tableId: number) => void;
}) {
  const top = alerts[0];
  const isRunner = staff.role === "Runner";
  const more =
    alerts.length > 1 ? (
      <p className="w-full truncate text-[0.85em] font-semibold leading-tight">
        +{alerts.length - 1} more:{" "}
        {alerts
          .slice(1)
          .map((t) => `T${t.id}`)
          .join(", ")}
      </p>
    ) : null;
  // Where the alert came from; shown when the face has room for it.
  const sourceNote = (t: Table, sensor: boolean) =>
    isRunner ? (
      <p className="hidden text-[0.85em] leading-tight @[11rem]:block">Backup for Zone {t.zone}</p>
    ) : sensor ? (
      <p className="hidden text-[0.85em] leading-tight @[11rem]:block">Seat sensor alert</p>
    ) : null;
  const actionClass =
    "mt-[0.15em] min-h-11 w-full rounded-full bg-white py-[0.4em] text-[1em] font-extrabold active:scale-95 lg:min-h-0";

  let faceClass = "bg-face";
  let statusText = "Ready";
  let statusClass = "text-muted";
  let dotClass = "bg-dim";
  let body: ReactNode;

  if (staff.onBreak) {
    faceClass = "bg-face opacity-60";
    statusText = "Off";
    body = (
      <>
        <p className="text-[1.15em] font-bold text-muted">On break</p>
        <p className="text-[0.85em] leading-tight text-dim">No alerts</p>
      </>
    );
  } else if (top && top.status === "needsGreeting") {
    const left = secondsLeft(top.alertAt, now);
    faceClass = "alert-flash";
    statusText = "Alert";
    statusClass = "text-white";
    dotClass = "bg-white";
    body = (
      <>
        <p className="text-[1.1em] font-bold leading-tight">Table {top.id}</p>
        {sourceNote(top, true)}
        <p className="font-mono text-[2.1em] font-bold leading-none tabular-nums">{mmss(left)}</p>
        {more ?? (
          <p className="text-[0.85em] font-semibold uppercase tracking-wider">
            {left > 0 ? "Greet now" : "Overdue!"}
          </p>
        )}
        <button
          onClick={() => onAttend(top.id)}
          aria-label={`Attending Table ${top.id} (Waiter ${staff.id})`}
          className={`${actionClass} text-red-700`}
        >
          Attending
        </button>
      </>
    );
  } else if (top) {
    faceClass = "bg-face-clean";
    statusText = "Clean";
    statusClass = "text-white";
    dotClass = "bg-white";
    body = (
      <>
        <WipeIcon />
        <p className="text-[1.1em] font-bold leading-tight">Clean Table {top.id}</p>
        {sourceNote(top, false)}
        {more}
        <button
          onClick={() => onCleaned(top.id)}
          aria-label={`Cleaned Table ${top.id} (Waiter ${staff.id})`}
          className={`${actionClass} text-blue-700`}
        >
          Cleaned
        </button>
      </>
    );
  } else if (busyInfo) {
    faceClass = "bg-face-busy";
    statusText = "Busy";
    statusClass = "text-white";
    dotClass = "bg-white";
    const freeIn = Math.max(0, Math.ceil((busyInfo.until - now) / 1000));
    body = (
      <>
        <span className="hidden @[11rem]:block">
          <CheckIcon />
        </span>
        <p className="font-mono text-[2.1em] font-bold leading-none tabular-nums">
          {Math.round(busyInfo.waitedMs / 1000)}s
        </p>
        <p className="text-[0.85em] font-semibold uppercase tracking-wider">Greeted</p>
        <p className="text-[0.85em] leading-tight">
          Table {busyInfo.tableId} · free in {freeIn}s
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-[1.25em] font-bold text-ink">Ready</p>
        {notice ? (
          <p className="w-full rounded-lg bg-white/10 px-1.5 py-1 text-[0.85em] leading-tight text-ink">
            {notice}
          </p>
        ) : (
          <p className="text-[0.85em] leading-tight text-muted">Waiting for a table</p>
        )}
      </>
    );
  }

  return (
    <div className="@container relative z-10 flex min-w-0 flex-col items-center">
      {/* strap */}
      <div className="h-1.5 w-[38%] rounded-t-lg bg-raised" />
      <div className="relative max-w-full rounded-[1.9rem] border-4 border-bezel bg-ground p-1.5">
        {/* crown */}
        <div className="absolute -right-2 top-[30%] h-[18%] w-1.5 rounded-r-md bg-bezel" />
        <div
          id={`watch-${staff.id}`}
          role="group"
          tabIndex={-1}
          aria-label={`Waiter ${staff.id} watch${isRunner ? ", runner" : `, Zone ${staff.role}`}`}
          style={{
            height: FACE_H,
            width: `calc(${FACE_H} * 0.82)`,
            fontSize: `clamp(13px, calc(${FACE_H} * 0.072), 20px)`,
          }}
          className={`flex max-w-full flex-col items-center gap-[0.3em] overflow-hidden rounded-[1.5rem] px-[0.7em] py-[0.7em] text-center text-white transition-colors ${faceClass}`}
        >
          <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap text-[0.85em] font-semibold uppercase tracking-wide">
            <span className="font-mono">W{staff.id}</span>
            <span className={`flex items-center gap-1 ${statusClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
              {statusText}
            </span>
          </div>
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-[0.3em]">
            {body}
          </div>
        </div>
      </div>
      <div className="h-1.5 w-[38%] rounded-b-lg bg-raised" />
    </div>
  );
}
