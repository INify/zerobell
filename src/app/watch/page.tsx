import type { Metadata, Viewport } from "next";
import Companion from "./companion";

export const metadata: Metadata = {
  title: "ZeroBell Pass · Waiter band",
  description: "Phone band for the ZeroBell Pass demo: one waiter's band, live from the laptop.",
};

export const viewport: Viewport = {
  themeColor: "#15131f",
};

// /watch shows the waiter picker; /watch?w=4 shows Waiter 4's band.
export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { w } = await searchParams;
  const id = Number(Array.isArray(w) ? w[0] : w);
  return <Companion staffId={Number.isInteger(id) && id > 0 ? id : null} />;
}
