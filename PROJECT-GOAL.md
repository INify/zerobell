# Project goal

## Goal
No dish waits at the pass (出餐口) for long. As soon as food is put out, one
free waiter is alerted on a cheap, screenless wristband (colour light,
vibration, one Accept button) and picks it up, so the food reaches the table
hot, ideally within 60 seconds.

The product only watches the pass and alerts waiters. It does not take orders,
handle payments, or track which dish goes to which table, so it works alongside
a POS such as FeedMe instead of competing with it.

## Evidence
In one browser page, with no login:

- A pass with 4 slots. Each slot is Empty or shows a plate with a timer
  counting up from 0s.
- A row of waiter bands (reusing ZeroBell's 11 staff). Each band shows only a
  colour light and status: free, on break, or going to the pass. No text
  alerts, no table numbers.
- Clicking "Place plate" on a slot (standing in for the camera) starts its
  timer, and **one** free waiter's band lights green and buzzes (a vibration
  animation, plus real vibration on the phone page where supported).
- The waiter presses Accept on that band. The other bands stay quiet, and
  that waiter shows as going to the pass.
- Clicking "Picked up" on the slot stops the timer, empties the slot, frees the
  waiter, and the top bar shows the time waited (for example 18s) and the
  average wait.
- If no one acts, the alert escalates on a fixed timeline:
  - 15s with no Accept: the next free waiter is also alerted.
  - 30s: the band turns amber and buzzes again; all free waiters are alerted.
  - 45s: red, with repeated buzzing.
  - 60s: marked **late** and counted as a miss.
- "Simulate Rush Hour" places plates on several slots at once, and each one
  is dispatched to a different free waiter.

## Required conditions
- Just before "picked up, other bands quiet": one waiter accepted on their
  band, and the alert cleared from every other band.
- Before that: the system picked one free waiter and their band lit up and
  buzzed, escalating with how long the plate has waited (15s / 30s / 45s / 60s).
- Before that: a plate appeared in a pass slot ("Place plate" button) and its
  timer started.
- Before that: the page shows 4 empty pass slots and the waiter bands, with
  who is free, on break, or busy. This comes from local sample data and is
  adapted from ZeroBell's existing tables, watches and accept/dispatch logic.

## Smallest journey
1. The tester opens the page and sees 4 empty pass slots and the waiter bands,
   most free and a couple on break.
2. The tester clicks "Place plate" on Slot 1. Its timer starts, and one free
   waiter's band lights green and buzzes.
3. The tester presses Accept on that band. The other bands stay quiet, and the
   waiter shows as going to the pass.
4. The tester clicks "Picked up" on Slot 1. The slot empties, the waiter is
   free again, and the top bar shows the time waited and the average wait.
5. The tester places a plate and does nothing. They see a second waiter
   alerted at 15s, amber at 30s, red at 45s and "late" at 60s. Then they click
   "Simulate Rush Hour" and see several plates dispatched to different waiters.

## Journey 2: Camera mode (optional)

### Goal
A camera watches the pass, and TypeSafe's Jev decides whether each slot holds
a plate, so nobody has to press "Place plate" or "Picked up". The rest of the
demo (bands, escalation, metrics, phones) works exactly as in Journey 1.

In a real restaurant the camera is the restaurant's **existing CCTV**, brought
in through a **USB capture card** (see "Camera source" below). For the pitch, a
laptop webcam or an iPhone (Continuity Camera) stands in for it. The app treats
all of these the same way: each is just a camera in the picker.

### Evidence
On the same page, running locally on the laptop:

- A "Camera mode" toggle. Off by default, and the demo behaves exactly as
  before when it is off.
- A camera picker lists every camera the laptop sees: the built-in webcam, an
  iPhone through Continuity Camera, or a USB capture card carrying the CCTV
  picture.
- When on, a live webcam preview appears. The tester drags a box over the image
  for each of the 4 slots, and the boxes stay in place after a page reload on
  the same laptop.
- Every 3 seconds the app crops each marked slot from one webcam frame and asks
  Jev one yes/no question per slot: "Is there a plate or dish of food in this
  image?" All 4 questions go in **one** call.
- A slot only changes after **2 checks in a row** agree:
  - 2 × "plate" on an empty slot → same as "Place plate" (timer starts, one
    waiter buzzes).
  - 2 × "no plate" on a slot with a plate → same as "Picked up" (timer stops,
    wait is logged, waiter is freed).
- Timing fix: the plate's timer starts from the **first** check that saw it,
  and the pickup is logged at the **first** check that saw it gone, so waits
  and averages are not inflated by the 2-check delay.
- Jev answers are read as: above 70% = plate, below 30% = no plate, anything in
  between = unsure.
- If the call fails, or Jev is unsure, that slot shows **"Camera unsure"** and
  nothing changes. An error is never treated as "no plate".
- "Place plate" and "Picked up" still work in Camera mode as a backup.
- **Change-gating:** before each check the laptop compares a tiny grey copy of
  each slot with the one Jev last judged (free, no AI). Only changed slots are
  sent, plus the second confirming check and a safety re-check every 5 minutes.
- **Opening hours:** a weekly schedule (default every day 10:00–22:00, 84 hours
  a week) pauses checks outside opening hours, with "Closed now: camera
  paused" on screen. A "Pause outside opening hours" switch turns this off for
  demos and rehearsals.

### Required conditions
- The TypeSafe key stays on the laptop's server (an API route reading
  `TYPESAFE_API_KEY` from `.env.local`). The browser only sends cropped images
  to that route; the key is never sent to the browser.
- Each crop is scaled so each side is at least 280 pixels (Jev's minimum).
- Camera mode only runs on the laptop (localhost); phones keep showing bands.
- In Camera mode the automatic 5-second "camera sees the plate leave" pickup
  after Accept is switched off, because the real camera now decides when the
  plate has gone.

### Camera source: the restaurant's CCTV through a USB capture card
- The restaurant's DVR already shows its cameras on a monitor through HDMI. A
  USB HDMI capture card (about RM50–150) takes that picture into a small
  computer next to the DVR (or the restaurant's existing desktop), where it
  appears as an ordinary camera. No new camera is mounted, and no DVR login or
  brand-specific setup is needed.
- The DVR's HDMI output usually shows **a grid of cameras**, and that is fine:
  on the first visit we mark the slot boxes on the pass camera's tile, and only
  what is inside those boxes is sent to Jev. The app does not care that the
  rest of the screen is other cameras.
- Two things keep this working:
  - **Resolution:** a tile in a 4×4 grid is small, so a slot may be only a
    few dozen pixels. Set the DVR output to its highest resolution and use a
    capture card that accepts it. If the slots are too small to judge, fall
    back to one-area mode (see Later).
  - **A fixed layout:** the boxes are positions on the screen. Turn off the
    DVR's auto-cycle (sequence) mode, and keep the grid layout the same. If
    someone changes the layout or opens one camera full-screen, the boxes land
    on the wrong picture.
- Only the cropped slot areas are sent for detection, never the full CCTV frame,
  so staff and customer faces do not leave the restaurant (a PDPA selling
  point).
- **Camera check at onboarding:** mark the slots on one frame with a plate and
  one without. Above 70% with a plate and below 30% without means the CCTV
  view is good enough. Readings stuck around 40–60% mean this restaurant needs a
  fallback (see Later).

### Smallest journey
1. The tester turns on Camera mode, allows the webcam, and marks the 4 slots on
   the preview.
2. The tester puts a real plate in Slot 1's box. Within about 6 seconds Slot 1
   shows a plate and a timer, and one waiter's band buzzes.
3. The tester waves a hand through Slot 2's box. Slot 2 stays empty.
4. The tester removes the plate. Within about 6 seconds Slot 1 empties and the
   top bar shows the time waited.

## Later
- Fallbacks when the CCTV is blurry or cannot see the pass closely:
  - **One-area mode:** treat the whole pass as one area ("Is there food waiting
    on the pass?") instead of 4 slots.
  - **Add-on pass camera:** an extra CCTV camera on the DVR (about RM100–200) or a
    small webcam aimed at the pass.
  - **No camera:** a button or tablet tap at the pass for the cook, replacing
    the kitchen bell.
- Lower detection cost: only ask Jev when the slot image has changed from the
  last check, instead of every 3 seconds.
- Read the CCTV straight from the DVR's network stream (RTSP) instead of a
  capture card, once a restaurant shares its DVR login.
- Run detection on a small box in the restaurant so no images leave it.
- Real hardware bands (ESP32/nRF52 with an RGB LED, vibration motor and button,
  about US$8–15 each) or off-the-shelf wrist pagers for a first pilot.
- Adjustable timings per restaurant (for example longer for hotpot).
- A "system offline" band pattern so the kitchen falls back to the bell.
- A shift report: average and worst wait at the pass, and late plates per hour.
- Optional FeedMe integration, for example showing the ticket at the pass.
- Choosing the nearest free waiter instead of taking turns.

_Updated on 14 November 2026: pivoted from greeting new guests (ZeroBell) to
monitoring food waiting at the kitchen pass, to avoid overlapping with FeedMe._
_Updated on 14 November 2026: added Journey 2, an optional Camera mode where
TypeSafe's Jev detects plates from the laptop webcam._
_Updated on 14 November 2026: the real-restaurant camera source is the existing
CCTV through a USB capture card; webcam and iPhone stand in for the pitch._
