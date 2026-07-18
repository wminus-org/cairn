/**
 * CRN-007 — cairn glyphs on the map.
 *
 * Every cairn renders as a stacked-stone glyph whose height encodes
 * `stone_count`. One stone is a single pebble; twelve is a tall stack legible
 * from across the map without zooming in. That is the map's entire argument:
 * density becomes readable terrain, before you tap anything.
 *
 * Drop this inside a `<MapView>` (it renders a source and a layer, so it has to
 * be a child of the map):
 *
 *   <MapView>
 *     <Camera ... />
 *     <CairnGlyphs cairns={cairns} onPress={openCairn} />
 *   </MapView>
 *
 * ─── Why one ShapeSource + one SymbolLayer, and not MarkerView ───────────────
 *
 * A `MarkerView` is a real native view hosting React children, re-laid-out by
 * the platform on every camera change. A few dozen of them tank the frame rate
 * on pan — and this is a demo where someone is walking while the map moves, so
 * pan jank is the one thing the audience is guaranteed to see. A `SymbolLayer`
 * renders in GL from a single GeoJSON source: N cairns cost one shape upload,
 * not N view hierarchies, and camera changes cost nothing on the JS side.
 *
 * So: one `ShapeSource` holding the whole visible set, one `SymbolLayer` over
 * it, and the per-cairn variation carried entirely in feature properties that
 * data-driven style expressions read (`['get', 'icon']`). Adding a cairn is a
 * new feature in the collection, never a new component.
 *
 * ─── Why the glyphs are rasterised from React views, not shipped as PNGs ─────
 *
 * The ticket's default is five pre-rendered PNG assets, one per bucket, with
 * per-Space tinting deferred to E5 behind SDF icons and `iconColor`. Two things
 * in the spec rule that out for this build:
 *
 *   1. design-system.md gives the glyph a 1.5pt stroke in the accent colour
 *      over a `#0F1E17` fill at 100% — two tones — precisely so map contour
 *      lines do not read through the stack. An SDF icon is a monochrome alpha
 *      mask by definition and can express exactly one colour, so `iconColor`
 *      tinting would cost us the opaque fill.
 *   2. A Space's `accent_hex` is runtime data. There is no build-time set of
 *      colours to pre-render PNGs for.
 *
 * Two-tone plus arbitrary runtime colour leaves exactly one option: build the
 * images at runtime. `@rnmapbox/maps` supports this directly — `<Image name>`
 * with a single React Native view child rasterises that view into the map's
 * image registry under that name. What you draw is what the GL layer samples,
 * so the result is correct by construction rather than dependent on how the
 * native SDK interprets an alpha mask as a distance field.
 *
 * The cost is bounded and small: images are registered per
 * (bucket × distinct stroke colour), i.e. 5 × the number of distinct Space
 * accents on screen — typically 5 to 15 images, registered once and memoised
 * on the sorted colour list, not per cairn and not per frame. The important
 * property from the ticket is untouched: still one source, one layer, and no
 * native view per cairn.
 *
 * ─── Not in this file ────────────────────────────────────────────────────────
 *
 * This layer draws the glyph and nothing else.
 *
 * The distance number is CRN-015's, in full: its formatting (including the amber
 * `HERE` case inside `radius_m`), its band logic, and the rule that the string on
 * screen is byte-identical to the server's `distance_m` rather than re-rounded
 * locally — CRN-024 needs the map and the Nearby list to agree to within 1m, and
 * two formatters cannot guarantee that. A label drawn here would also disappear
 * inside 200m, where CRN-015 § Bands explicitly keeps the number on screen
 * through the Approach band. One owner, one implementation.
 *
 * The proximity blur/sharpen and the in-radius amber glyph state are likewise
 * CRN-015. Long-press to drop (E2), the detail sheet (E4) and clustering (not
 * needed at demo scale) are all elsewhere.
 */

import { Image, Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import type { SymbolLayerStyle } from '@rnmapbox/maps';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { palette } from '../theme';
import {
  bucketFor,
  glyphImageName,
  glyphStroke,
  GLYPH_BUCKETS,
  GLYPH_MAX_HEIGHT_PT,
  GLYPH_RADIUS_PT,
  GLYPH_STROKE_PT,
  GLYPH_WIDTH_PT,
  STONE_HEIGHT_PT,
  STONE_RISE_PT,
  STONE_WIDTHS_PT,
  type CairnGlyphDatum,
  type GlyphBucket,
} from './glyph';

export type { CairnGlyphDatum } from './glyph';

/* -------------------------------------------------------------------------- */
/* The glyph view                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One stacked-stone glyph, drawn as plain views so `<Image>` can rasterise it.
 *
 * Stones are absolutely positioned from the bottom up and rendered base-first,
 * so each stone paints over the top edge of the one below it. With a 2pt
 * overlap and an opaque `#0F1E17` fill that reads as stones resting on each
 * other rather than a floating column — which is the whole point of a cairn.
 */
function StackGlyph({ bucket, stroke }: { bucket: GlyphBucket; stroke: string }) {
  return (
    <View
      style={{
        width: GLYPH_WIDTH_PT,
        height: bucket.heightPt,
        backgroundColor: 'transparent',
      }}
    >
      {Array.from({ length: bucket.stones }, (_unused, index) => {
        const width = STONE_WIDTHS_PT[index] ?? STONE_WIDTHS_PT[STONE_WIDTHS_PT.length - 1] ?? 8;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              bottom: index * STONE_RISE_PT,
              left: (GLYPH_WIDTH_PT - width) / 2,
              width,
              height: STONE_HEIGHT_PT,
              borderRadius: GLYPH_RADIUS_PT,
              borderWidth: GLYPH_STROKE_PT,
              borderColor: stroke,
              // Opaque, at 100%, so contour lines do not read through the
              // stack. This is why the glyph cannot be a monochrome SDF icon.
              backgroundColor: palette.base,
            }}
          />
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Layer style                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Module-scope constant: a new object identity here would push a style update
 * across the bridge on every render.
 */
const GLYPH_LAYER_STYLE: SymbolLayerStyle = {
  iconImage: ['get', 'icon'],

  // Anchor at the bottom. The default is `center`, which would hang half of a
  // tall stack below its own coordinate and look progressively more wrong as
  // the stack grows. A cairn sits *on* its point.
  iconAnchor: 'bottom',

  // Mapbox's collision detection HIDES overlapping symbols by default, so two
  // cairns 10m apart would silently become one and a dense feed would look
  // broken. Both flags off: nothing is ever dropped.
  iconAllowOverlap: true,
  iconIgnorePlacement: true,

  // Fixed screen-space size — the glyph does not scale with map zoom. The
  // images are rasterised at the device's own scale, so 1 is 1:1.
  iconSize: 1,

  // With overlap allowed, a HIGHER sort key draws on top. Taller stacks win,
  // so the cairn that matters most is never buried under a single pebble.
  symbolSortKey: ['get', 'sortKey'],

  // No text properties. The distance number belongs to CRN-015 — see the header
  // note. Adding a `textField` here would fix its formatting and its band
  // behaviour in the wrong ticket.
};

/**
 * design-system.md: tap target 44 × 44pt regardless of glyph height. This also
 * gives the "tapping 30px away opens nothing" behaviour for free — the hitbox
 * reaches 22pt from the coordinate.
 */
const HITBOX = { width: 44, height: 44 } as const;

/**
 * The part of `@rnmapbox/maps`'s press payload this component uses.
 *
 * The library's own `OnPressEvent` type is not re-exported from the package
 * root, and reaching into `@rnmapbox/maps/lib/typescript/...` for it would
 * couple us to that package's internal file layout. A structural subset is
 * contravariantly assignable to the handler slot on `ShapeSource`, so this
 * typechecks against the real prop without the deep import.
 */
interface ShapeSourcePressEvent {
  features: GeoJSON.Feature[];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface CairnGlyphsProps {
  /**
   * The visible cairn set — tier-1 rows from `cairns_nearby`. Rebuilding this
   * array is how the map updates: a cairn whose count crosses a bucket
   * boundary re-renders taller on the next feed refresh, with no restart.
   */
  cairns: readonly CairnGlyphDatum[];
  /** Fired with the tapped cairn's id. */
  onPress?: (cairnId: string) => void;
  /**
   * Alias for `onPress`. CRN-007 specifies `onPress`; the map screen was
   * written against `onSelect`. Both are accepted so neither side blocks on the
   * other — pick one and drop this before the tree is cleaned up.
   */
  onSelect?: (cairnId: string) => void;
  /** Override only if two glyph layers ever coexist on one map. */
  sourceID?: string;
}

interface GlyphImageSpec {
  name: string;
  bucket: GlyphBucket;
  stroke: string;
}

export function CairnGlyphs({
  cairns,
  onPress,
  onSelect,
  sourceID = 'cairn-glyphs',
}: CairnGlyphsProps) {
  /**
   * Feature collection and image set are derived together but memoised apart,
   * because they change on different clocks: the feed hands us a new `cairns`
   * array on every refresh, while the image set only changes when a new Space
   * accent appears on screen. Re-registering images at feed rate would be a
   * visible stutter.
   *
   * Nothing position-dependent is written into a feature — no distance, no band
   * — so the shape is stable while the user walks past a fixed set of cairns.
   */
  const shape = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    return {
      type: 'FeatureCollection',
      features: cairns.map((cairn) => {
        const bucket = bucketFor(cairn.stone_count);
        const stroke = glyphStroke(cairn);
        return {
          type: 'Feature' as const,
          // Feature ids do not round-trip reliably through the native bridge.
          // The id that matters is in `properties`, read back in handlePress.
          geometry: { type: 'Point' as const, coordinates: [cairn.lng, cairn.lat] },
          properties: {
            id: cairn.id,
            icon: glyphImageName(bucket.id, stroke),
            bucket: bucket.id,
            sortKey: cairn.stone_count,
          },
        };
      }),
    };
  }, [cairns]);

  /**
   * Distinct stroke colours currently on screen, joined into a stable key so
   * the image list is rebuilt only when the *set* of colours changes — not
   * when a cairn moves, appears or has its distance updated.
   */
  const strokeKey = useMemo(() => {
    const seen = new Set<string>();
    for (const cairn of cairns) seen.add(glyphStroke(cairn));
    return Array.from(seen).sort().join(',');
  }, [cairns]);

  const imageSpecs = useMemo<GlyphImageSpec[]>(() => {
    // Bone is always registered even with no personal cairns on screen: it
    // costs five images and means the common case never waits on a re-register.
    const strokes = new Set<string>([palette.bone]);
    for (const stroke of strokeKey.split(',')) {
      if (stroke) strokes.add(stroke);
    }
    return Array.from(strokes).flatMap((stroke) =>
      GLYPH_BUCKETS.map((bucket) => ({
        name: glyphImageName(bucket.id, stroke),
        bucket,
        stroke,
      })),
    );
  }, [strokeKey]);

  /**
   * `onPress` belongs on the ShapeSource, not the layer. The payload carries an
   * array of hit features — take the first, and read the cairn id out of
   * `properties`.
   */
  const handlePress = useCallback(
    (event: ShapeSourcePressEvent) => {
      const hit = event.features[0];
      const id = hit?.properties?.['id'];
      if (typeof id === 'string' && id.length > 0) (onPress ?? onSelect)?.(id);
    },
    [onPress, onSelect],
  );

  return (
    <>
      <Images>
        {imageSpecs.map((spec) => (
          <Image key={spec.name} name={spec.name}>
            <StackGlyph bucket={spec.bucket} stroke={spec.stroke} />
          </Image>
        ))}
      </Images>

      <ShapeSource id={sourceID} shape={shape} onPress={handlePress} hitbox={HITBOX}>
        <SymbolLayer id={`${sourceID}-symbols`} style={GLYPH_LAYER_STYLE} />
      </ShapeSource>
    </>
  );
}

/** Tallest glyph, for callers reserving vertical space above a coordinate. */
export { GLYPH_MAX_HEIGHT_PT };

export default CairnGlyphs;
