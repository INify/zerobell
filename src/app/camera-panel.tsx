"use client";

// Camera mode: a live webcam preview where the 4 pass slots are marked, and a
// loop that crops each slot every few seconds and asks Jev (through our own
// /api/jev route) whether a plate is there.

import { useEffect, useRef, useState } from "react";
import {
  CHECK_EVERY_MS,
  CROP_MAX_SIDE,
  CROP_MIN_SIDE,
  NEW_TRACK,
  readingFor,
  stepTrack,
  type JevCheckResponse,
  type Reading,
  type Track,
} from "./camera-rules";

export type Box = { x: number; y: number; w: number; h: number }; // 0..1 of the frame
export type SlotCamera = { reading: Reading | "error"; p: number | null };

const BOXES_KEY = "zerobell.camera.boxes";
const DEVICE_KEY = "zerobell.camera.device";

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

  // Latest values for the check loop, which outlives renders.
  const live = useRef({ boxes, onSeen, onStatus });
  useEffect(() => {
    live.current = { boxes, onSeen, onStatus };
  });
  const tracks = useRef<Record<number, Track>>({});
  useEffect(() => {
    tracks.current = {};
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

    async function check() {
      const video = videoRef.current;
      const { boxes } = live.current;
      const marked = slotIds.filter((id) => boxes[id]);
      if (!video || video.videoWidth === 0 || marked.length === 0) return;

      const capturedAt = Date.now();
      const crops = marked.map((slotId) => ({ slotId, jpegBase64: cropJpeg(video, boxes[slotId]) }));
      let result: JevCheckResponse;
      try {
        const res = await fetch("/api/jev", {
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

      const next: Record<number, SlotCamera> = {};
      for (const slotId of marked) {
        const p = result.ok ? result.answers[slotId] ?? null : null;
        // A failed call is "unsure", never "no plate".
        const reading: Reading = result.ok ? readingFor(p) : "unsure";
        next[slotId] = { reading: result.ok ? reading : "error", p };
        const { track, change } = stepTrack(tracks.current[slotId] ?? NEW_TRACK, reading, capturedAt);
        tracks.current[slotId] = track;
        if (change) live.current.onSeen(slotId, change.seen, change.at);
      }
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
    tracks.current[marking] = NEW_TRACK; // a new area starts fresh
    const unmarked = slotIds.find((id) => !next[id]);
    if (unmarked !== undefined) setMarking(unmarked);
  }
  function clearBoxes() {
    setBoxes({});
    save(BOXES_KEY, {});
    tracks.current = {};
    setStatus({});
    onStatus({});
    setMarking(slotIds[0]);
  }

  const markedCount = slotIds.filter((id) => boxes[id]).length;

  return (
    <section aria-labelledby="camera-heading" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="camera-heading" className="text-base font-semibold">
          Camera mode <span className="font-normal text-muted">· Jev checks each slot every {CHECK_EVERY_MS / 1000}s</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Camera</span>
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              save(DEVICE_KEY, e.target.value);
              tracks.current = {};
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
            {markedCount === 0 && <p className="mt-2 text-wait">No slots marked yet, so Jev is not being called.</p>}
          </div>

          {lastError && <p className="text-urgent">Last call failed: {lastError} Slots show Camera unsure.</p>}
        </div>
      </div>
    </section>
  );
}
