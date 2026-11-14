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

// ---------------------------------------------------------------------------
// Change-gating: only ask Jev about a slot when its picture has changed.
// The laptop compares a tiny grey thumbnail of each slot with the one Jev last
// judged. That costs nothing; asking Jev costs money.
// ---------------------------------------------------------------------------

export const THUMB_SIZE = 24; // thumbnails are 24 x 24 grey pixels
// Average difference per pixel (0-255) that counts as "changed". In tests,
// camera noise, exposure shifts and blocky compression scored 2-4, and a plate
// arriving scored 11-20. Tune on real CCTV footage at the first pilot.
export const CHANGE_THRESHOLD = 6;
// Even when nothing seems to change, ask again this often as a safety check.
// Every 5 minutes: once a minute alone was about 5% of all checks, half the
// AI budget, while a real change is caught by the change test anyway.
export const RECHECK_EVERY_MS = 5 * 60_000;

// How different two thumbnails are, ignoring an overall brightness shift (a
// camera adjusting its exposure should not count as a change).
export function imageDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let diff = 0;
  for (let i = 0; i < n; i++) diff += Math.abs(a[i] - meanA - (b[i] - meanB));
  return diff / n;
}

// Should this slot be sent to Jev on this check?
export function needsCheck(opts: {
  track: Track;
  difference: number; // vs the thumbnail Jev last judged (Infinity if none)
  lastAskedAt: number; // 0 if never
  now: number;
}): boolean {
  const { track, difference, lastAskedAt, now } = opts;
  if (difference >= CHANGE_THRESHOLD) return true; // something changed (or never asked)
  if (track.run !== null && track.run !== track.confirmed) return true; // waiting for the 2nd agreeing check
  return now - lastAskedAt >= RECHECK_EVERY_MS; // safety re-check
}

// ---------------------------------------------------------------------------
// Opening hours: the camera only checks while the restaurant is open.
// ---------------------------------------------------------------------------

export type DayHours = { closed: boolean; open: string; close: string }; // "HH:MM", 24-hour
export type WeekHours = DayHours[]; // index 0 = Sunday, as in Date.getDay()

// Default: open every day 10:00-22:00 (12 hours a day, 84 a week).
export const DEFAULT_HOURS: WeekHours = Array.from({ length: 7 }, () => ({
  closed: false,
  open: "10:00",
  close: "22:00",
}));

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Length of a day's opening, in minutes. A closing time at or before the
// opening time runs past midnight; the same time means open all day.
function span(d: DayHours): number {
  if (d.closed) return 0;
  const o = minutes(d.open);
  const c = minutes(d.close);
  return c > o ? c - o : c + 1440 - o;
}

export function isOpenAt(week: WeekHours, date: Date): boolean {
  const day = date.getDay();
  const t = date.getHours() * 60 + date.getMinutes();
  const today = week[day];
  if (today && !today.closed && t >= minutes(today.open) && t < minutes(today.open) + span(today)) return true;
  // Yesterday's opening that runs past midnight.
  const y = week[(day + 6) % 7];
  return !!y && !y.closed && t < minutes(y.open) + span(y) - 1440;
}

export function weeklyHours(week: WeekHours): number {
  return week.reduce((sum, d) => sum + span(d), 0) / 60;
}

// What the browser sends to /api/detect and gets back.
export type JevCheckRequest = { crops: { slotId: number; jpegBase64: string }[] };
export type JevCheckResponse =
  | { ok: true; answers: Record<number, number | null>; inputTokens: number; questions: number }
  | { ok: false; error: string };
