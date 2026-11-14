"use client";

// Camera mode: a live webcam preview where the 4 pass slots are marked, and a
// loop that crops each slot every few seconds and asks Jev (through our own
// /api/detect route) whether a plate is there. Slots whose picture has not
// changed are skipped, and nothing is checked outside opening hours.

import { useEffect, useRef, useState } from "react";
import {
  CHECK_EVERY_MS,
  CROP_MAX_SIDE,
  CROP_MIN_SIDE,
  DEFAULT_HOURS,
  NEW_TRACK,
  THUMB_SIZE,
  imageDifference,
  isOpenAt,
  needsCheck,
  readingFor,
  stepTrack,
  weeklyHours,
  type DayHours,
  type JevCheckResponse,
  type Reading,
  type Track,
  type WeekHours,
} from "./camera-rules";

export type Box = { x: number; y: number; w: number; h: number }; // 0..1 of the frame
export type SlotCamera = { reading: Reading | "error"; p: number | null };

const BOXES_KEY = "zerobell.camera.boxes";
const DEVICE_KEY = "zerobell.camera.device";
const HOURS_KEY = "zerobell.camera.hours";
const USE_HOURS_KEY = "zerobell.camera.useHours";

// Shown Monday first; stored Sunday first (Date.getDay()).
const DAYS = [
  { i: 1, name: "Mon" },
  { i: 2, name: "Tue" },
  { i: 3, name: "Wed" },
  { i: 4, name: "Thu" },
  { i: 5, name: "Fri" },
  { i: 6, name: "Sat" },
  { i: 0, name: "Sun" },
];

function hoursSummary(week: WeekHours) {
  const first = week[0];
  const same = week.every((d) => d.closed === first.closed && d.open === first.open && d.close === first.close);
  const total = weeklyHours(week);
  const h = `${Number.isInteger(total) ? total : total.toFixed(1)} hours a week`;
  if (same && !first.closed) return `Every day ${first.open}–${first.close} · ${h}`;
  return `Custom hours · ${h}`;
}

const BOX_COLOURS = ["#38d39f", "#6aa8ff", "#ffb000", "#ff7ad9"];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering boxes is a convenience; the demo works without it.
  }
}

// Cut one slot out of the current frame, sized for Jev (each side at least
// 280 px): scale small crops up, large ones down, and pad thin ones.
function cropJpeg(video: HTMLVideoElement, box: Box): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = Math.round(box.x * vw);
  const sy = Math.round(box.y * vh);
  const sw = Math.max(1, Math.round(box.w * vw));
  const sh = Math.max(1, Math.round(box.h * vh));
  let scale = CROP_MIN_SIDE / Math.min(sw, sh);
  if (Math.max(sw, sh) * scale > CROP_MAX_SIDE) scale = CROP_MAX_SIDE / Math.max(sw, sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(dw, CROP_MIN_SIDE);
  canvas.height = Math.max(dh, CROP_MIN_SIDE);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, sx, sy, sw, sh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

// A tiny grey copy of one slot, for the free "has anything changed?" test.
function thumbnail(video: HTMLVideoElement, box: Box): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(
    video,
    box.x * video.videoWidth,
    box.y * video.videoHeight,
    Math.max(1, box.w * video.videoWidth),
    Math.max(1, box.h * video.videoHeight),
    0,
    0,
    THUMB_SIZE,
    THUMB_SIZE
  );
  const rgba = ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE).data;
  const grey = new Uint8Array(THUMB_SIZE * THUMB_SIZE);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return grey;
}

export default function CameraPanel({
  slotIds,
  resets,
  onSeen,
  onStatus,
}: {
  slotIds: number[];
  resets: number; // bumps when the demo is reset: forget what the camera saw
  // The camera confirmed a plate arrived or left `slotId` at time `at`.
  onSeen: (slotId: number, seen: "plate" | "empty", at: number) => void;
  onStatus: (status: Record<number, SlotCamera>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => load(DEVICE_KEY, ""));
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [boxes, setBoxes] = useState<Record<number, Box>>(() => load(BOXES_KEY, {}));
  const [marking, setMarking] = useState<number>(slotIds[0]);
  const [draft, setDraft] = useState<Box | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<number, SlotCamera>>({});
  const statusRef = useRef<Record<number, SlotCamera>>({});

  const [hours, setHours] = useState<WeekHours>(() => load(HOURS_KEY, DEFAULT_HOURS));
  const [useHours, setUseHours] = useState<boolean>(() => load(USE_HOURS_KEY, true));
  const [editingHours, setEditingHours] = useState(false);
  // A clock for the "Open now / Closed now" line, so it is right even when
  // the camera is not running.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const first = setTimeout(tick);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const closed = clock !== 0 && useHours && !isOpenAt(hours, new Date(clock));

  // Latest values for the check loop, which outlives renders.
  const live = useRef({ boxes, onSeen, onStatus, hours, useHours });
  useEffect(() => {
    live.current = { boxes, onSeen, onStatus, hours, useHours };
  });
  const tracks = useRef<Record<number, Track>>({});
  // Per slot: the thumbnail Jev last judged, and when.
  const judged = useRef<Record<number, { thumb: Uint8Array; at: number }>>({});
  const forget = (slotId?: number) => {
    if (slotId === undefined) {
      tracks.current = {};
      judged.current = {};
    } else {
      tracks.current[slotId] = NEW_TRACK;
      delete judged.current[slotId];
    }
  };
  useEffect(() => {
    tracks.current = {};
    judged.current = {};
  }, [resets]);

  // ---- the camera ----
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const open = (id: string) =>
      navigator.mediaDevices.getUserMedia({
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    open(deviceId)
      .catch((e) => {
        // A remembered camera that is no longer plugged in: use the default.
        if (deviceId && e instanceof Error && e.name === "OverconstrainedError") return open("");
        throw e;
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setCamError(null);
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => {});
        }
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === "videoinput"));
      })
      .catch((e) => {
        if (cancelled) return;
        setCamError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera blocked. Allow camera access for this page in the browser."
            : "Could not open the camera."
        );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [deviceId]);

  // ---- the check loop: one Jev call for all marked slots ----
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    let wasClosed = false;

    async function check() {
      const video = videoRef.current;
      const { boxes, hours, useHours } = live.current;

      // Outside opening hours: no checks at all.
      const isClosed = useHours && !isOpenAt(hours, new Date());
      if (isClosed) {
        if (!wasClosed) {
          judged.current = {}; // look afresh when the restaurant opens
          statusRef.current = {};
          setStatus({});
          live.current.onStatus({});
        }
        wasClosed = true;
        return;
      }
      wasClosed = false;

      const marked = slotIds.filter((id) => boxes[id]);
      if (!video || video.videoWidth === 0 || marked.length === 0) return;

      // Free test first: which slots changed since Jev last judged them?
      const capturedAt = Date.now();
      const thumbs: Record<number, Uint8Array> = {};
      const toAsk = marked.filter((slotId) => {
        thumbs[slotId] = thumbnail(video, boxes[slotId]);
        const last = judged.current[slotId];
        return needsCheck({
          track: tracks.current[slotId] ?? NEW_TRACK,
          difference: last ? imageDifference(thumbs[slotId], last.thumb) : Infinity,
          lastAskedAt: last?.at ?? 0,
          now: capturedAt,
        });
      });
      if (toAsk.length === 0) return; // nothing changed: no call, no cost

      const crops = toAsk.map((slotId) => ({ slotId, jpegBase64: cropJpeg(video, boxes[slotId]) }));
      let result: JevCheckResponse;
      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crops }),
        });
        result = (await res.json()) as JevCheckResponse;
      } catch {
        result = { ok: false, error: "Could not reach the laptop's server." };
      }
      if (stopped) return;

      setLastError(result.ok ? null : result.error);

      const updates: Record<number, SlotCamera> = {};
      for (const slotId of toAsk) {
        const p = result.ok ? result.answers[slotId] ?? null : null;
        // A failed call is "unsure", never "no plate".
        const reading: Reading = result.ok ? readingFor(p) : "unsure";
        updates[slotId] = { reading: result.ok ? reading : "error", p };
        // Remember what Jev judged; after a failure, ask again next check.
        if (result.ok) judged.current[slotId] = { thumb: thumbs[slotId], at: capturedAt };
        else delete judged.current[slotId];
        const { track, change } = stepTrack(tracks.current[slotId] ?? NEW_TRACK, reading, capturedAt);
        tracks.current[slotId] = track;
        if (change) live.current.onSeen(slotId, change.seen, change.at);
      }
      // Skipped slots keep their last answer.
      const prev = statusRef.current;
      const next: Record<number, SlotCamera> = {};
      for (const id of marked) if (updates[id] ?? prev[id]) next[id] = updates[id] ?? prev[id];
      statusRef.current = next;
      setStatus(next);
      live.current.onStatus(next);
    }

    async function loop() {
      const started = Date.now();
      await check();
      if (stopped) return;
      timer = setTimeout(loop, Math.max(250, CHECK_EVERY_MS - (Date.now() - started)));
    }
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ready, slotIds]);

  // ---- marking slots by dragging on the preview ----
  function point(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }
  function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Box {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = point(e);
    setDraft(null);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current) setDraft(boxFrom(dragStart.current, point(e)));
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setDraft(null);
    if (!start) return;
    const box = boxFrom(start, point(e));
    if (box.w < 0.03 || box.h < 0.03) return; // a click, not a drag
    const next = { ...boxes, [marking]: box };
    setBoxes(next);
    save(BOXES_KEY, next);
    forget(marking); // a new area starts fresh
    const unmarked = slotIds.find((id) => !next[id]);
    if (unmarked !== undefined) setMarking(unmarked);
  }
  function clearBoxes() {
    setBoxes({});
    save(BOXES_KEY, {});
    forget();
    statusRef.current = {};
    setStatus({});
    onStatus({});
    setMarking(slotIds[0]);
  }

  const markedCount = slotIds.filter((id) => boxes[id]).length;

  function setDay(i: number, patch: Partial<DayHours>) {
    const next = hours.map((d, j) => (j === i ? { ...d, ...patch } : d));
    setHours(next);
    save(HOURS_KEY, next);
  }

  return (
    <section aria-labelledby="camera-heading" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="camera-heading" className="text-base font-semibold">
          Camera mode <span className="font-normal text-muted">· checks each slot every {CHECK_EVERY_MS / 1000}s</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Camera</span>
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              save(DEVICE_KEY, e.target.value);
              forget();
            }}
            className="min-h-11 max-w-64 rounded-lg border border-line bg-raised px-3 text-sm"
          >
            <option value="">Default camera</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="relative w-full max-w-[640px] overflow-hidden rounded-xl bg-face">
          <video
            ref={videoRef}
            muted
            playsInline
            onLoadedData={() => setReady(true)}
            aria-label="Live camera at the pass"
            className="block h-auto w-full"
          />
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              dragStart.current = null;
              setDraft(null);
            }}
            className="absolute inset-0 cursor-crosshair touch-none"
            aria-label={`Drag to mark slot ${marking}`}
          >
            {slotIds.map((id, i) => {
              const b = boxes[id];
              if (!b) return null;
              const s = status[id];
              return (
                <div
                  key={id}
                  className="absolute border-[3px]"
                  style={{
                    left: `${b.x * 100}%`,
                    top: `${b.y * 100}%`,
                    width: `${b.w * 100}%`,
                    height: `${b.h * 100}%`,
                    borderColor: BOX_COLOURS[i % BOX_COLOURS.length],
                  }}
                >
                  <span
                    className="absolute left-0 top-0 px-1.5 py-0.5 font-mono text-xs font-bold text-black"
                    style={{ background: BOX_COLOURS[i % BOX_COLOURS.length] }}
                  >
                    {id}
                    {s ? ` · ${s.reading === "error" ? "error" : s.p === null ? "?" : `${Math.round(s.p * 100)}%`}` : ""}
                  </span>
                </div>
              );
            })}
            {draft && (
              <div
                className="absolute border-[3px] border-dashed border-ink"
                style={{
                  left: `${draft.x * 100}%`,
                  top: `${draft.y * 100}%`,
                  width: `${draft.w * 100}%`,
                  height: `${draft.h * 100}%`,
                }}
              />
            )}
          </div>
          {camError && (
            <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-urgent">{camError}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
          <div>
            <p className="font-semibold">Mark the slots</p>
            <p className="text-muted">Pick a slot, then drag a box around it on the camera image.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {slotIds.map((id, i) => (
                <button
                  key={id}
                  onClick={() => setMarking(id)}
                  aria-pressed={marking === id}
                  className={`min-h-11 rounded-full border-2 px-4 font-bold ${
                    marking === id ? "bg-raised text-ink" : "text-muted"
                  }`}
                  style={{ borderColor: BOX_COLOURS[i % BOX_COLOURS.length] }}
                >
                  Slot {id}
                  {boxes[id] ? " ✓" : ""}
                </button>
              ))}
              <button
                onClick={clearBoxes}
                className="min-h-11 rounded-full border border-line px-4 text-muted hover:bg-raised hover:text-ink"
              >
                Clear boxes
              </button>
            </div>
            {markedCount === 0 && <p className="mt-2 text-wait">No slots marked yet, so no slots are being checked.</p>}
          </div>

          <div>
            <p className="font-semibold">Opening hours</p>
            <p className="text-muted">
              {useHours ? hoursSummary(hours) : "Ignoring opening hours: checking all the time."}
            </p>
            {clock !== 0 && (
              <p className={`mt-1 font-semibold ${closed ? "text-wait" : "text-greeted"}`} role="status">
                {closed ? "Closed now: camera paused" : "Open now: checking"}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEditingHours((e) => !e)}
                aria-expanded={editingHours}
                aria-controls="hours-editor"
                className="min-h-11 rounded-full border border-line px-4 text-muted hover:bg-raised hover:text-ink"
              >
                {editingHours ? "Done" : "Edit hours"}
              </button>
              <label className="flex min-h-11 items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={useHours}
                  onChange={(e) => {
                    setUseHours(e.target.checked);
                    save(USE_HOURS_KEY, e.target.checked);
                  }}
                  className="h-4 w-4"
                />
                Pause outside opening hours
              </label>
            </div>
            {editingHours && (
              <div id="hours-editor" className="mt-2 flex flex-col gap-1">
                {DAYS.map(({ i, name }) => {
                  const d = hours[i];
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <label className="flex w-20 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!d.closed}
                          onChange={(e) => setDay(i, { closed: !e.target.checked })}
                          aria-label={`Open on ${name}`}
                          className="h-4 w-4"
                        />
                        {name}
                      </label>
                      {d.closed ? (
                        <span className="text-muted">Closed</span>
                      ) : (
                        <>
                          <input
                            type="time"
                            value={d.open}
                            onChange={(e) => e.target.value && setDay(i, { open: e.target.value })}
                            aria-label={`${name} opens`}
                            className="min-h-9 rounded-lg border border-line bg-raised px-2"
                          />
                          <span className="text-muted">to</span>
                          <input
                            type="time"
                            value={d.close}
                            onChange={(e) => e.target.value && setDay(i, { close: e.target.value })}
                            aria-label={`${name} closes`}
                            className="min-h-9 rounded-lg border border-line bg-raised px-2"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    setHours(DEFAULT_HOURS);
                    save(HOURS_KEY, DEFAULT_HOURS);
                  }}
                  className="mt-1 min-h-11 self-start rounded-full border border-line px-4 text-muted hover:bg-raised hover:text-ink"
                >
                  Reset to every day 10:00–22:00
                </button>
              </div>
            )}
          </div>

          {lastError && <p className="text-urgent">Last call failed: {lastError} Slots show Camera unsure.</p>}
        </div>
      </div>
    </section>
  );
}
