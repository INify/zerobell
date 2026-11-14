// Camera mode: the laptop page sends one webcam crop per pass slot, and this
// route asks Jev (TypeSafe) one yes/no question per crop in a single call.
//
// The TypeSafe key is read here, on the server, and never sent to the browser.
// The route only answers requests made to this laptop (localhost or the local
// network), so it is not an open proxy for the key.

import { randomUUID } from "node:crypto";
import {
  JEV_MODEL,
  PASS_CONTEXT,
  PLATE_CRITERIA,
  PLATE_QUESTION,
  type JevCheckRequest,
  type JevCheckResponse,
} from "../../camera-rules";
import { isLocalHost } from "../../sync";

export const dynamic = "force-dynamic";

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_CROPS = 4;
const MAX_CROP_BASE64 = 4_000_000; // about 3 MB of JPEG per crop

function fail(status: number, error: string) {
  return Response.json({ ok: false, error } satisfies JevCheckResponse, { status });
}

export async function POST(request: Request) {
  const host = new URL(request.url).hostname;
  if (!isLocalHost(host)) return fail(403, "Camera mode only runs on the laptop.");

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return fail(500, "TYPESAFE_API_KEY is not set in .env.local.");

  let body: JevCheckRequest;
  try {
    body = (await request.json()) as JevCheckRequest;
  } catch {
    return fail(400, "Bad request.");
  }
  const crops = Array.isArray(body?.crops) ? body.crops : [];
  if (crops.length === 0 || crops.length > MAX_CROPS) return fail(400, "Send 1 to 4 crops.");
  for (const c of crops) {
    if (
      !Number.isInteger(c?.slotId) ||
      typeof c.jpegBase64 !== "string" ||
      c.jpegBase64.length === 0 ||
      c.jpegBase64.length > MAX_CROP_BASE64 ||
      !/^[A-Za-z0-9+/]+=*$/.test(c.jpegBase64)
    ) {
      return fail(400, "Bad crop.");
    }
  }

  // One question per slot, each carrying only its own crop.
  const assets: Record<string, { type: "image"; format: "jpg"; data_base64: string }> = {};
  const questions: Record<string, { type: "noul"; instructions: string; criteria: typeof PLATE_CRITERIA }> = {};
  for (const c of crops) {
    const ref = `slot${c.slotId}-${randomUUID().slice(0, 8)}`;
    assets[ref] = { type: "image", format: "jpg", data_base64: c.jpegBase64 };
    questions[`slot_${c.slotId}_has_plate`] = {
      type: "noul",
      instructions: PLATE_QUESTION.replace("{photo}", ref),
      criteria: PLATE_CRITERIA,
    };
  }
  const payload = { model: JEV_MODEL, state: { pass: PASS_CONTEXT }, assets, questions };

  let res: Response;
  try {
    res = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "TypeSafe-Danger-Zone-Images": "true",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return fail(502, timedOut ? "Jev took too long to answer." : "Could not reach Jev.");
  }

  if (!res.ok) {
    // Log the error detail (never the key) so a failed call can be debugged.
    const detail = await res.text().catch(() => "");
    console.error(`[jev] ${res.status}`, detail.slice(0, 500), {
      model: payload.model,
      questions: payload.questions,
    });
    return fail(502, `Jev returned ${res.status}.`);
  }

  const data = (await res.json().catch(() => null)) as {
    answers?: Record<string, { noul?: number }>;
    usage?: { input_tokens?: number };
  } | null;

  const answers: Record<number, number | null> = {};
  for (const c of crops) {
    const p = data?.answers?.[`slot_${c.slotId}_has_plate`]?.noul;
    answers[c.slotId] = typeof p === "number" ? p : null;
  }
  return Response.json({
    ok: true,
    answers,
    inputTokens: data?.usage?.input_tokens ?? 0,
    questions: crops.length,
  } satisfies JevCheckResponse);
}
