"use client";

// Phone band: one waiter's band, mirrored live from the laptop demo over the
// local network. The laptop runs the simulation; this page listens for its
// snapshots, works out this waiter's light with the same rules, vibrates, and
// sends Accept / break taps back.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BUZZ_EVERY_MS,
  Band,
  STAFF,
  bandCaption,
  bandState,
  initials,
  type Stage,
  type Staff,
  type World,
} from "../pass-demo";
import { isLocalHost, postSync, type SyncAction } from "../sync";

type Snapshot = { world: World; sentAt: number };

// How often the band vibrates while a plate is waiting, and the pulse pattern
// (vibrate ms, pause ms, ...). Keep `every` in step with BUZZ_EVERY_MS.
const VIBRATION: Record<Stage, { every: number; pattern: number[] }> = {
  green: { every: BUZZ_EVERY_MS.green, pattern: [250, 120, 250] },
  amber: { every: BUZZ_EVERY_MS.amber, pattern: [350, 120, 350] },
  red: { every: BUZZ_EVERY_MS.red, pattern: [400, 100, 400, 100, 400] },
  late: { every: BUZZ_EVERY_MS.late, pattern: [400, 100, 400, 100, 400] },
};
type Status = "connecting" | "live" | "offline" | "hosted";

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
      if (!s.world) return; // an older demo's snapshot
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
  return staff ? <PhoneBand staff={staff} {...laptop} /> : <Picker snap={laptop.snap} />;
}

// ---- pick who this phone is -------------------------------------------------

function Picker({ snap }: { snap: Snapshot | null }) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-ground px-4 py-6 text-ink">
      <header>
        <p className="text-sm font-semibold text-muted">ZeroBell Pass band</p>
        <h1 className="text-2xl font-bold tracking-tight">Who is wearing this band?</h1>
        <p className="mt-1 text-base text-muted">
          When a plate waits at the pass, one free waiter&apos;s band lights up and buzzes. Press
          Accept to take it.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {STAFF.map((s) => {
          const onBreak = snap?.world.shifts[s.id] === "break";
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
                {snap && (
                  <span className="block text-sm text-muted">{onBreak ? "On break" : "On shift"}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

// ---- the band -----------------------------------------------------------------

function PhoneBand({
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

  const state = snap ? bandState(snap.world, staff.id, now) : ({ kind: "idle" } as const);

  // Vibrate as soon as a plate starts buzzing this band, then again every few
  // seconds until the waiter presses Accept. The longer the plate waits, the
  // closer together and stronger the pulses. Stops on Accept, pickup or break.
  // (Android; iPhone browsers block vibration.)
  const stage = state.kind === "alert" ? state.stage : null;
  const slotId = state.kind === "alert" ? state.slotId : null;
  useEffect(() => {
    if (stage === null) return;
    const { every, pattern } = VIBRATION[stage];
    navigator.vibrate?.(pattern);
    const id = setInterval(() => navigator.vibrate?.(pattern), every);
    return () => {
      clearInterval(id);
      navigator.vibrate?.(0);
    };
  }, [stage, slotId]);

  const send = (action: SyncAction) => postSync({ type: "action", action });

  const statusLine: Record<Status, { dot: string; text: string }> = {
    connecting: { dot: "bg-dim", text: "Connecting to the laptop…" },
    live: snap
      ? { dot: "bg-greeted", text: "Live from the laptop" }
      : { dot: "bg-wait", text: "Connected. Open the demo on the laptop." },
    offline: { dot: "bg-urgent", text: "Can't reach the laptop. Same Wi-Fi?" },
    hosted: { dot: "bg-dim", text: "Phone mode works when the demo runs on a laptop on this Wi-Fi." },
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

      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
        <Band
          name={staff.name}
          state={state}
          size="lg"
          onAccept={() => send({ kind: "accept", staffId: staff.id })}
        />
        <p className="text-lg font-bold">{staff.name}</p>
        <p className="text-muted">{bandCaption(state)}</p>
        {state.kind !== "going" && (
          <button
            onClick={() =>
              send({ kind: "shift", staffId: staff.id, shift: state.kind === "break" ? "in" : "break" })
            }
            className="min-h-11 rounded-full border border-line px-5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            {state.kind === "break" ? "End break" : "Take break"}
          </button>
        )}
      </div>
    </main>
  );
}
