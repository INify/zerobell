import type { Metadata } from "next";
import PlanB from "./plan-b";

export const metadata: Metadata = {
  title: "ZeroBell · Plan B mockup",
  description:
    "Mockup: the ZeroBell demo as a floor plan with equal waiter tokens and one magnified wrist, stepped through in scripted beats.",
};

export default function PlanBPage() {
  return <PlanB />;
}
