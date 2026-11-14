# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon judges watching a live, presenter-led demo on a projector. Their
reaction decides whether the design succeeded: within about a minute they must
understand what happens when a guest sits down and why it beats today's
restaurant experience. They watch; they do not operate the app themselves.

## Product Purpose

ZeroBell gets every guest in a full-service restaurant greeted within 15
seconds of sitting down, without the guest having to wave, ring a bell or press
anything. A seat sensor detects the guest and alerts waiters' smartbands; a
waiter claims the table by tapping "Attending".

Success for the demo: a judge sees a guest sit, sees the right staff alerted
instantly, sees someone claim the table, and believes the 15-second promise.

## Positioning

The guest does nothing. Detection is passive (seat sensors), so service starts
without any guest action: no waving, no call button, no bell. Every design must
make this visible; it is the claim a call-button or app-ordering product cannot
make.

## Operating Context

- Shown only on a projector by a presenter during a hackathon pitch (FeedMe ×
  Southern University College 3-Day Startup Hackathon, November 2026).
- Simulated restaurant: 12 tables in 3 zones (A: 1–4, B: 5–8, C: 9–12) and
  11 staff (3 per zone plus 2 runners; 1 on break at the start).
- "Guest Sat" and "Guest Left" buttons stand in for seat sensors; on-screen
  smartwatch faces stand in for real smartbands.
- A "Simulate Rush Hour" control seats 3–4 random tables across zones at once.

## Capabilities and Constraints

- Alert routing: the table's zone staff who are free are alerted at once;
  runners are added if nobody claims it within 8 seconds, or straight away if
  the zone has nobody free.
- Table lifecycle: Available → Needs Greeting (15-second countdown) → Dining →
  Needs Cleaning → Available.
- A waiter who attends is "Busy Serving" for 12 seconds and receives no new
  alerts in that time.
- Terminology in use: Guest Sat, Guest Left, Attending, Cleaned, Needs
  Greeting, Needs Cleaning, Busy Serving, On Break, Runner, Zone, Tables Turned.
- Web only: Next.js App Router, TypeScript, Tailwind CSS, local sample data, no
  login, no backend. Native mobile frameworks are out of scope.
- Undecided: what happens when a countdown reaches 0 (manager escalation is
  planned but not built); real sensors and multi-device sync (e.g. Supabase
  Realtime) are later work.

## Brand Commitments

- Name: ZeroBell.
- Line in use: "Every guest greeted within 15 seconds. No waving, no bells."

## Evidence on Hand

- A working local demo with sample data (`src/app/floor-demo.tsx`).
- No real restaurants, pilots, sensor hardware, customer quotes, response-time
  data or pricing exist. Do not fabricate any of them.

## Product Principles

1. The guest never has to act; show service starting on its own.
2. Cause and effect must be visible together: a guest sits, the right person's
   wrist lights up.
3. The 15-second promise is the measure; make keeping it and missing it
   equally obvious.
4. Routing is the intelligence: zone first, runners as backup.
5. Built for a presenter on a projector: readable from the back of a room,
   understandable without narration.

## Accessibility & Inclusion

Projected viewing: large, high-contrast type and state cues that do not rely on
colour alone. Keyboard and screen-reader support added in the harden pass must
be kept.
