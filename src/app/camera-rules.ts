// Camera mode: everything about how Jev (TypeSafe) is asked about the pass,
// and how its answers turn into "plate here" / "plate gone", in one place so
// it is easy to read and change.
//
// No secrets live here. The TypeSafe key is only read in
// src/app/api/detect/route.ts, on the server.

export const JEV_MODEL = "jev-1.14.0";

// Shared context sent once with every check.
export const PASS_CONTEXT =
  "Each image is one slot at a restaurant kitchen pass, photographed from above by a webcam. " +
  "Cooks put finished dishes on the slot and waiters take them to tables.";

// One yes/no question per slot. `{photo}` is replaced with that slot's crop.
export const PLATE_QUESTION = "Is there a plate or dish of food in this image: {photo}?";
export const PLATE_CRITERIA = {
  true: "A plate, bowl or dish of food is sitting on the slot.",
  false: "The slot is an empty counter or tray with no plate or dish on it.",
};

// How a Noul answer (the chance of "yes") is read.
export const PLATE_ABOVE = 0.7; // above this: plate
export const EMPTY_BELOW = 0.3; // below this: no plate; in between: unsure

export const CHECK_EVERY_MS = 3000;
export const CHECKS_TO_AGREE = 2; // a passing hand should not count

// Crops are resized for Jev: every side must be at least 280 px.
export const CROP_MIN_SIDE = 320;
export const CROP_MAX_SIDE = 1024;

export type Reading = "plate" | "empty" | "unsure";

export function readingFor(p: number | null | undefined): Reading {
  if (typeof p !== "number" || Number.isNaN(p)) return "unsure";
  return p > PLATE_ABOVE ? "plate" : p < EMPTY_BELOW ? "empty" : "unsure";
}

// Per-slot memory of recent readings. A slot's confirmed state only changes
// after CHECKS_TO_AGREE readings in a row agree; "unsure" breaks the run.
export type Track = {
  run: "plate" | "empty" | null; // the reading repeated in the current run
  count: number;
  firstAt: number; // when the current run's first frame was captured
  confirmed: "plate" | "empty" | null; // null until the camera has decided once
};

export const NEW_TRACK: Track = { run: null, count: 0, firstAt: 0, confirmed: null };

// The truth table. Returns the new track, and a change for the pass when the
// confirmed state flips. `at` is when the change really happened (the first
// frame of the run), so waits are not inflated by the confirmation delay.
// A slot that turns out empty the first time the camera looks is not a
// change: nothing was ever there.
export function stepTrack(
  t: Track,
  r: Reading,
  capturedAt: number
): { track: Track; change: { seen: "plate" | "empty"; at: number } | null } {
  if (r === "unsure") return { track: { ...t, run: null, count: 0 }, change: null };
  const sameRun = t.run === r;
  const track: Track = {
    ...t,
    run: r,
    count: sameRun ? t.count + 1 : 1,
    firstAt: sameRun ? t.firstAt : capturedAt,
  };
  if (track.count < CHECKS_TO_AGREE || track.confirmed === r) return { track, change: null };
  const before = track.confirmed;
  track.confirmed = r;
  if (before === null && r === "empty") return { track, change: null };
  return { track, change: { seen: r, at: track.firstAt } };
}

// What the browser sends to /api/detect and gets back.
export type JevCheckRequest = { crops: { slotId: number; jpegBase64: string }[] };
export type JevCheckResponse =
  | { ok: true; answers: Record<number, number | null>; inputTokens: number; questions: number }
  | { ok: false; error: string };
