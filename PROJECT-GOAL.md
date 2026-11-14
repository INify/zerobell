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
The laptop webcam watches the pass, and TypeSafe's Jev decides whether each
slot holds a plate, so nobody has to press "Place plate" or "Picked up". The
rest of the demo (bands, escalation, metrics, phones) works exactly as in
Journey 1.

### Evidence
On the same page, running locally on the laptop:

- A "Camera mode" toggle. Off by default, and the demo behaves exactly as
  before when it is off.
- A camera picker lists the laptop's cameras (for example the built-in
  webcam, or an iPhone through Continuity Camera), so the camera can face the
  pass.
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

### Required conditions
- The TypeSafe key stays on the laptop's server (an API route reading
  `TYPESAFE_API_KEY` from `.env.local`). The browser only sends cropped images
  to that route; the key is never sent to the browser.
- Each crop is scaled so each side is at least 280 pixels (Jev's minimum).
- Camera mode only runs on the laptop (localhost); phones keep showing bands.
- In Camera mode the automatic 5-second "camera sees the plate leave" pickup
  after Accept is switched off, because the real camera now decides when the
  plate has gone.

### Smallest journey
1. The tester turns on Camera mode, allows the webcam, and marks the 4 slots on
   the preview.
2. The tester puts a real plate in Slot 1's box. Within about 6 seconds Slot 1
   shows a plate and a timer, and one waiter's band buzzes.
3. The tester waves a hand through Slot 2's box. Slot 2 stays empty.
4. The tester removes the plate. Within about 6 seconds Slot 1 empties and the
   top bar shows the time waited.

## Later
- Real dish detection from a webcam or the restaurant's CCTV, running on a
  small box in the restaurant so video is not sent to the cloud.
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
