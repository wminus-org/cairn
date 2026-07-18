# Vocabulary

Six words. They are not branding — they are the data model and the UI copy at the same time. A cairn is a stack of stones; that is also literally what the `cairns` → `stones` relation is. Keep the words aligned across the schema, the client code, and the screen, and the product explains itself in the demo without a narrator.

The failure mode is drift: someone writes `getPosts()`, someone else labels a button "Reply", and by 15:00 the metaphor is decoration instead of structure. Look the word up here, use it exactly, move on.

---

## The six terms

| Term | Means | Lives in | UI copy |
|---|---|---|---|
| **Cairn** | A marker at a specific coordinate. A place that has something to say. | `cairns` (`id`, `space_id` nullable, `lat`, `lng`, `title`, `created_by`, `created_at`, `radius_m` default 30) | "cairn" / "cairns". "Drop a cairn", "4 cairns nearby", "This cairn holds 11 stones". |
| **Stone** | One contribution to a cairn — a voice note, a photo with pins, or text. | `stones` (`id`, `cairn_id`, `author_id`, `kind` ∈ `voice\|photo\|text`, `body_text`, `audio_url`, `image_url`, `transcript`, `created_at`) | "stone" / "stones". "11 stones", "Add a stone". Stone count is the number the glyph height encodes. |
| **Stacking** | Adding your stone to someone else's cairn. The core collaborative act. | No table. It is an `INSERT INTO stones` with an existing `cairn_id`. | Verb: "Stack a stone". Past tense in the thread: "Maya stacked a stone · 3 weeks ago". |
| **Pin** | A note attached to a specific *point on a photo*, not to the photo as a whole. | `pins` (`id`, `stone_id`, `x` 0–1, `y` 0–1, `note_text`, `audio_url`, `transcript`) | "pin" / "pins". "Tap to add a pin", "3 pins". Never on the map — see the collision below. |
| **Space** | A team or company. Cairns inside a Space are visible only to its members. | `spaces` (`id`, `name`, `accent_hex`, `join_code`, `created_by`) + `space_members` (`space_id`, `user_id`, `role` ∈ `owner\|member`) | Always capitalised: "Space". "Create a Space", "Join a Space", "Visible to Northside FM only". |
| **Trail** | An ordered sequence of cairns. | Nothing. No table today. | Do not ship any string containing "trail". **Out of scope** — see below. |

---

## Term by term, where it matters

### Cairn
The container. It has a position and nothing else that is secret — `lat`, `lng`, `title`, stone count and `space_id` may be returned to any client that can see the Space. Everything gated lives one level down, on the stone.

A cairn is never "empty" in the UI: it is created together with its first stone in the same flow. If you find yourself rendering a zero-stone cairn, something failed mid-upload.

### Stone
The unit of gated content. `audio_url` and `transcript` on a stone are the two fields that must never leave the server for a requester who has not proven proximity. `kind` is a fixed three-value enum — do not add a fourth today.

A photo stone carries its pins as children. A photo stone with zero pins is valid (just a photo); a pin with no parent stone is not.

### Stacking
There is no `stacks` table and there should not be one. Stacking is a verb describing the act of inserting a stone into a cairn you did not create. Same table, same shape, same rendering as the first stone — that sameness is the point. The thread renders oldest at the bottom, newest on top, which is how a real cairn is built.

If you are tempted to write a "reply" or "comment" relation between stones, stop. Stones are flat under a cairn. Depth is time, not nesting.

### Pin
Attaches to a **stone**, not a cairn — `pins.stone_id`. This is the level people get wrong when writing the insert.

`x` and `y` are **normalized floats 0–1** relative to the image's own intrinsic dimensions. Never pixels, never screen coordinates, never scaled to the rendered `<Image>` box. Convert against the *rendered image content box*, not the container — lock the container to the image's aspect ratio so the two are identical, or subtract the letterbox offset. The exact math and the fallback are in CRN-013's traps; do not re-derive it here. A pin stored in pixels looks correct on the device that made it and lands in the wrong place on every other device and every rotation — you will not have time to debug that at 15:10.

### Space
`cairns.space_id` is nullable. `NULL` means the cairn belongs to the creator's personal collection; a UUID means it belongs to that Space. There is no third bucket and no "public" flag.

Non-members see **nothing at all** for a Space cairn — not a locked marker, not a greyed glyph, not a count. The row does not reach the client. If a non-member standing on top of a Space cairn sees any pixel indicating it exists, the visibility rule is broken.

Two roles: `owner`, `member`. Join by six-character code. Each Space carries an `accent_hex` that replaces the amber `#D9A441` for its cairns on the map.

### Trail
Ordered sequence of cairns. **Explicitly out of scope for today** per PLAN.md's cut list. It is in this document so that nobody spends ten minutes designing a table for it, and so that "trail" is recognisable as a word that must not appear in shipped copy, a table name, or a screen. If it comes up in Q&A, it is a one-sentence roadmap answer, not a feature.

---

## Words we do not use

Left column is what will come out of your fingers by reflex. Right column is what ships.

| Generic term | Use instead | Note |
|---|---|---|
| post, note, entry, message | **stone** | `stones`, `stoneId`, `StoneCard`, "Add a stone". |
| comment, reply, respond, thread reply | **stack a stone** / **stacking** | There is no reply primitive. It is the same insert as any other stone. |
| marker, map pin, drop pin, waypoint | **cairn** | See the collision below. This is the one that bites. |
| team, org, organisation, group, workspace | **Space** | Capital S, always, in every string. |
| **feed**, timeline, stream | *nothing* | There is no feed. The map is the map, `Nearby` is a distance-sorted list, a cairn has a **thread** of stones. If the word "feed" reaches a screen or a filename, the product has quietly become a social app. |
| upvote, like, react | *nothing* | Out of scope. No reactions today. |
| unlock (as a button) | *nothing* | Proximity unlocks by walking. Never render an affordance that implies you can unlock by tapping. |

---

## The Pin / Cairn collision — read this one

**Pin means a point on a photo. Only ever that.**

Every mapping product on earth calls a map marker a "pin", so every instinct you have — and every autocomplete — will push you to write `MapPin`, `pinCairn()`, `droppedPins`, "Drop a pin". Do not.

| You mean | Word | Code | Copy |
|---|---|---|---|
| Marker at a lat/lng on the map | **cairn** | `CairnGlyph`, `cairns`, `dropCairn()` | "Drop a cairn" |
| Annotation at an (x, y) on a photo | **pin** | `Pin`, `pins`, `addPin()` | "Add a pin" |

Two reasons this is worth policing rather than shrugging at:

1. **It is the demo's key distinction.** Cairn #2 on the route is "the leak is *there*, on that valve, not somewhere in this photo." If the map markers are also called pins, that sentence loses its edge and the judge hears one feature where there are two.
2. **It is a real bug surface.** Cairn coordinates are `lat`/`lng` in degrees; pin coordinates are `x`/`y` normalized 0–1. Two different coordinate systems, both plausibly named `pin`, one of which silently accepts the other's numbers. Name them apart and the mistake becomes a type error instead of a wrong-looking screen.

---

## Naming in code

Match the schema exactly. No synonyms, no abbreviations that need a second to decode.

| Layer | Convention | Examples |
|---|---|---|
| Tables & columns | `snake_case`, plural tables, singular columns | `cairns`, `stones`, `pins`, `space_members`, `cairn_id`, `space_id` |
| Postgres RPCs | `snake_case`, the noun from this doc | `cairns_nearby`, `cairn_detail`, `stack_stone`, `create_space`, `join_space_by_code` |
| Edge Functions | one lowercase word, the verb | `brief`, `transcribe` |
| TS types | `PascalCase` singular | `Cairn`, `Stone`, `Pin`, `Space`, `SpaceMember`, `Briefing` |
| Components | noun from this doc + role | `CairnGlyph`, `StoneThread`, `StoneComposer`, `PinOverlay`, `SpaceBadge` |
| Screens | the surface, not the entity | `MapScreen`, `CairnScreen`, `NearbyScreen`, `PhotoPinScreen` |

If a name in a PR does not appear in this document or the data model, it is either a new concept that needs a decision, or a synonym that needs replacing. At the pace of today, assume it is a synonym.
