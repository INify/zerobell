"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CameraPanel, { type SlotCamera } from "./camera-panel";
import { isLocalHost, postSync, type SyncAction } from "./sync";

// ---------------------------------------------------------------------------
// Demo rules: how long a plate has waited at the pass decides who is alerted
// and what colour the bands show.
// ---------------------------------------------------------------------------

export const NEXT_WAITER_S = 15; // no Accept yet: alert a second waiter
export const AMBER_S = 30; // amber, and every free waiter is alerted
export const RED_S = 45; // red, buzzing repeatedly
export const LATE_S = 60; // counted as a late plate
export const WALK_S = 5; // after Accept, the camera sees the plate leave this much later

export type Stage = "green" | "amber" | "red" | "late";

// While a band is alerted it buzzes once, then again every few seconds until
// Accept. The longer the plate waits, the closer together the buzzes.
export const BUZZ_EVERY_MS: Record<Stage, number> = {
  green: 3000,
  amber: 2500,
  red: 2000,
  late: 2000,
};

export function stageFor(waitedMs: number): Stage {
  const s = waitedMs / 1000;
  return s < AMBER_S ? "green" : s < RED_S ? "amber" : s < LATE_S ? "red" : "late";
}

// How many waiters a plate that nobody has accepted should be buzzing.
function waitersNeeded(waitedMs: number) {
  const s = waitedMs / 1000;
  return s < NEXT_WAITER_S ? 1 : s < AMBER_S ? 2 : Infinity;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Slot = {
  id: number;
  plateAt: number | null; // when the camera saw the plate (Place plate)
  alerted: number[]; // waiters whose band is buzzing for this plate
  takenBy: number | null; // the waiter who pressed Accept
  acceptedAt: number | null;
  lastWaitMs: number | null; // the previous plate here, once picked up
  lastLate: boolean;
};

export type Shift = "in" | "break";

export type World = {
  slots: Slot[];
  tasks: Record<number, number>; // waiter id → slot they are walking to
  shifts: Record<number, Shift>;
  turn: number; // round-robin pointer, so waiters take turns
  waits: number[]; // every picked-up plate's wait, in ms
  late: number;
  lastPickup: { slotId: number; waitedMs: number; late: boolean; at: number } | null;
};

export type Staff = { id: number; name: string };

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

const SLOT_COUNT = 4;
const SLOT_IDS = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

// Camera mode needs a webcam, which browsers only allow on a secure page, and
// our /api/jev route, which only runs on the laptop. So: localhost only.
const noSubscribe = () => () => {};
function cameraSupported() {
  return (
    isLocalHost(window.location.hostname) &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

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

function emptySlot(id: number): Slot {
  return {
    id,
    plateAt: null,
    alerted: [],
    takenBy: null,
    acceptedAt: null,
    lastWaitMs: null,
    lastLate: false,
  };
}

// The plate leaves the pass: stop its timer, log the wait, free the waiter.
export function pickUp(w: World, slotId: number, now: number): World {
  const slot = w.slots.find((s) => s.id === slotId);
  if (!slot || slot.plateAt === null) return w;
  const waited = now - slot.plateAt;
  const late = waited >= LATE_S * 1000;
  const tasks = { ...w.tasks };
  for (const [id, s] of Object.entries(tasks)) if (s === slotId) delete tasks[Number(id)];
  return {
    ...w,
    tasks,
    waits: [...w.waits, waited],
    late: w.late + (late ? 1 : 0),
    lastPickup: { slotId, waitedMs: waited, late, at: now },
    slots: w.slots.map((s) =>
      s.id === slotId ? { ...emptySlot(slotId), lastWaitMs: waited, lastLate: late } : s
    ),
  };
}

// The camera sees accepted plates leave once the waiter has had time to walk
// to the pass.
function autoPickUp(w: World, now: number): World {
  let next = w;
  for (const s of w.slots) {
    if (s.acceptedAt !== null && now - s.acceptedAt >= WALK_S * 1000) next = pickUp(next, s.id, now);
  }
  return next;
}

function startingWorld(): World {
  const shifts: Record<number, Shift> = {};
  for (const s of STAFF) shifts[s.id] = "in";
  shifts[9] = "break";
  shifts[11] = "break";
  return {
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i + 1)),
    tasks: {},
    shifts,
    turn: 0,
    waits: [],
    late: 0,
    lastPickup: null,
  };
}

export function isFree(w: World, id: number) {
  return w.shifts[id] === "in" && w.tasks[id] === undefined;
}

function isWaiting(s: Slot) {
  return s.plateAt !== null && s.takenBy === null;
}

// Keep every waiting plate buzzing the right number of free waiters. Drops
// waiters who went on a break or took another plate, and adds new ones as
// the wait grows. A new waiter is the free one with the fewest plates already
// buzzing them, then whoever's turn is next, so a rush spreads across the team.
export function reconcile(w: World, now: number): World {
  const free = STAFF.map((s) => s.id).filter((id) => isFree(w, id));
  const load = new Map<number, number>(free.map((id) => [id, 0]));
  let turn = w.turn;
  let changed = false;

  const order = [...w.slots]
    .filter(isWaiting)
    .sort((a, b) => (a.plateAt ?? 0) - (b.plateAt ?? 0))
    .map((s) => s.id);
  const next = new Map<number, number[]>();

  for (const slotId of order) {
    const slot = w.slots.find((s) => s.id === slotId)!;
    const alerted = slot.alerted.filter((id) => load.has(id));
    const target = Math.min(waitersNeeded(now - (slot.plateAt ?? now)), free.length);
    while (alerted.length < target) {
      const n = STAFF.length;
      const pick = free
        .filter((id) => !alerted.includes(id))
        .sort(
          (a, b) =>
            (load.get(a) ?? 0) - (load.get(b) ?? 0) ||
            ((a - 1 - turn + n) % n) - ((b - 1 - turn + n) % n)
        )[0];
      if (pick === undefined) break;
      alerted.push(pick);
      turn = pick % n;
    }
    for (const id of alerted) load.set(id, (load.get(id) ?? 0) + 1);
    if (alerted.length !== slot.alerted.length || alerted.some((id, i) => slot.alerted[i] !== id)) {
      changed = true;
    }
    next.set(slotId, alerted);
  }

  if (!changed) return w;
  return {
    ...w,
    turn,
    slots: w.slots.map((s) => (next.has(s.id) ? { ...s, alerted: next.get(s.id)! } : s)),
  };
}

// What one band shows. A band has no screen: only a coloured light, a buzz and
// one button.
export type BandState =
  | { kind: "break" }
  | { kind: "idle" }
  | { kind: "going"; slotId: number }
  | { kind: "alert"; slotId: number; stage: Stage; plates: number };

export function bandState(w: World, id: number, now: number): BandState {
  if (w.shifts[id] !== "in") return { kind: "break" };
  const task = w.tasks[id];
  if (task !== undefined) return { kind: "going", slotId: task };
  const mine = w.slots
    .filter((s) => isWaiting(s) && s.alerted.includes(id))
    .sort((a, b) => (a.plateAt ?? 0) - (b.plateAt ?? 0));
  if (mine.length === 0) return { kind: "idle" };
  const top = mine[0];
  return {
    kind: "alert",
    slotId: top.id,
    stage: stageFor(now - (top.plateAt ?? now)),
    plates: mine.length,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function secs(ms: number) {
  return `${Math.round(ms / 1000)}s`;
}

function names(ids: number[]) {
  return ids.map(staffName).join(", ");
}

const STAGE_TEXT: Record<Stage, string> = {
  green: "text-greeted",
  amber: "text-wait",
  red: "text-urgent",
  late: "text-urgent",
};

const STAGE_TILE: Record<Stage, string> = {
  green: "border-greeted bg-greeted-tint",
  amber: "border-wait bg-wait-tint",
  red: "border-urgent bg-urgent-tint",
  late: "border-urgent bg-urgent-tint alert-flash-border",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PassDemo() {
  const [world, setWorld] = useState<World>(startingWorld);
  const [now, setNow] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  // ---- Camera mode ----
  const canUseCamera = useSyncExternalStore(noSubscribe, cameraSupported, () => false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<Record<number, SlotCamera>>({});
  const [resets, setResets] = useState(0); // tells the camera to look afresh
  // In Camera mode the real camera decides when a plate leaves, so the
  // simulated "plate leaves 5s after Accept" is switched off.
  const cameraOnRef = useRef(cameraOn);
  useEffect(() => {
    cameraOnRef.current = cameraOn;
  });

  // Tick: move the clock and escalate waiting plates as thresholds pass.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setWorld((w) => reconcile(cameraOnRef.current ? w : autoPickUp(w, t), t));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Announce every pickup, whether the camera (auto) or the button did it.
  const lastPickup = world.lastPickup;
  useEffect(() => {
    if (!lastPickup) return;
    const id = setTimeout(() =>
      setAnnouncement(
        `Slot ${lastPickup.slotId} picked up after ${secs(lastPickup.waitedMs)}${
          lastPickup.late ? ", late" : ""
        }.`
      )
    );
    return () => clearTimeout(id);
  }, [lastPickup]);

  // ---- phone bands (/watch), on the local network only ----
  const [phones, setPhones] = useState<{ url: string; qr: string }[] | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Holds the Phone button and its panel. A press anywhere else closes it.
  const phoneArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!phoneOpen) return;
    const onPress = (e: PointerEvent) => {
      if (!phoneArea.current?.contains(e.target as Node)) setPhoneOpen(false);
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [phoneOpen]);
  const handlers = useRef<{
    accept: (staffId: number) => void;
    setShift: (staffId: number, shift: Shift) => void;
  } | null>(null);
  useEffect(() => {
    handlers.current = { accept, setShift };
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
      if (a.kind === "accept") handlers.current?.accept(a.staffId);
      else handlers.current?.setShift(a.staffId, a.shift);
    });
    return () => source.close();
  }, []);
  useEffect(() => {
    if (!isLocalHost(window.location.hostname)) return;
    postSync({ type: "snapshot", snapshot: { world, sentAt: Date.now() } });
  }, [world]);

  // ---- actions ----
  function placePlate(slotId: number) {
    const t = Date.now();
    setNow(t);
    setWorld((w) =>
      reconcile(
        {
          ...w,
          slots: w.slots.map((s) =>
            s.id === slotId && s.plateAt === null
              ? { ...s, plateAt: t, alerted: [], takenBy: null }
              : s
          ),
        },
        t
      )
    );
    setAnnouncement(`Plate waiting at slot ${slotId}. One free waiter alerted.`);
  }

  // Jev confirmed (2 checks in a row) that a plate arrived or left. `at` is
  // the first check that saw it, so the wait is measured from then.
  function cameraSees(slotId: number, seen: "plate" | "empty", at: number) {
    const t = Date.now();
    setNow(t);
    setWorld((w) => {
      const slot = w.slots.find((s) => s.id === slotId);
      if (!slot) return w;
      if (seen === "plate") {
        if (slot.plateAt !== null) return w;
        return reconcile(
          {
            ...w,
            slots: w.slots.map((s) =>
              s.id === slotId ? { ...s, plateAt: at, alerted: [], takenBy: null } : s
            ),
          },
          t
        );
      }
      if (slot.plateAt === null) return w;
      return reconcile(pickUp(w, slotId, Math.max(at, slot.plateAt)), t);
    });
    setAnnouncement(
      seen === "plate"
        ? `Camera: plate waiting at slot ${slotId}.`
        : `Camera: slot ${slotId} picked up.`
    );
  }

  function toggleCamera() {
    setCameraOn((on) => !on);
    setCameraStatus({});
  }

  function rushHour() {
    const t = Date.now();
    setNow(t);
    setWorld((w) =>
      reconcile(
        {
          ...w,
          slots: w.slots.map((s) =>
            s.plateAt === null ? { ...s, plateAt: t, alerted: [], takenBy: null } : s
          ),
        },
        t
      )
    );
    setAnnouncement("Rush hour: plates waiting on every free slot.");
  }

  // The waiter's single button. It takes the oldest plate buzzing them; the
  // other waiters' bands for that plate go quiet.
  function accept(staffId: number) {
    const t = Date.now();
    setNow(t);
    const state = bandState(world, staffId, t);
    if (state.kind !== "alert") return;
    setWorld((w) =>
      reconcile(
        {
          ...w,
          tasks: { ...w.tasks, [staffId]: state.slotId },
          slots: w.slots.map((s) =>
            s.id === state.slotId ? { ...s, takenBy: staffId, acceptedAt: t, alerted: [] } : s
          ),
        },
        t
      )
    );
    setAnnouncement(`${staffName(staffId)} is going to slot ${state.slotId}.`);
  }

  // Accepted plates clear by themselves (the camera sees them go). This button
  // covers a plate someone grabbed without pressing Accept.
  function pickedUp(slotId: number) {
    const t = Date.now();
    setNow(t);
    setWorld((w) => reconcile(pickUp(w, slotId, t), t));
  }

  function setShift(staffId: number, shift: Shift) {
    const t = Date.now();
    setNow(t);
    if (shift === "break" && world.tasks[staffId] !== undefined) return;
    setWorld((w) => reconcile({ ...w, shifts: { ...w.shifts, [staffId]: shift } }, t));
    setAnnouncement(`${staffName(staffId)} ${shift === "break" ? "is on a break" : "is back"}.`);
  }

  function resetDemo() {
    setWorld(startingWorld());
    setResets((n) => n + 1);
    setAnnouncement("Demo reset.");
  }

  // ---- derived ----
  const waiting = world.slots.filter((s) => s.plateAt !== null).length;
  const freeCount = STAFF.filter((s) => isFree(world, s.id)).length;
  const lastWait = world.waits.length ? world.waits[world.waits.length - 1] : null;
  const avgWait = world.waits.length
    ? world.waits.reduce((a, b) => a + b, 0) / world.waits.length
    : null;

  return (
    <main
      className={`flex min-h-dvh flex-col bg-ground text-ink ${cameraOn ? "" : "lg:h-dvh lg:overflow-hidden"}`}
    >
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Top bar */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:max-w-[178vh]">
          <div className="min-w-0 flex-1 basis-80">
            <h1 className="text-xl font-bold leading-tight tracking-tight">ZeroBell</h1>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">
              No dish waits at the pass.{" "}
              <span className="sm:block">Picked up hot, within {LATE_S} seconds.</span>
            </p>
            <p className="mt-0.5 text-sm">
              <span className="font-semibold">A camera at the pass spots each plate.</span>{" "}
              <span className="text-muted">
                {cameraOn ? "Jev is watching the pass camera." : "Tap Place plate to simulate."}
              </span>
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
            <Metric label="Plates waiting" value={`${waiting}/${SLOT_COUNT}`} />
            <Metric label="Waiters free" value={`${freeCount}/${STAFF.length}`} />
            <Metric
              label="Last wait"
              value={lastWait === null ? "—" : secs(lastWait)}
              tone={lastWait === null ? "neutral" : lastWait < LATE_S * 1000 ? "good" : "bad"}
            />
            <Metric
              label="Avg wait"
              value={avgWait === null ? "—" : `${(avgWait / 1000).toFixed(1)}s`}
              tone={avgWait === null ? "neutral" : avgWait < LATE_S * 1000 ? "good" : "bad"}
            />
            <Metric label="Late plates" value={String(world.late)} tone={world.late ? "bad" : "neutral"} />
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={rushHour}
              disabled={waiting === SLOT_COUNT}
              className="min-h-11 rounded-full bg-wait px-5 text-sm font-bold text-ground transition-colors hover:bg-wait-hover disabled:opacity-40"
            >
              Simulate Rush Hour
            </button>
            {canUseCamera && (
              <button
                onClick={toggleCamera}
                aria-pressed={cameraOn}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold transition-colors ${
                  cameraOn
                    ? "border-greeted bg-greeted-tint text-greeted"
                    : "border-line text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                Camera mode: {cameraOn ? "on" : "off"}
              </button>
            )}
            <button
              onClick={resetDemo}
              className="min-h-11 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Reset demo
            </button>
            {phones && (
              <div ref={phoneArea} className="relative">
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
                    <p className="font-semibold">On a phone on the same Wi-Fi, scan or open:</p>
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
                          <p className="select-all font-mono text-base">{p.url}</p>
                        </div>
                      ))
                    ) : (
                      <p className="mt-1 text-muted">No network found. Connect this laptop to Wi-Fi.</p>
                    )}
                    <p className="mt-2 text-muted">
                      Pick a waiter there. The phone becomes their band: it lights up, vibrates,
                      and its Accept button works on both screens.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:min-h-0 lg:max-w-[178vh]">
        {cameraOn && <CameraPanel slotIds={SLOT_IDS} resets={resets} onSeen={cameraSees} onStatus={setCameraStatus} />}

        {/* The pass */}
        <section aria-labelledby="pass-heading" className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pl-1">
            <h2 id="pass-heading" className="text-base font-semibold">
              The pass <span className="font-normal text-muted">· 出餐口</span>
            </h2>
            <Timeline />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-4">
            {world.slots.map((s) => (
              <PassSlot
                key={s.id}
                slot={s}
                now={now}
                onPlace={() => placePlate(s.id)}
                onPickedUp={() => pickedUp(s.id)}
                cameraUnsure={
                  cameraOn &&
                  (cameraStatus[s.id]?.reading === "unsure" || cameraStatus[s.id]?.reading === "error")
                }
              />
            ))}
          </div>
        </section>

        {/* The bands */}
        <section aria-labelledby="bands-heading" className="flex flex-col gap-2">
          <h2 id="bands-heading" className="flex items-baseline justify-between gap-2 pl-1 text-base font-semibold">
            <span>
              Waiter bands{" "}
              <span className="font-normal text-muted">· no screen: a light, a buzz, one button</span>
            </span>
            <span className="text-sm font-normal text-muted">
              {freeCount} of {STAFF.length} free
            </span>
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
            {STAFF.map((s) => {
              const state = bandState(world, s.id, now);
              return (
                <div key={s.id} className="flex min-w-0 flex-col items-center gap-1">
                  <Band name={s.name} state={state} onAccept={() => accept(s.id)} />
                  <p className="w-full truncate text-center text-sm font-semibold">{s.name}</p>
                  <p className="w-full truncate text-center text-xs text-muted">{bandCaption(state)}</p>
                  <button
                    onClick={() => setShift(s.id, state.kind === "break" ? "in" : "break")}
                    disabled={state.kind === "going"}
                    aria-label={`${state.kind === "break" ? "End break" : "Take break"} (${s.name})`}
                    className="min-h-11 rounded-full px-2 text-xs text-dim underline-offset-2 hover:text-ink hover:underline disabled:invisible lg:min-h-0"
                  >
                    {state.kind === "break" ? "End break" : "Break"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type Tone = "neutral" | "good" | "bad";

const TONE: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-greeted",
  bad: "text-urgent",
};

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-mono text-xl font-bold tabular-nums ${TONE[tone]}`}>{value}</dd>
    </div>
  );
}

// The escalation rule, always on screen so the audience can follow it.
function Timeline() {
  const steps: [string, string, string][] = [
    ["0s", "1 waiter", "bg-greeted"],
    [`${NEXT_WAITER_S}s`, "+1 waiter", "bg-greeted"],
    [`${AMBER_S}s`, "all free", "bg-wait"],
    [`${RED_S}s`, "urgent", "bg-urgent"],
    [`${LATE_S}s`, "late", "bg-alert-late"],
  ];
  return (
    <ol aria-label="Escalation" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      {steps.map(([t, label, dot]) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="font-mono tabular-nums text-ink">{t}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function PassSlot({
  slot,
  now,
  onPlace,
  onPickedUp,
  cameraUnsure,
}: {
  slot: Slot;
  now: number;
  onPlace: () => void;
  onPickedUp: () => void;
  cameraUnsure: boolean;
}) {
  const unsureBadge = cameraUnsure && (
    <p className="rounded-full border border-wait px-3 py-0.5 text-sm font-bold text-wait">Camera unsure</p>
  );
  if (slot.plateAt === null) {
    return (
      <div
        aria-label={`Slot ${slot.id}, empty`}
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface p-4 text-center"
      >
        <p className="text-lg font-bold">Slot {slot.id}</p>
        <p className="text-muted">Empty</p>
        {unsureBadge}
        {slot.lastWaitMs !== null && (
          <p className="text-sm">
            Last plate picked up after{" "}
            <span className={`font-mono font-bold ${slot.lastLate ? "text-urgent" : "text-greeted"}`}>
              {secs(slot.lastWaitMs)}
            </span>
            {slot.lastLate && <span className="text-urgent"> (late)</span>}
          </p>
        )}
        <button
          onClick={onPlace}
          aria-label={`Place plate at slot ${slot.id}`}
          className="min-h-11 rounded-full border border-line bg-raised px-5 text-sm font-bold transition-colors hover:border-muted"
        >
          Place plate
        </button>
      </div>
    );
  }

  const waited = Math.max(0, now - slot.plateAt);
  const stage = stageFor(waited);
  const who =
    slot.takenBy !== null
      ? `${staffName(slot.takenBy)} on the way`
      : slot.alerted.length === 0
      ? "No waiter free"
      : slot.alerted.length <= 2
      ? `Buzzing ${names(slot.alerted)}`
      : `Buzzing all ${slot.alerted.length} free waiters`;

  return (
    <div
      aria-label={`Slot ${slot.id}, plate waiting ${Math.floor(waited / 1000)} seconds, ${who}`}
      className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 text-center transition-colors ${STAGE_TILE[stage]}`}
    >
      <p className="flex items-center gap-2 text-lg font-bold">
        <PlateIcon className={STAGE_TEXT[stage]} /> Slot {slot.id}
      </p>
      <p className={`font-mono text-4xl font-black tabular-nums ${STAGE_TEXT[stage]}`}>{mmss(waited)}</p>
      {stage === "late" && (
        <p className="rounded-full bg-alert-late px-3 py-0.5 text-sm font-bold uppercase tracking-wide text-white">
          Late
        </p>
      )}
      <p className={`text-sm ${slot.takenBy !== null ? "font-semibold text-clean" : "text-muted"}`}>{who}</p>
      {unsureBadge}
      <button
        onClick={onPickedUp}
        aria-label={`Picked up from slot ${slot.id}`}
        className="min-h-11 rounded-full bg-ink px-5 text-sm font-bold text-ground transition-colors hover:bg-white"
      >
        Picked up
      </button>
    </div>
  );
}

function PlateIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="4" />
    </svg>
  );
}

// ---- the band ---------------------------------------------------------------

export function bandCaption(state: BandState) {
  switch (state.kind) {
    case "break":
      return "On break";
    case "idle":
      return "Free";
    case "going":
      return `Going to slot ${state.slotId}`;
    case "alert":
      return `Buzzing · slot ${state.slotId}`;
  }
}

const LED: Record<string, string> = {
  off: "bg-[#24212f]",
  idle: "bg-[#2e2a3d]",
  green: "bg-greeted led-glow [--glow:var(--color-greeted)]",
  amber: "bg-wait led-glow [--glow:var(--color-wait)]",
  red: "bg-urgent led-glow [--glow:var(--color-urgent)]",
  late: "bg-urgent led-glow led-blink [--glow:var(--color-urgent)]",
  going: "bg-clean led-glow [--glow:var(--color-clean)]",
};

// A screenless band: strap, a pod with one coloured light, one button.
// size "lg" is the phone version.
export function Band({
  name,
  state,
  onAccept,
  size = "sm",
}: {
  name: string;
  state: BandState;
  onAccept: () => void;
  size?: "sm" | "lg";
}) {
  const led =
    state.kind === "break"
      ? "off"
      : state.kind === "idle"
      ? "idle"
      : state.kind === "going"
      ? "going"
      : state.stage;
  const buzzing = state.kind === "alert";
  const big = size === "lg";

  return (
    <div
      role="group"
      aria-label={`${name}'s band, ${bandCaption(state)}`}
      className={`flex flex-col items-center ${state.kind === "break" ? "opacity-50" : ""}`}
    >
      {/* strap */}
      <div className={`${big ? "h-10 w-28" : "h-3 w-9"} rounded-t-lg bg-raised`} />
      <div
        // One shake at the start of each cycle, in step with the phone's vibration.
        style={buzzing ? { animationDuration: `${BUZZ_EVERY_MS[state.stage]}ms` } : undefined}
        className={`flex flex-col items-center justify-center border-2 border-bezel bg-face ${
          big ? "h-72 w-48 gap-8 rounded-[3rem]" : "h-24 w-16 gap-2 rounded-2xl"
        } ${buzzing ? "buzz" : ""}`}
      >
        <span aria-hidden className={`${big ? "h-28 w-28" : "h-8 w-8"} rounded-full transition-colors ${LED[led]}`} />
        <button
          onClick={onAccept}
          disabled={!buzzing}
          aria-label={`Accept (${name})`}
          className={`rounded-full font-extrabold uppercase tracking-wide transition-colors active:scale-95 ${
            big ? "min-h-14 px-8 text-xl" : "min-h-7 px-2 text-[0.6rem]"
          } ${buzzing ? "bg-ink text-ground hover:bg-white" : "bg-raised text-dim"}`}
        >
          Accept
        </button>
      </div>
      <div className={`${big ? "h-10 w-28" : "h-3 w-9"} rounded-b-lg bg-raised`} />
    </div>
  );
}
