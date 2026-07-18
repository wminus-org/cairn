/**
 * CRN-006 — the Cairn contour-only base style.
 *
 * Contour lines on `#0F1E17` and nothing else. No roads, no labels, no POIs,
 * no buildings, no water, no admin boundaries, no hillshade.
 *
 * ---------------------------------------------------------------------------
 * WHY RUNTIME STYLE JSON RATHER THAN A STUDIO URL
 * ---------------------------------------------------------------------------
 * The ticket offers both and asks for the tradeoff to be argued. This file
 * ships the style as a JSON object, served to `MapView` via its `styleJSON`
 * prop, with a Studio URL supported as an env-driven override. Reasons, in
 * the order they mattered:
 *
 * 1. The ticket's own biggest trap is "you must PUBLISH the style" — an
 *    unpublished draft renders blank for every account except the author's.
 *    A style that lives in this repo has no publish step, so that failure
 *    mode does not exist. It works on a teammate's fresh install by
 *    construction.
 * 2. It is version-controlled and reviewable. The exact contour ramp below is
 *    a diff, not a setting inside someone's browser tab that nobody else can
 *    see or reproduce.
 * 3. No Studio access, no token and no device exist in the environment this
 *    was authored in, so a URL could not have been created or verified here.
 *    A hardcoded `mapbox://styles/<user>/<id>` pointing at nothing would be a
 *    guess dressed as a deliverable.
 * 4. The style is tiny — three layers — so there is no bundle-size or
 *    tile-caching argument favouring a hosted style at this scale.
 *
 * The cost, stated plainly: Studio gives a visual tuning loop, and hand-tuning
 * a contour ramp by editing numbers here without a device is slower. Hence the
 * override below.
 *
 * ---------------------------------------------------------------------------
 * SWAPPING IN A STUDIO STYLE URL LATER — NO COMPONENT CODE CHANGES
 * ---------------------------------------------------------------------------
 * `MapCanvas` spreads whatever `resolveMapStyle()` returns onto `MapView`, and
 * that function returns either `{ styleJSON }` or `{ styleURL }`. Swapping is
 * therefore pure configuration:
 *
 *   1. In Mapbox Studio: New style → start from a BLANK template (do not start
 *      from Dark and delete ~80 layers; that is the slow path the ticket warns
 *      about).
 *   2. Add a vector source with the URL `mapbox://mapbox.mapbox-terrain-v2`.
 *   3. Add one background layer, `#0F1E17`.
 *   4. Add line layer(s) bound to that source's `contour` source layer, colour
 *      `#E8E3D8`. Mirror the ramps in CONTOUR below if you want parity.
 *   4b. Leave the style's font endpoint in place. Studio sets one on every
 *      template, including blank, and CRN-007's distance labels need it — a
 *      style with no `glyphs` renders the glyph icons but silently drops every
 *      distance number. See the note on `glyphs` further down.
 *   5. Click **Publish**. Not doing this is the #1 cause of a blank map on a
 *      second device — the style resolves only for the authoring account.
 *   6. Put the resulting URL in `.env`:
 *        EXPO_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/<user>/<styleid>
 *   7. Restart Metro with a cleared cache — EXPO_PUBLIC_* vars are inlined at
 *      build time, so a plain reload will NOT pick it up:
 *        npx expo start --dev-client --clear
 *
 * Unset or empty the variable to fall straight back to the built-in style.
 * `MapCanvas.tsx` is not touched in either direction.
 */

import { mapboxStyleUrl } from '../env';
import { palette } from '../theme';

/**
 * A Mapbox style-spec expression. Deliberately minimal — the full spec types
 * are not worth vendoring for three layers, and this is enough for `strict` to
 * catch a malformed literal below.
 */
export type StyleExpression = readonly (
  | string
  | number
  | boolean
  | null
  | StyleExpression
)[];

type StyleValue = number | StyleExpression;

type BackgroundLayer = {
  readonly id: string;
  readonly type: 'background';
  readonly paint: { readonly 'background-color': string };
};

type LineLayer = {
  readonly id: string;
  readonly type: 'line';
  readonly source: string;
  readonly 'source-layer': string;
  readonly minzoom?: number;
  readonly filter?: StyleExpression;
  readonly layout?: {
    readonly 'line-cap'?: 'butt' | 'round' | 'square';
    readonly 'line-join'?: 'bevel' | 'round' | 'miter';
  };
  readonly paint: {
    readonly 'line-color': string;
    readonly 'line-width': StyleValue;
    readonly 'line-opacity': StyleValue;
  };
};

export type CairnStyleSpec = {
  readonly version: 8;
  readonly name: string;
  /**
   * Font endpoint. Required by the style spec as soon as ANY layer in the map
   * sets `text-field` — and CRN-007's glyph layer does, for the distance number
   * beyond 200m. Not optional in this type: a style object without it silently
   * drops every label at runtime, which is exactly the bug this field exists to
   * make impossible to reintroduce.
   */
  readonly glyphs: string;
  readonly sources: Readonly<
    Record<string, { readonly type: 'vector'; readonly url: string }>
  >;
  readonly layers: readonly (BackgroundLayer | LineLayer)[];
};

/**
 * Mapbox Terrain v2. Both strings are exact and neither is interchangeable
 * with a similar-looking one:
 *   - tileset id  `mapbox.mapbox-terrain-v2`  (NOT `mapbox-terrain-dem-v1`,
 *     which is raster elevation for 3D/hillshade and has no vector contours)
 *   - source layer `contour`                  (siblings: `hillshade`, `landcover`)
 */
const TERRAIN_TILESET_URL = 'mapbox://mapbox.mapbox-terrain-v2';
const CONTOUR_SOURCE_LAYER = 'contour';

/** The key the sources map is registered under; layers reference this. */
export const TERRAIN_SOURCE_ID = 'cairn-terrain';

/** Layer ids, exported so CRN-007 can insert glyphs above them explicitly. */
export const LAYER_IDS = {
  background: 'cairn-background',
  contourMinor: 'cairn-contour-minor',
  contourIndex: 'cairn-contour-index',
} as const;

/**
 * Terrain v2 carries no contour geometry below z9, so nothing can draw below
 * that regardless. This sits at 11 because contours at z9-z10 are a dense hatch
 * rather than readable relief. The previous revision expressed the same
 * judgement by ramping opacity to 0 below z11; opacity is now a fixed ladder
 * value, so the cutoff moves to where it belongs. If the map looks like a flat
 * green field, zoom in before concluding anything is broken.
 */
const CONTOUR_MIN_ZOOM = 11;

/**
 * Contour alpha. `#E8E3D8` at 20% — the single value design-system.md § Map
 * base assigns to map contour lines, and one of the six on the opacity ladder,
 * which that document calls "the whole secondary palette".
 *
 * Flat, not ramped. An earlier revision modulated this by the `ele` field so
 * higher ground read stronger; that is a decorative gradient, and restraint
 * rule 2 permits gradients only for the torch reveal and the distance blur.
 * It also produced ~10 alphas off the ladder, index lines reaching 0.40 —
 * double the specified value. Relief legibility now lives entirely in
 * `line-width`, which no rule constrains.
 */
const CONTOUR_OPACITY = 0.2;

/** Plain zoom ramp for line width — no data dependency, so no nesting rules. */
function rampByZoom(
  stops: readonly (readonly [zoom: number, width: number])[],
): StyleExpression {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flat()];
}

/**
 * The contour curve. Restrained on purpose — the design system pins map
 * contours at `#E8E3D8` at 20%, so the minor lines sit either side of that and
 * index lines carry the extra weight that makes the relief legible.
 *
 * Two layers rather than one layer full of `case` expressions: index contours
 * must draw ON TOP of minor ones, which is layer order, not a paint property.
 * It is also far easier to retune one number here on a device.
 */
const CONTOUR = {
  /** Every contour that is not an index line. The texture. */
  minor: {
    width: rampByZoom([
      [11, 0.4],
      [13, 0.5],
      [15, 0.7],
      [17, 0.9],
    ]),
    opacity: CONTOUR_OPACITY,
  },
  /**
   * Index contours — the `index` field marks every 5th/10th line. These are
   * what let the eye count elevation instead of seeing a flat hatch.
   *
   * Same alpha as the minor lines by rule; the whole differential is width.
   * These stops are roughly 2x minor, up from ~1.5x, to recover the weight the
   * removed opacity differential used to carry.
   */
  index: {
    width: rampByZoom([
      [11, 0.8],
      [13, 1.1],
      [15, 1.5],
      [17, 1.9],
    ]),
    opacity: CONTOUR_OPACITY,
  },
} as const;

/**
 * The style.
 *
 * ─── On `glyphs` ────────────────────────────────────────────────────────────
 *
 * An earlier revision of this file omitted `glyphs` on purpose and claimed that
 * made the style "structurally incapable of rendering text" — a stronger form
 * of CRN-006's "zero text glyphs anywhere on screen" than merely leaving out
 * symbol layers. That reasoning was sound and its factual premise was wrong:
 * it asserted CRN-007 uses shapes and not text, but `GLYPH_LAYER_STYLE` in
 * `CairnGlyphs.tsx` sets `textField: ['get', 'label']` to draw the distance
 * number beside cairns beyond 200m. Mapbox GL drops `text-field` outright when
 * the style declares no glyph endpoint, and that layer also sets
 * `textOptional: true` — which keeps the icon alive when the label cannot
 * render, so the map looked entirely correct while every distance number
 * silently failed to draw.
 *
 * So the guarantee is traded away deliberately, in favour of a requirement the
 * product actually has. What CRN-006 is really asking for is no BASEMAP labels
 * — no roads, no places, no POIs — and that is still absolute: this style
 * declares exactly three layers, one background and two line layers, and none
 * of them can produce text. The only text on the map is Cairn's own.
 *
 * Still no `sprite`: no layer here or in CRN-007 references a sprite-sheet icon
 * (`CairnGlyphs` registers its images at runtime through `<Images>`), and an
 * unused sprite endpoint is one more network dependency for a blank result.
 *
 * NOTE — one half of this fix lives in another file. A layer that sets
 * `text-field` should also pin `textFont` (`['Open Sans Regular', 'Arial
 * Unicode MS Regular']`) rather than lean on the renderer's default fontstack,
 * since the default differs between the iOS and Android SDKs and a fontstack
 * this endpoint cannot serve fails the same silent way. That belongs in
 * `CairnGlyphs.tsx` and was not applied here.
 */
export const cairnStyle: CairnStyleSpec = {
  version: 8,
  name: 'Cairn Contour',
  /**
   * Mapbox's hosted font endpoint. `{fontstack}` and `{range}` are literal
   * placeholders the renderer substitutes — do not interpolate them here.
   */
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  sources: {
    [TERRAIN_SOURCE_ID]: {
      type: 'vector',
      url: TERRAIN_TILESET_URL,
    },
  },
  layers: [
    {
      id: LAYER_IDS.background,
      type: 'background',
      paint: { 'background-color': palette.base },
    },
    {
      id: LAYER_IDS.contourMinor,
      type: 'line',
      source: TERRAIN_SOURCE_ID,
      'source-layer': CONTOUR_SOURCE_LAYER,
      minzoom: CONTOUR_MIN_ZOOM,
      // `index` is absent (not zero) on ordinary contours, so `has` is the
      // correct test — a `== 0` comparison would match nothing.
      filter: ['!', ['has', 'index']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.bone,
        'line-width': CONTOUR.minor.width,
        'line-opacity': CONTOUR.minor.opacity,
      },
    },
    {
      id: LAYER_IDS.contourIndex,
      type: 'line',
      source: TERRAIN_SOURCE_ID,
      'source-layer': CONTOUR_SOURCE_LAYER,
      minzoom: CONTOUR_MIN_ZOOM,
      filter: ['has', 'index'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.bone,
        'line-width': CONTOUR.index.width,
        'line-opacity': CONTOUR.index.opacity,
      },
    },
  ],
};

/**
 * `MapView`'s `styleJSON` prop is typed as a STRING, not an object — passing
 * the object silently yields a blank map. Serialised once at module scope
 * rather than per render, so the native side is not handed a new string
 * identity on every commit (which would reload the style).
 */
export const cairnStyleJSON: string = JSON.stringify(cairnStyle);

/** Exactly one of these reaches `MapView`. Spread it onto the component. */
export type MapStyleProps = { styleURL: string } | { styleJSON: string };

/**
 * Resolves the base style: a published Studio URL when `.env` supplies one,
 * otherwise the built-in contour JSON above. See the swap instructions at the
 * top of this file.
 */
export function resolveMapStyle(): MapStyleProps {
  const url = mapboxStyleUrl();
  return url ? { styleURL: url } : { styleJSON: cairnStyleJSON };
}
