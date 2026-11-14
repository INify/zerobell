---
name: ZeroBell
description: A dark, projector-sized seat map where a seated guest lights a chair and a line carries that light to the wrist that answers.
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
  roster-chip-free:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  roster-chip-serving:
    backgroundColor: "{colors.greeted-tint}"
    textColor: "{colors.greeted}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  roster-chip-alerted:
    backgroundColor: "{colors.urgent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  roster-chip-break:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  kpi:
    textColor: "{colors.ink}"
    typography: "{typography.metric}"
---

# Design System: ZeroBell

## Overview

**Creative North Star: "The Lit Seat Map"**

The room is a dark auditorium. Nothing on the ground glows until a guest sits. When one does, the chairs around their table light up amber and a line runs from that chair through the gutter to the wrist of the waiter who has to answer. The floor is the cause and the wrists are the effect, and both always fit on the same 16:9 screen. This is a stage for a presenter on a projector, so everything is sized for the back of the room. State is carried by light on a quiet violet-grey ground, never by decoration.

The system is dense but calm. At rest the whole screen is ground, surface and muted ink. Colour appears only when a table or a wrist changes state, and each state owns exactly one hue. The four wrist faces in the upper row are the heroes. The seat map below is a 3 by 3 tile grid per zone, where each table is drawn as a tile with four chairs. The roster is the fifth column beside the wrists.

It turns down the category default, a status-coloured card grid beside a staff list, and it turns down glows and cinema props. Depth comes from tonal steps and the drawn alert line, not from shadows.

**Key Characteristics:**
- Always dark, one theme, built for a projector.
- One hue per state: amber waiting, red in the last 5 seconds or overdue, green greeted, blue cleaning, neutral free.
- Tables are tiles with four chairs; the chairs carry the state light.
- One authored motion: an alert line draws itself from a lit chair to the wrist once.
- Archivo for words, Geist Mono for every number that counts.
- A single neutral white focus ring that never reads as a state.

## Colors

A violet-black room with four signal hues, each one tied to exactly one table state.

### Primary
- **Seat Amber** (`wait`): a guest has sat and is waiting to be greeted. Lights the chairs, the tile border, the countdown, the alert line and the seat icon. It is also the fill of the one primary action, Simulate Rush Hour, because that action makes guests sit. `wait-hover` is its hover step only.

### Secondary
- **Overdue Red** (`urgent`): the last 5 seconds of the 15-second promise, and Overdue after it. Lights the chairs, tile border, countdown and alert line, rings alerted roster chips, colours the alert icon, and colours the Avg response KPI when it is over 15 seconds.
- **Greeted Green** (`greeted`): someone said hello. Dining tiles and chairs, serving roster chips, the serving segment of the roster bar, and the Avg response KPI when it is within the promise.

### Tertiary
- **Cleaning Blue** (`clean`): guests left and the table needs wiping. Dashed tile border, hollow outlined chairs, the "To clean" text and the alert line for a cleaning alert.

### Tints
- **Amber, Red, Green and Blue Tints** (`wait-tint`, `urgent-tint`, `greeted-tint`, `clean-tint`): the tile fill under each state. They are opaque, not alpha, so the alert lines that pass behind tables never show through.

### Neutral
- **Auditorium Ground** (`ground`): the page, the frame behind each table's chairs, the bezel's inner gap, and the text on the amber button.
- **Stage Surface** (`surface`): the header bar, the roster panel and free table tiles.
- **Raised Violet** (`raised`): free roster chips, the watch strap, the roster bar track and ghost-button hover.
- **Hairline** (`line`): borders on the header, panel, ghost button, free tiles and on-break chips.
- **Bezel** (`bezel`): the 4px watch bezel and the crown.
- **Empty Seat** (`seat`): unlit chairs at a free table.
- **House Lights** (`ink`): primary text, the free segment of the roster bar, and the focus ring.
- **Muted** (`muted`): captions, KPI labels, zone sub-labels and tile second lines.
- **Dim** (`dim`): on-break chips and the idle status dot on a watch.
- **Watch Glass** (`face`), **Serving Face** (`face-busy`), **Cleaning Face** (`face-clean`): the three steady wrist-face fills. The flashing red alert face is described under Components.

### Named Rules
**The One Hue Per State Rule.** Amber means waiting, red means under 5 seconds or overdue, green means greeted, blue means cleaning, and neutral means free. No hue is reused for brand, decoration or a second meaning.

**The Dark Room Rule.** At rest the screen is ground, surface and muted ink. If something is coloured, a guest caused it.

**The Neutral Focus Rule.** Every control shares one focus ring: 2px solid `ink`, offset 3px. It is white so it never looks like a table state.

## Typography

**Display Font:** Archivo (with Arial, Helvetica, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace), always with tabular numbers

**Character:** Archivo is a sturdy grotesque that reads from the back of a room; Geist Mono gives every countdown, KPI and staff code a fixed width, so numbers tick without jumping.

The root size scales with the screen: `clamp(16px, calc(8px + 0.625vw), 20px)`, which is 16px at 1280 wide and below and rises to 20px at 1920. All rem sizes below grow with it.

### Hierarchy
- **Headline** (700, 1.5rem, tight tracking): the ZeroBell wordmark in the top bar only.
- **Title** (600, 1.125rem): panel headings such as "Shift · 11 staff".
- **Metric** (Geist Mono 700, 1.25rem, tabular): the four KPI values.
- **Body** (400 or 600, 0.875rem): the tagline, zone headings, waiter captions above each wrist, and button labels.
- **Label** (400, 0.75rem): KPI labels, table tile text, roster chips (Geist Mono 600) and the roster footnote. This is the smallest size in the system: 12px at 1280 wide.
- **Tile timer** (Geist Mono 700, 1rem, tabular): the countdown on a waiting table.
- **Face type**: each wrist face sets its own size, `clamp(14px, face height × 0.058, 22px)`, and its contents scale in em: the countdown or greeting time at 2.6em Geist Mono 700, the table line at 1.1em bold, and the status bar and state word at 0.8em semibold uppercase.

### Named Rules
**The Numbers Are Mono Rule.** Any number that changes with time or counts results (countdowns, KPIs, response seconds, staff codes) is set in Geist Mono with tabular figures.

**The 11px Floor Rule.** No visible text renders smaller than 11px at any supported width. Label at 0.75rem is the floor for page text, and face type never drops below 14px × 0.8.

## Layout

One 16:9 screen. At 1024px wide and up the page fills the viewport height (`100dvh`) with no page scroll, and at 1280×720 everything fits.

- **Top bar** (surface, hairline bottom border): the wordmark and seat-sensor line on the left, four KPIs in a row, then Simulate Rush Hour and Reset demo. It wraps on narrow screens.
- **Wrist row**: four wrists plus the roster in a grid of `repeat(4, 1fr) 1.5fr` at lg. The face height comes from the row height, `clamp(220px, 100dvh − 500px, 460px)`, and is also capped by column width so the face keeps a 0.82 width-to-height ratio.
- **Channel**: a 28px row gap at lg between the wrist row and the floor. Alert lines cross here, each wrist in its own 5px lane.
- **Floor**: three zone blocks side by side across the full width, each a 3-column tile grid with 6px gaps and rows of at least 3.5rem that stretch to fill the remaining height.
- **Container**: max width 1800px, centred, with a 16px side gutter (24px from 640px).

Below 1024px the page stacks and scrolls: wrists in two columns from 640px (one below), the roster spans the full row, zones go three across from 768px and stack below. Alert lines are drawn only at 1024px and up.

### Named Rules
**The Same Screen Rule.** Cause (a lit table) and effect (the buzzing wrist) must be visible at once on the projector. Nothing that matters may sit below the fold at 1280×720.

**The Gutter Route Rule.** An alert line leaves the table's left chair, climbs the gutter beside its table, crosses in the channel in its wrist's lane, and rises to just below the strap. It never crosses another table.

## Elevation & Depth

The system has no shadows. Depth is tonal: ground under surface under raised, separated by 1px hairlines. The only thing that sits above the content is the alert-line layer, an SVG overlay at z-index 20 above tables and wrists at z-index 10. Table frames are painted in `ground`, so a line passing behind a table is hidden by an opaque tint, not blended through it.

### Named Rules
**The No Glow Rule.** Nothing glows. Emphasis comes from a state hue on a dark ground, a thicker ring, or the drawn line, never from shadows or blur.

## Shapes

Soft rectangles and pills. Table tiles have an 8px radius with a 2px border, sitting inside a 12px frame. Chairs are full pills: horizontal bars above and below the tile (40% of its width, 8px thick) and vertical bars on each side. Buttons are full pills. Roster chips have a 6px radius. Panels have a 12px radius. The watch is a 2.4rem bezel with a 4px border around a 2rem face, plus a strap stub top and bottom and a crown on the right.

Borders carry state: solid for waiting, urgent and dining tiles, dashed for cleaning tiles and on-break chips, and a hollow outlined chair for cleaning.

## Components

### Buttons
- **Shape:** full pill, at least 44px tall.
- **Primary (Simulate Rush Hour):** amber fill, ground-coloured bold text, 20px side padding. Hover lightens to `wait-hover`; disabled drops to 40% opacity when no table is free.
- **Ghost (Reset demo):** transparent with a hairline border and muted text, 16px side padding. Hover fills `raised` and turns the text to ink.
- **Wrist actions (Attending, Cleaned):** full-width white pills inside the face, extra-bold, at least 44px tall, scaling to 95% while pressed. Attending text is dark red on the alert face; Cleaned text is dark blue on the cleaning face.

### KPIs
A label above a value, with no tile around them. The label is muted 0.75rem; the value is Geist Mono 700 1.25rem in ink. Only Avg response changes colour: green within 15 seconds, red over it, ink before any guest has been greeted.

### Table seat (signature)
A table is a 12px ground frame holding a tile with four pill chairs around it. Inside the tile: `T{n}` in bold ink on the left, the state line on the right, and an optional second line below in muted text.
- **Free:** surface tile with a hairline border, `seat` chairs, "Free". Hover lifts the border to muted. Tapping it is Guest Sat.
- **Waiting:** amber border, amber tint, amber chairs, the amber mm:ss countdown, and who was alerted ("4 alerted", "7 + runners", "No staff free").
- **Urgent:** the same with red, from 5 seconds left; it reads "Overdue" at zero.
- **Dining:** green border, green tint, green chairs, "Waiter n" in green, and "Tap: guest left". Hover lifts the border to ink.
- **Cleaning:** dashed blue border, blue tint, hollow blue-outlined chairs, "To clean".
Free and dining tiles are buttons, at least 44px tall; waiting and cleaning tiles are not interactive.

### Wrist (signature)
A watch drawn in CSS: a raised strap stub, a 4px bezel with a crown, and a face. A caption above reads "Waiter n · Zone X". The face has a status bar (staff code and role on the left, a dot and status word on the right), a centred body, and an optional "+n more: T5, T9" line.
- **Ready:** `face` fill, "Ready" in ink and "Waiting for a table" in muted. A short notice ("Table 4 taken by Waiter 1") can appear in a translucent white panel for 6 seconds.
- **Alert:** flashes between deep red and red every second (`alert-flash`); shows "Table n: seated", "Seat sensor alert" or "Backup for Zone X" for a runner, the countdown, "Greet now" or "Overdue!", and Attending.
- **Busy:** `face-busy` fill, a drawn check mark, the response time in seconds, "Greeted" and "Serving Table n · free in 12s".
- **Clean:** `face-clean` fill, a drawn wipe icon, "Table n: clean" and Cleaned.

### Roster chips
Geist Mono 600 0.75rem chips, `W{n}`, grouped by Zone A, Zone B, Zone C and Runners. A wrist icon marks the four staff whose wrists are on screen.
- **Free:** `raised` fill with a 1px hairline ring.
- **Serving:** green tint, green text, 1px green ring.
- **Alerted:** red tint, ink text, 2px red ring, plus the alert icon, so the state is not shown by colour alone.
- **On break:** dashed hairline border, dim text, and the word "break".
Above the chips, a two-segment bar shows free (ink) and serving (green) as a share of the shift.

### Alert line (signature)
A 3px round-capped stroke at 90% opacity in the state's hue (amber, red or blue), dashed 7/7 when the wrist is a runner's. It draws in once over 450ms with `cubic-bezier(0.16, 1, 0.3, 1)` when the alert starts. After that it only changes route or colour, and it is removed when the alert ends. With reduced motion it appears without drawing in.

### Icons
Drawn inline SVG only, small and single-weight: wrist, seat, alert (a circled exclamation, labelled "alerted"), check and wipe. They use `currentColor`. There are no icon fonts or emoji.

## Do's and Don'ts

### Do:
- **Do** give each table state exactly one hue: `wait` waiting, `urgent` under 5 seconds or overdue, `greeted` greeted, `clean` cleaning, neutral free.
- **Do** keep state tints opaque so alert lines can pass behind tables.
- **Do** keep the whole journey on one 16:9 screen with no scroll at 1280×720 and up, and stack below 1024px.
- **Do** set every countdown, KPI and staff code in Geist Mono with tabular figures.
- **Do** pair colour with a word, border style or icon (Overdue, dashed cleaning border, hollow chairs, "break", the alert icon).
- **Do** keep text at 11px or larger and touch targets at 44px or taller.
- **Do** announce events once through the hidden live regions (polite for actions, assertive for overdue and runner escalation), and never make a ticking face a live region.
- **Do** move focus to the table or wrist that now holds the next action after Guest Sat, Guest Left, Attending or Cleaned.
- **Do** honour `prefers-reduced-motion`: no face flash and no line draw-in.

### Don't:
- **Don't** add glows, drop shadows or cinema props; depth is tonal.
- **Don't** reuse a state hue for brand, decoration or a different meaning.
- **Don't** use a coloured focus ring; it is always the white `ink` ring.
- **Don't** add a second animated moment; the line draw-in and the alert-face flash are the only motion besides colour transitions.
- **Don't** route an alert line across another table, or draw lines below 1024px.
- **Don't** mix light panels into the dark room. If the real projector forces a light version, flip the whole theme at once.
