// Local sync between the laptop demo and the phone companion (/watch).
//
// The laptop page runs the simulation and POSTs a snapshot whenever the pass or
// staff change. Phones open GET as a Server-Sent Events stream and receive
// every snapshot; when a phone band taps Accept it POSTs an action,
// which is streamed back to the laptop page to apply.
//
// State lives in this dev server's memory, so this is for a laptop and a
// phone on the same Wi-Fi. It is not meant for the hosted (Vercel) build: the
// pages only turn sync on when they are served from localhost or a private
// network address.

import os from "node:os";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

type Send = (event: string, data: unknown) => void;
type Store = { snapshot: unknown; listeners: Set<Send> };

// Kept on globalThis so a hot reload of this file does not drop listeners.
const g = globalThis as typeof globalThis & { __zerobellSync?: Store };
const store: Store = (g.__zerobellSync ??= { snapshot: null, listeners: new Set() });

function broadcast(event: string, data: unknown) {
  for (const send of store.listeners) send(event, data);
}

// The addresses a phone on the same network can use to reach this server.
function lanUrls(port: string) {
  const urls: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      // 169.254.x.x is a self-assigned address on a direct cable link (such as
      // an iPhone plugged in for the camera); phones on Wi-Fi cannot reach it.
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254."))
        urls.push(`http://${net.address}:${port}/watch`);
    }
  }
  return urls;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("info")) {
    // Each address comes with a QR code, so a phone can scan it instead of
    // typing it. Dark on white with a quiet zone, which phone cameras read
    // most reliably.
    const phones = await Promise.all(
      lanUrls(url.port || "80").map(async (u) => ({
        url: u,
        qr: await QRCode.toString(u, {
          type: "svg",
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#15131f", light: "#ffffff" },
        }),
      }))
    );
    return Response.json({ phones });
  }

  const encoder = new TextEncoder();
  let send: Send | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (send) store.listeners.delete(send);
    if (ping) clearInterval(ping);
    send = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      send = (event, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          stop(); // the client has gone
        }
      };
      store.listeners.add(send);
      if (store.snapshot) send("snapshot", store.snapshot);
      // A comment line every 15s keeps phones and proxies from closing an
      // idle connection.
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          stop();
        }
      }, 15000);
      request.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Taps a phone band can send: Accept, or go on / come back from a break.
// Anything else is rejected.
function isAction(a: unknown) {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  if (!Number.isInteger(x.staffId)) return false;
  if (x.kind === "accept") return true;
  if (x.kind === "shift") return x.shift === "in" || x.shift === "break";
  return false;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  const msg = body as { type?: string; snapshot?: unknown; action?: unknown };

  if (msg.type === "snapshot" && msg.snapshot && typeof msg.snapshot === "object") {
    store.snapshot = msg.snapshot;
    broadcast("snapshot", msg.snapshot);
    return Response.json({ ok: true, listeners: store.listeners.size });
  }
  if (msg.type === "action" && isAction(msg.action)) {
    broadcast("action", msg.action);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown message" }, { status: 400 });
}
