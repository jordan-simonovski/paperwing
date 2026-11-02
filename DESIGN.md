---
name: PaperWing
description: A reader for the open web, organised by topic, built as a reading instrument whose one object is where a story is being discussed.
colors:
  signal: "oklch(0.55 0.215 27)"
  signal-ink: "oklch(0.99 0.004 27)"
  signal-soft: "oklch(0.93 0.045 27)"
  down: "oklch(0.52 0.17 262)"
  ground: "oklch(0.966 0.003 95)"
  panel: "oklch(0.993 0.002 95)"
  sunk: "oklch(0.935 0.004 95)"
  active: "oklch(0.905 0.005 95)"
  line: "oklch(0.885 0.004 95)"
  line-strong: "oklch(0.75 0.005 95)"
  ink: "oklch(0.2 0.008 95)"
  ink-2: "oklch(0.4 0.008 95)"
  ink-3: "oklch(0.49 0.008 95)"
  read: "oklch(0.49 0.007 95)"
  signal-dark: "oklch(0.7 0.18 30)"
  signal-ink-dark: "oklch(0.17 0.02 30)"
  signal-soft-dark: "oklch(0.31 0.075 30)"
  down-dark: "oklch(0.72 0.13 262)"
  ground-dark: "oklch(0.17 0.003 95)"
  panel-dark: "oklch(0.205 0.004 95)"
  sunk-dark: "oklch(0.145 0.003 95)"
  active-dark: "oklch(0.27 0.005 95)"
  line-dark: "oklch(0.29 0.004 95)"
  line-strong-dark: "oklch(0.42 0.005 95)"
  ink-dark: "oklch(0.95 0.004 95)"
  ink-2-dark: "oklch(0.8 0.005 95)"
  ink-3-dark: "oklch(0.7 0.005 95)"
  pip-ink: "#23221f"
  pip-paper: "#fffdf5"
  pip-oat: "#e8e3d6"
  pip-tint: "#f58d82"
typography:
  wordmark:
    fontFamily: "'Fraunces Variable', Georgia, 'Times New Roman', serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'SOFT' 100, 'WONK' 1"
  headline:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
  row-title:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.32
  reading:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
  meta:
    fontFamily: "'Atkinson Hyperlegible Next Variable', ui-sans-serif, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  swatch: "3px"
  kbd: "6px"
  control: "10px"
  media: "12px"
  panel: "18px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
components:
  button:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  button-hover:
    backgroundColor: "{colors.active}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    size: "2.25rem"
  icon-button-hover:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
  icon-button-pressed:
    textColor: "{colors.signal}"
  chip:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-2}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 0.875rem"
    height: "2rem"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  segmented:
    backgroundColor: "{colors.sunk}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  rail-link:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.125rem"
  rail-link-active:
    backgroundColor: "{colors.active}"
    textColor: "{colors.ink}"
  story-row:
    padding: "0.75rem 1rem 0.625rem"
  story-row-selected:
    backgroundColor: "{colors.active}"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "1.125rem 1.25rem 1rem"
---

# Design System: PaperWing

## Overview

**Creative North Star: "The Reading Instrument"**

PaperWing is a precise tool for reading, and its one object is *where a story is being discussed*. The interface is near-neutral ground and ink so the words read first; chrome stays quiet and colour is spent only where it carries information: one signal red for selection, news and the active discussion, a hue per topic for identity, and muted hues for comment depth. Everything else is tone, not colour.

Density is that of a working reader: full-width story rows, a list beside a reading pane on desktop, a single column with a sliding pane and bottom nav on phones. Shapes are soft and rounded (pills for controls, 18px panels) so the dense content never feels sharp. Depth comes from tonal steps (ground, panel, sunk, active) rather than shadows, which are reserved for things that float.

Character lives in a few exact places: the Fraunces wordmark in ink beside Pip the paper owl, who carries the red; each channel opening on a whole field of its topic's colour; and the discussion bar, which splits one link's conversation by source. The system deliberately refuses eyebrows and tracked caps, mono labels, middle-dot meta strings, counting-mark meters, paper grain, glass blur, and the cream-plus-serif look.

**Key Characteristics:**
- Near-neutral ground with a hair of warmth (hue 95, chroma ≤ 0.008); dark mode is neutral near-black, never navy, and nothing glows.
- One accent, Signal Red, used only on state and data.
- Atkinson Hyperlegible Next for everything read or touched; Fraunces for the wordmark only; JetBrains Mono for code inside articles only.
- Tonal layering for depth; one floating shadow.
- Topic identity as colour fields and tints derived from a single hue per topic.
- Every text pairing clears 4.5:1 in both themes; motion only on state changes, off under reduced motion.

## Colors

A near-neutral, faintly warm greyscale doing almost all the work, with one red and a family of derived topic hues. Colours are authored in OKLCH and that is canonical. Light values are the unsuffixed tokens; dark-mode values carry `-dark`.

### Primary
- **Signal Red** ({colors.signal}; dark {colors.signal-dark}): the only accent. Marks the selected row's tab, the current discussion-bar segment, pressed icon buttons (save, watch), new comments, your up votes, the official-board check, focus rings and link underlines in prose. It is also Pip's red, so mark and accents are one red.
- **Signal Soft** ({colors.signal-soft}): text selection and prose link hover wash.
- **Signal Ink** ({colors.signal-ink}): text on a Signal Red fill.

### Secondary
- **Down-vote Blue** ({colors.down}): the reader's down vote, the cool counterpart to Signal Red. Nowhere else.

### Tertiary
- **Topic hues** (per-topic `--h`, applied through fixed lightness/chroma recipes): *field* (L 0.885, C 0.075; dark L 0.31, C 0.065) is a channel's whole header and a followed topic card; *tint* (L 0.915, C 0.05) backs topic tags and chips with *tint ink* (L 0.37, C 0.11) text; *swatch* (L 0.6, C 0.14) is the small square in navigation. Only the hue varies per topic; the recipe guarantees contrast.
- **Comment rails** (six muted hues: blue 255, teal 195, green 150, amber 80, pink 345, violet 300, at L ≈ 0.66, C ≈ 0.12): reply depth when colour-coded threads are on. No reds, so they never read as the signal.

### Neutral
- **Ground** ({colors.ground}): the page.
- **Panel** ({colors.panel}): the reading pane, cards, inputs, the selected segment, the bottom nav. Slightly lifted from ground.
- **Sunk** ({colors.sunk}): resting fill for buttons, chips, segmented tracks, code blocks; hover for rows and rail links.
- **Active** ({colors.active}): hover on filled controls, the selected row, the active rail link.
- **Line** ({colors.line}) and **Line Strong** ({colors.line-strong}): row separators, input borders, card outlines, comment rails; strong for focused inputs and blockquote bars.
- **Ink**, **Ink 2**, **Ink 3** ({colors.ink}, {colors.ink-2}, {colors.ink-3}): titles and body; secondary text and resting icons; meta and placeholders.
- **Read** ({colors.read}): titles of stories already opened, at weight 400.
- **Pip palette** (`--pip-*`, e.g. {colors.pip-paper}, {colors.pip-oat}, {colors.pip-tint}): the mascot's own colours, dimmer and warmer in dark mode so Pip doesn't glare. Used only for Pip.

### Named Rules
**The Signal Rule.** Signal Red marks state and data (selected, new, hot, current, yours), never decoration, headings or chrome.

**The Hue, Not Palette Rule.** A topic is one hue number. Fields, tints, ink and swatches come from the shared lightness and chroma recipes, so any new topic is legible in both themes without picking colours.

## Typography

**Display Font:** Fraunces Variable (with Georgia), for the wordmark only
**Body Font:** Atkinson Hyperlegible Next Variable (with ui-sans-serif)
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace), for code inside articles only

**Character:** One hyperlegible sans carries every word you read or touch, chosen because the brief is readability. The wordmark is the single soft, wonky serif moment: paper and print, set in ink so Pip beside it carries the red.

### Hierarchy
- **Wordmark** (Fraunces 600, SOFT 100, WONK 1, 1.75rem, line-height 1): "PaperWing" beside Pip's head mark (1.875rem).
- **Headline** (700, 1.875rem, 1.1–1.25, tracking -0.02em): page and channel titles.
- **Title** (700, 1.375rem): section headings.
- **Row title** (650, 1.0625rem, 1.32, `text-wrap: pretty`): story titles in lists. Read stories drop to 400 in Read grey.
- **Reading** (400, 1.1875rem, 1.7, max 38rem): article text in the reader. Prose headings 700, 1.25, -0.01em.
- **Body** (400, 1rem, 1.6): comments and inline prose.
- **UI** (600, 0.875rem): buttons, chips, segmented controls, rail links.
- **Meta** (400, 0.8125rem, Ink 3): row headers, timestamps, labels; numbers tabular.

Three text sizes scale the reading and row sizes only: small (reading 1.0625rem, row 1rem), default, large (reading 1.3125rem, row 1.1875rem).

### Named Rules
**The One Reading Face Rule.** Everything readable is Atkinson Hyperlegible Next. Fraunces never appears outside the wordmark; mono never appears outside code.

**The Sentence-Case Rule.** Labels are sentence case at normal tracking. No eyebrows, no tracked caps, no mono labels.

## Layout

A three-column shell on desktop: rail (15rem), list (24–37rem), reading pane (the rest), each scrolling on its own; the pane sits on Panel with an 18px top-left corner. From 1279px down the rail collapses to 4.5rem icons. Under 900px the shell becomes one column: the pane slides in over the list from the right so the list keeps its scroll, a five-item bottom nav appears, the navigation is a left drawer, and bottom sheets become centred dialogs again above 900px. Every phone page is at least a screen tall so the installed iOS app's fixed nav stays on the bottom edge, and safe-area insets pad sheets and nav.

Spacing is a small rem rhythm (0.25, 0.5, 0.875, 1, 1.25, 1.5rem). Rows pad 0.75rem 1rem; rows past the first screenful use `content-visibility: auto`. Meta items are spaced with a 0.875rem column gap, never joined by dots. Horizontal chip rows scroll sideways and fade their right edge so they read as more to come.

## Elevation & Depth

Flat by default, layered by tone. Depth is the step from Ground to Panel (lifted) or Sunk (recessed), with Active for hover and selection. Outlines are inset 1px Line strokes rather than borders where a card or pill needs an edge. A single soft drop, the float shadow, is reserved for things that hover above the page: the command palette, centred dialogs, menus. Topic cards lift 2px on hover with a shadow tinted by their topic hue.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 18px 40px -18px oklch(0.2 0.01 95 / 0.4)`; dark `oklch(0 0 0 / 0.7)`): palette, dialogs, popovers.
- **Card lift** (`box-shadow: 0 14px 30px -18px rgb(0 0 0 / 0.35)`, or tinted with the topic swatch when followed): topic card hover only.
- **Outline** (`box-shadow: inset 0 0 0 1px var(--line)`): pills, cards, quiet edges.

### Named Rules
**The Float-Only Rule.** Only something above the page gets a drop shadow. Rows, panes and controls at rest never do.

## Shapes

Soft and rounded throughout. Controls are full pills (999px): buttons, chips, tags, icon buttons, segmented tracks and their segments, the discussion bar's segments. Containers use the panel radius (18px): reading pane corner, sheets, dialogs, cards, channel fields. Smaller elements step down: control rows and inputs 10px, media and code blocks 12px, keyboard keys and inline code 5–6px, swatches 3px. The selected row's marker is a 4px Signal Red tab with a 3px rounded end on the left edge.

## Components

### Buttons
Rounded, quiet and tactile; they press in rather than light up.
- **Shape:** full pill ({rounded.pill}), 2.25rem tall, 0 1rem padding, UI type at 600.
- **Default:** Sunk fill, Ink text; hover to Active.
- **Primary:** Ink fill, Ground text; hover to Ink 2. Used for the one main action on a surface.
- **Icon button:** 2.25rem circle, Ink 2 glyph, hover to a Sunk fill and Ink; pressed (saved, watching) turns the glyph Signal Red.
- **Press:** every button, icon button and chip scales to 0.97 on `:active` (120ms).
- **Focus:** 2px Signal Red outline, 2px offset, everywhere.
- **On a topic field:** buttons invert to the field's ink with field-coloured text; "Following" becomes a 14% ink wash.

### Chips
- **Style:** 2rem pill, Sunk fill, Ink 2 text at 600; hover Active and Ink.
- **State:** pressed or on inverts to Ink fill, Ground text. A topic chip uses its tint and tint ink.
- **Tags:** smaller (1.375rem, 0.75rem text) topic-tinted pills on rows.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** Panel; a followed topic card fills with its topic field and field ink.
- **Shadow Strategy:** inset Line outline at rest; lift on hover (see Elevation).
- **Internal Padding:** 1.125rem 1.25rem 1rem.

### Inputs / Fields
- **Style:** 2.5rem tall, Panel fill, 1px Line border, 10px radius, 0 1rem padding, Ink 3 placeholder.
- **Focus:** border moves to Line Strong and the global 2px Signal Red focus ring stays (the border change alone is too faint).

### Navigation
- **Rail (desktop):** 2.125rem links, 10px radius, Ink 2 with Ink 3 glyphs; hover Sunk; active Active fill, Ink, 600. Group labels in Meta, sentence case. Topic entries carry their swatch.
- **Bottom nav (phone):** five equal items on Panel with a 1px top line, 0.75rem labels at 600 in Ink 3; active gets an Active fill and Ink. It steps aside while the keyboard is up.
- **Segmented control:** Sunk pill track (3px padding), pill segments in Ink 2; the selected one sits on Panel in Ink. Used for sorts and list switches.

### Story Row
Full-width rows separated by a 1px Line, hover Sunk. A meta header (source in 700 Ink 2, domain, time), then the title (row-title type) beside an optional 12px-rounded thumbnail, then an action bar of outlined pills with tabular counts. Selected rows fill Active and show the Signal Red tab. Read rows grey the title to 400.

### Discussion Bar (signature)
A 0.75rem-tall strip of pill segments with 3px gaps, one per place the link is discussed, alternating Line Strong and Ink 3; hover Ink 2; the current discussion is Signal Red. Tapping a segment switches threads.

### Channel Field
Each channel opens on a whole field of its topic's colour (18px radius), with field-ink text and topic chips as washes of that ink. Ink fields (non-topic channels) invert to Ink with Ground text.

### Comment Thread
Nested comments indent 1.25rem (0.875rem on phones, tighter past depth six). Each level has a 2px rail inside a 16px hit area that collapses its subtree; it turns Signal Red on hover. Colour-coded threads widen rails to 3px in the six depth hues.

### Pip (mascot poses)
Pip, the paper owl, is drawn once in `src/lib/pip.ts` and rendered by `<Pip variant>` in the theme's `--pip-*` colours. Seasonal hats replace the tuft in every pose.
- **Full** (`full`): Pip reading an open Signal Red book. The default mascot and the pose the canvas animations move.
- **Head** (`head`): the logo mark beside the wordmark.
- **Done** (`done`): the edition is finished. The book is shut and held to the chest, the page block shows below the cover with a tint bookmark ribbon hanging out, and the eyes are closed in smiling arcs. It sits at 7rem on Today's "You're caught up" card in place of a check. When you finish while the page is open, it settles once with a small hop that lands on its feet (560ms, the system ease). It never replays on return, and it's off when Motion is off or the system asks for reduced motion.

## Do's and Don'ts

### Do:
- **Do** keep Signal Red to state and data: selection, new, hot, current discussion, your votes, focus.
- **Do** derive any topic colour from a single hue through the field, tint and swatch recipes.
- **Do** separate meta items with spacing (0.875rem column gap), not punctuation.
- **Do** convey depth with Ground, Panel, Sunk and Active; use the float shadow only for overlays.
- **Do** use full pills for controls and 18px for containers.
- **Do** check every new text pairing at 4.5:1 in both themes, and drop transitions under reduced motion.
- **Do** keep Pip's own `--pip-*` colours for Pip, and the wordmark in Fraunces and ink beside it.

### Don't:
- **Don't** use eyebrows, tracked caps or mono labels.
- **Don't** join meta with middle dots.
- **Don't** use counting-mark meters, paper grain or glass blur.
- **Don't** drift into the cream-plus-serif look: the ground stays near-neutral, and serif is the wordmark's alone.
- **Don't** make dark mode navy or let anything glow.
- **Don't** use red in comment rails or any decorative role, so it never competes with the signal.
