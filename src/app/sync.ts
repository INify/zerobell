// Shared by the laptop demo and the phone companion: the messages that go
// through /api/sync, and when sync is allowed to run at all.

export type SyncAction =
  | { kind: "accept"; staffId: number; tableId: number }
  | { kind: "done"; staffId: number }
  | { kind: "shift"; staffId: number; shift: "in" | "break" | "out" };

// Sync runs only when the page is served from this machine or the local
// network (a phone on the same Wi-Fi). On the hosted site there is no shared
// dev server to talk to, so the pages stay standalone.
export function isLocalHost(hostname: string) {
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function postSync(message: unknown) {
  return fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    keepalive: true,
  }).catch(() => {
    // Sync is a bonus for the demo; the laptop page keeps working without it.
  });
}
