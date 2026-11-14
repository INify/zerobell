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
anything. A seat sensor detects the guest and alerts the watches of every
clocked-in staff member; the first to tap "Accept" takes the table, and the
alert clears from everyone else's watch.

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
- Simulated restaurant: 12 tables on one open floor and 11 staff with no
  zones, each with a demo name and initials avatar (one on a break and one
  clocked out at the start).
- "Guest Sat" and "Guest Left" buttons stand in for seat sensors; on-screen
  smartwatch faces stand in for real smartbands.
- A "Simulate Rush Hour" control seats 3–4 random tables at once.

## Capabilities and Constraints

- One watch per staff member, showing their avatar and name, with on-watch
  shift controls: Clock In, Take Break (End Break) and Clock Out. Staff on a
  break or clocked out get no table alerts; their watch sleeps.
- Grab-style dispatch: when a table needs a greeting or cleaning, every
  clocked-in staff member without a task gets a high-contrast card (table
  number and a large Accept). The first to Accept takes it; the card clears
  from all other watches at once, and their watch shows "Serving Table X" or
  "Cleaning Table X" with Done. They get no new alerts until Done.
  (Zones and runner escalation were dropped on 14 November 2026.)
- Silent performance tracking: every Accept logs the response time (alert
  fired → Accept, for greetings and cleaning) against that staff member. Their
  profile view shows tasks accepted and average response speed; nothing is
  shown during an alert. Stats live in the laptop demo's memory and reset with
  Reset demo.
- A phone companion (/watch) turns a phone on the same Wi-Fi into one staff
  member's watch, mirroring the laptop demo; it needs the laptop's dev server.
- Table lifecycle: Available → Needs Greeting (15-second countdown) → Dining
  (accepted) → Needs Cleaning (guest left) → Cleaning (accepted) → Available
  (Done). Done after a greeting ends that staff member's task; the table stays
  dining until the guest leaves.
- Terminology in use: Guest Sat, Guest Left, Accept, Done, Clock In, Take
  Break, Clock Out, Needs Greeting, Needs Cleaning, Serving, Cleaning, On Break,
  Clocked Out, Tables Turned.
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
4. Everyone free hears the guest: the whole floor is alerted at once and the
   first waiter to respond takes the table.
5. Built for a presenter on a projector: readable from the back of a room,
   understandable without narration.

## Accessibility & Inclusion

Projected viewing: large, high-contrast type and state cues that do not rely on
colour alone. Keyboard and screen-reader support added in the harden pass must
be kept.
