---
name: ZeroBell
description: A dark, projector-sized seat map where a seated guest lights a chair and every free waiter's watch lights up with it.
colors:
  ground: "#15131f"
  surface: "#1d1a2b"
  raised: "#2a2640"
  line: "#39344f"
  bezel: "#3a3550"
  seat: "#4a4462"
  ink: "#f2f0f7"
  muted: "#b3aec6"
  dim: "#8f89a8"
  wait: "#ffb000"
  wait-hover: "#ffc233"
  wait-tint: "#342927"
  urgent: "#ff5a4f"
  urgent-tint: "#3f2430"
  greeted: "#38d39f"
  greeted-tint: "#203039"
  clean: "#6aa8ff"
  clean-tint: "#262b44"
  face: "#0b0a12"
  face-busy: "#0d7a55"
  face-clean: "#1d4ed8"
  alert-lo: "#991b1b"
  alert-hi: "#dc2626"
  alert: "#b91c1c"
  alert-late: "#7f1d1d"
typography:
  headline:
    fontFamily: "Archivo, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Archivo, Arial, Helvetica, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Archivo, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "Archivo, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  metric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 700
    fontFeature: "tnum"
  timer-tile:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 700
    fontFeature: "tnum"
  timer-face:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "2.6em"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  chip: "6px"
  tile: "8px"
  table: "12px"
  face: "2rem"
  bezel: "2.4rem"
  pill: "9999px"
spacing:
  chair: "0.5rem"
  tile-gap: "6px"
  panel: "12px"
  gutter: "16px"
  gutter-sm: "24px"
  row-gap-lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.wait}"
    textColor: "{colors.ground}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.wait-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  table-tile-free:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.tile}"
    padding: "4px 8px"
  table-tile-waiting:
    backgroundColor: "{colors.wait-tint}"
    textColor: "{colors.wait}"
    rounded: "{rounded.tile}"
  table-tile-urgent:
    backgroundColor: "{colors.urgent-tint}"
    textColor: "{colors.urgent}"
    rounded: "{rounded.tile}"
  table-tile-dining:
    backgroundColor: "{colors.greeted-tint}"
    textColor: "{colors.greeted}"
    rounded: "{rounded.tile}"
  table-tile-cleaning:
    backgroundColor: "{colors.clean-tint}"
    textColor: "{colors.clean}"
    rounded: "{rounded.tile}"
  watch-face-ready:
    backgroundColor: "{colors.face}"
    textColor: "{colors.ink}"
    rounded: "{rounded.face}"
  watch-face-busy:
    backgroundColor: "{colors.face-busy}"
    textColor: "#ffffff"
    rounded: "{rounded.face}"
  watch-face-clean:
    backgroundColor: "{colors.face-clean}"
    textColor: "#ffffff"
    rounded: "{rounded.face}"
  kpi:
    textColor: "{colors.ink}"
    typography: "{typography.metric}"
---

# Design System: ZeroBell

## Overview

**Creative North Star: "The Lit Seat Map"**

The room is a dark auditorium. Nothing on the ground glows until a guest sits. When one does, the chairs around their table light up amber and every free waiter's watch lights up with it. The floor is the cause and the wrists are the effect, and both always fit on the same 16:9 screen. This is a stage for a presenter on a projector, so everything is sized for the back of the room. State is carried by light on a quiet violet-grey ground, never by decoration.

The system is dense but calm. At rest the whole screen is ground, surface and muted ink. Colour appears only when a table or a wrist changes state, and each state owns exactly one hue. Every waiter has an equal watch in one row across the top, and every free band buzzes when a guest sits. The seat map below is one open 6 by 2 grid, where each table is drawn as a tile with four chairs.

It turns down the category default, a status-coloured card grid beside a staff list, and it turns down glows and cinema props. Depth comes from tonal steps, not from shadows.

**Key Characteristics:**
- Always dark, one theme, built for a projector.
- One hue per state: amber waiting, red in the last 5 seconds or overdue, green greeted, blue cleaning, neutral free.
- Tables are tiles with four chairs; the chairs carry the state light.
- One authored motion: the alert face's red flash in the last 5 seconds; everything else is a short colour transition.
- Archivo for words, Geist Mono for every number that counts.
- A single neutral white focus ring that never reads as a state.

## Colors

A violet-black room with four signal hues, each one tied to exactly one table state.

### Primary
- **Seat Amber** (`wait`): a guest has sat and is waiting to be greeted. Lights the chairs, the tile border, the countdown and the seat icon. It is also the fill of the one primary action, Simulate Rush Hour, because that action makes guests sit. `wait-hover` is its hover step only.

### Secondary
- **Overdue Red** (`urgent`): the last 5 seconds of the 15-second promise, and Overdue after it. Lights the chairs, tile border and countdown, and colours the Avg response KPI when it is over 15 seconds.
- **Greeted Green** (`greeted`): someone said hello. Dining tiles and chairs, the busy wrist face, and the Avg response KPI when it is within the promise.

### Tertiary
- **Cleaning Blue** (`clean`): guests left and the table needs wiping. Dashed tile border, hollow outlined chairs, and the "To clean" text.

### Tints
- **Amber, Red, Green and Blue Tints** (`wait-tint`, `urgent-tint`, `greeted-tint`, `clean-tint`): the tile fill under each state. They are opaque, not alpha.

### Neutral
- **Auditorium Ground** (`ground`): the page, the frame behind each table's chairs, the bezel's inner gap, and the text on the amber button.
- **Stage Surface** (`surface`): the header bar and free table tiles.
- **Raised Violet** (`raised`): the watch strap and ghost-button hover.
- **Hairline** (`line`): borders on the header, panel, ghost button, free tiles and on-break chips.
- **Bezel** (`bezel`): the 4px watch bezel and the crown.
- **Empty Seat** (`seat`): unlit chairs at a free table.
- **House Lights** (`ink`): primary text and the focus ring.
- **Muted** (`muted`): captions, KPI labels, section sub-labels and tile second lines.
- **Dim** (`dim`): on-break chips and the idle status dot on a watch.
- **Watch Glass** (`face`), **Serving Face** (`face-busy`), **Cleaning Face** (`face-clean`): the three steady wrist-face fills. **Alert Reds** (`alert-lo`, `alert-hi`, `alert`, `alert-late`): the urgent flash runs between `alert-lo` and `alert-hi` (static `alert` under reduced motion); `alert-late` is the solid face once a guest has waited past 15 seconds. White text passes on all four (4.8:1 to 10.4:1).

### Named Rules
**The One Hue Per State Rule.** Amber means waiting, red means under 5 seconds or overdue, green means greeted, blue means cleaning, and neutral means free. No hue is reused for brand, decoration or a second meaning.

**The Dark Room Rule.** At rest the screen is ground, surface and muted ink. If something is coloured, a guest caused it.

**The Neutral Focus Rule.** Every control shares one focus ring: 2px solid `ink`, offset 3px. It is white so it never looks like a table state.

## Typography

**Display Font:** Archivo (with Arial, Helvetica, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace), always with tabular numbers

**Character:** Archivo is a sturdy grotesque that reads from the back of a room; Geist Mono gives every countdown, KPI and staff code a fixed width, so numbers tick without jumping.

From 1024px wide the stage scales like a slide: the root size is `clamp(12px, min(1.25vw, 2.2222vh), 48px)`, a fixed share of the screen (by width, or by height when the window is shorter than 16:9). Every rem follows it, so each 16:9 projector shows the 1280×720 layout at its own resolution: 16px at 1280×720, 17px at 1366×768, 20px at 1600×900, 24px at 1920×1080, 32px at 2560×1440, 48px at 4K, 12.8px at 1024×576. Below 1024px (phones, tablets) the root stays 16px. Pixel values quoted below are at 1280×720.

### Hierarchy
- **Brand** (700, 1.25rem, tight tracking): the ZeroBell wordmark, top left.
- **Promise** (600, 1.125rem, ink, balanced): "Every guest greeted within 15 seconds. No waving, no bells." under the wordmark; the loudest text in the top bar. It breaks between the two sentences, never inside one.
- **Section** (600, 1rem): the Staff heading, with its count at Body size in muted.
- **Metric** (Geist Mono 700, 1.25rem, tabular): the four KPI values.
- **Body** (400 or 600, 0.875rem): the sensor line, KPI labels, table tile text, button labels. This is the floor for page text: 14px at 1280 wide.
- **Code** (Geist Mono 700, 1rem): table numbers on tiles.
- **Tile timer** (Geist Mono 700, 1.125rem, tabular): the countdown or "+7s late" on a waiting table.
- **Face type**: each watch face sets its own size from its height (see Wrist), and its contents scale in em: the table or "Greeted" at 1.25em bold, and the status bar at 0.9em semibold.

### Named Rules
**The Numbers Are Mono Rule.** Any number that changes with time or counts results (countdowns, KPIs, response seconds, staff codes) is set in Geist Mono with tabular figures.

**The Back-Row Floor Rule.** No page text is smaller than Body (0.875rem): 14px at 1280×720, 21px at 1080p, and only on a 1024×576 projector does it drop to 11px, because the whole slide shrinks. Face notes sit at 0.92em of the face size, whose own floor is 12px.

## Layout

One 16:9 screen. At 1024px wide and up the page fills the viewport height (`100dvh`) with no page scroll, and at 1280×720 everything fits.

- **Top bar** (surface, hairline bottom border): the wordmark, the promise and the seat-sensor line on the left, four KPIs (a row of four from 1280px, 2×2 between 1024 and 1279px so the bar stays one row), then Simulate Rush Hour and Reset demo. It wraps on narrow screens.
- **Stage**: three rows at lg: the Staff heading ("Staff · every free band buzzes", "10 of 11 free"), the wrist row, and the floor.
- **Wrist row**: all 11 watches, equal size, in one row (11 columns at lg; 6 from 768px, 4 from 640px, 3 below).
- **Floor**: the 12 tables in one open 6×2 grid across the full width (3 columns below 1024px, 2 on phones); tiles are about 199×178px at 1280×720.
- **Face size**: capped by the column width so the face keeps a 0.82 width-to-height ratio: about 95×115px at 1280×720, 142×173px at 1080p.
- **Gap**: 20px between the watches and the floor at lg.
- **Container**: full width with a 1rem side gutter (1.5rem from 640px), capped at 178vh from 1024px so a 16:9 screen is filled edge to edge and a wider or shorter window centres a 16:9 stage (1800px cap below 1024px).

Below 1024px the page stacks and scrolls: the watch grid, then the tables.

### Named Rules
**The Same Screen Rule.** Cause (a lit table) and effect (the buzzing wrist) must be visible at once on the projector. Nothing that matters may sit below the fold at 1280×720.

## Elevation & Depth

The system has no shadows. Depth is tonal: ground under surface under raised, separated by 1px hairlines.

### Named Rules
**The No Glow Rule.** Nothing glows. Emphasis comes from a state hue on a dark ground, or a thicker ring, never from shadows or blur.

## Shapes

Soft rectangles and pills. Table tiles have an 8px radius with a 2px border, sitting inside a 12px frame. Chairs are full pills: horizontal bars above and below the tile (40% of its width, 8px thick) and vertical bars on each side. Buttons are full pills. The watch is a 1.1rem bezel with a 2px border around a 0.85rem face, plus a strap stub top and bottom and a small crown on the right.

Borders carry state: solid for waiting, urgent and dining tiles, dashed for cleaning tiles, and a hollow outlined chair for cleaning.

## Components

### Buttons
- **Shape:** full pill, at least 44px tall.
- **Primary (Simulate Rush Hour):** amber fill, ground-coloured bold text, 20px side padding. Hover lightens to `wait-hover`; disabled drops to 40% opacity when no table is free.
- **Ghost (Reset demo):** transparent with a hairline border and muted text, 16px side padding. Hover fills `raised` and turns the text to ink.
- **Wrist actions (Accept, Done):** full-width pills inside the face, extra-bold and uppercase, at least 44px tall on phones, scaling to 95% while pressed. Shift controls (Clock in, Take break, End break, Clock out) are smaller outline pills.

### KPIs
A label above a value, with no tile around them. The label is muted 0.875rem; the value is Geist Mono 700 1.25rem in ink. Only Avg response changes colour: green within 15 seconds, red over it, ink before any guest has been greeted.

### Table seat (signature)
A table is a 12px ground frame holding a tile with four pill chairs around it. Inside the tile: `T{n}` in bold ink on the left, the state line on the right, and an optional second line below in muted text.
- **Free:** surface tile with a hairline border, `seat` chairs, "Free". Hover lifts the border to muted. Tapping it is Guest Sat.
- **Waiting:** amber border, amber tint, amber chairs, the amber mm:ss countdown, and who was alerted ("10 alerted", "No staff free").
- **Urgent:** the same with red, from 5 seconds left; past 15 seconds it reads "+7s late", counting up.
- **Dining:** green border, green tint, green chairs, "Waiter n" in green, and "Tap: guest left". Hover lifts the border to ink.
- **Cleaning:** dashed blue border, blue tint, hollow blue-outlined chairs, "To clean".
Free and dining tiles are buttons, at least 44px tall; waiting and cleaning tiles are not interactive.

### Wrist (signature)
A watch drawn in CSS: a raised strap stub, a 2px bezel with a small crown, and a face. One per staff member, all the same size. Face type scales with the face (`face height × 0.12`, from 11px); on a wide face (10rem and up, such as the phone companion) it switches to roomier type (`× 0.095`), fuller labels and the shift controls. The top bar always shows the staff member's initials avatar (a `raised` circle with a hairline ring, no photos) and full name, then a "+n" chip on wide faces when more tables are waiting, and a status dot.
- **Ready (home):** `face` fill, "Ready", "Waiting for tables" or a short notice ("Table 4 taken by Aisyah", 6 seconds), then (wide faces) a quiet stats panel (6% white): "Accepted" and "Avg response" in Geist Mono, and two small outline pills: Take break, Clock out. The same stats panel shows on the asleep screens.
- **Asleep (break or clocked out):** a near-black face with dimmed text: "On break" or "Clocked out", "No table alerts", and a green outline pill to End break / Clock in (plus Clock out on a break, on wide faces). No alerts reach it.
- **Alert card:** high contrast, the table number large ("TABLE" over a 2.6em numeral on wide faces, "T4" on small ones), a line on wide faces, and a full-width **ACCEPT** pill.
  - New guest: solid `wait` amber with ground text, then the `alert-flash` red in the last 5 seconds, then solid `alert-late`. Lines: "New guest seated", "Guest still waiting", "Past 15 seconds".
  - Needs cleaning: `face-clean` blue, "Needs cleaning".
  Accept is a ground pill with amber text on amber, a white pill with `alert` text on red, and a white pill with `face-clean` text on blue. No timer on the card; urgency is the colour.
- **Task (after Accept):** `face-busy` green "SERVING" or `face-clean` blue "CLEANING", the table number, and a white **DONE** pill. Stays until Done; no alerts reach it meanwhile.

### Icons
Drawn inline SVG only, small and single-weight: the seat icon in the top bar. They use `currentColor`. There are no icon fonts or emoji.

## Do's and Don'ts

### Do:
- **Do** give each table state exactly one hue: `wait` waiting, `urgent` under 5 seconds or overdue, `greeted` greeted, `clean` cleaning, neutral free.
- **Do** keep the whole journey on one 16:9 screen with no scroll at 1280×720 and up, and stack below 1024px.
- **Do** set every countdown, KPI and staff code in Geist Mono with tabular figures.
- **Do** pair colour with a word, border style or icon (Overdue, dashed cleaning border, hollow chairs, "break", the alert icon).
- **Do** keep text at 11px or larger and touch targets at 44px or taller.
- **Do** announce events once through the hidden live regions (polite for actions, assertive for overdue tables), and never make a ticking face a live region.
- **Do** move focus to the table or wrist that now holds the next action after Guest Sat, Guest Left, Accept, Done or a shift change.
- **Do** honour `prefers-reduced-motion`: no face flash.

### Don't:
- **Don't** add glows, drop shadows or cinema props; depth is tonal.
- **Don't** reuse a state hue for brand, decoration or a different meaning.
- **Don't** use a coloured focus ring; it is always the white `ink` ring.
- **Don't** add a second animated moment; the alert-face flash is the only motion besides colour transitions.
- **Don't** mix light panels into the dark room. If the real projector forces a light version, flip the whole theme at once.
