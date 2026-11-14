---
version: 1
slug: "src-app-floor-demo-tsx"
primary_target: "src/app/floor-demo.tsx"
related_targets: []
---

# Surface brief: ZeroBell floor demo

Scope: the single demo screen (src/app/floor-demo.tsx), Operate mode, presented on a 16:9 projector by a presenter to hackathon judges. One screen, no scrolling at 1280x720 and up; stacked fallback below 1024px wide.

Audience and job: judges watch; the presenter taps tables and wrists. They must see a guest sit, the right wrist light up, and someone answer within 15 seconds.

Keep: all alert routing and timing, Rush Hour, Reset, the roster, the four KPIs, harden work (announcer, focus, 11px+ text, 44px phone targets). Drop: the legend.

Memorable moment: a chair lights up and a line runs from it to the wrist that buzzes.

Open: dark ground must be checked on the real projector; light flip is the fallback. Countdown-at-zero escalation stays out of scope.

## Direction contract

THESIS: The floor is a lit seat map and the wrists are the stage: a seated guest lights a chair, and a line carries that light to the wrist that answers. Refuses the category default of a status-coloured table grid beside a staff list.

OWN-WORLD: Dark auditorium ground (#15131f) with violet-grey surfaces and lines; tables drawn as tiles with four chairs; seat amber (#ffb000) for waiting, red for the last five seconds, green (#38d39f) for greeted, blue (#6aa8ff) for cleaning. Archivo for UI, Geist Mono for timers. No glows, no cinema props.

STORY: Judges see a calm, dark room; the presenter taps a table, its chairs light amber, a line runs to a wrist that flashes red with a countdown; Attending turns the table green and clears the line. They believe nobody had to wave.

FIRST VIEWPORT: Top bar: ZeroBell, four compact KPIs, Rush Hour, Reset. Upper row: four large wrists, the hero, with the compact roster as a fifth column beside them. Lower row: seat-map floor across the full width in three zone blocks, with the seat-sensor statement beside the ZeroBell wordmark in the top bar and on each zone wrist ("Seat sensor alert"). Alert lines leave a lit table's chair, climb the gutter, cross in a channel between the rows, and rise to the wrist. Changed in build from roster-beside-floor: at 1280x720 a two-thirds floor truncated table text, and height (not width) caps the wrists, so the roster moved up.

FORM: Lit Seat Map, candidate 1 on the ordered list (IMPECCABLE'S PICK, chosen over the assigned candidate 5), seed:3bafad820e0b6dee.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
