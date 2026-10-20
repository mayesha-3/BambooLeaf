// Shape data for the BambooLeaf mark (viewBox 0 0 128 128).
// One source of truth: the SVG files in the brand folder and the React logo use the same numbers.
export interface BambooSegment {
  x: number
  y: number
  w: number
  h: number
  r: number
}

// Each stalk is a column of segments. The small gap between two segments is the bamboo node.
export const BAMBOO_SEGMENTS: readonly BambooSegment[] = [
  { x: 25.5, y: 20, w: 15, h: 24.7, r: 5.5 },
  { x: 25.5, y: 47.3, w: 15, h: 25.4, r: 5.5 },
  { x: 25.5, y: 75.3, w: 15, h: 21.4, r: 5.5 },
  { x: 25.5, y: 99.3, w: 15, h: 14.7, r: 5.5 },
  { x: 56.5, y: 6, w: 15, h: 28.7, r: 5.5 },
  { x: 56.5, y: 37.3, w: 15, h: 27.4, r: 5.5 },
  { x: 56.5, y: 67.3, w: 15, h: 27.4, r: 5.5 },
  { x: 56.5, y: 97.3, w: 15, h: 28.7, r: 5.5 },
  { x: 87.5, y: 26, w: 15, h: 24.7, r: 5.5 },
  { x: 87.5, y: 53.3, w: 15, h: 25.4, r: 5.5 },
  { x: 87.5, y: 81.3, w: 15, h: 26.7, r: 5.5 },
]

// Thin light line inside long segments, so a stalk reads as a round pipe.
export const HIGHLIGHT_MIN_HEIGHT = 16
export const HIGHLIGHT_OFFSET_X = 4.2
export const HIGHLIGHT_INSET_Y = 6

// The maple leaf is drawn in a 100 x 100 box. LEAF_TRANSFORM puts it on the bamboo.
export const LEAF_POINTS = '50,2 58,22 66,16 64,34 88,26 80,46 96,52 78,62 80,76 58,68 53,74 53,98 47,98 47,74 42,68 20,76 22,62 4,52 20,46 12,26 36,34 34,16 42,22'
export const LEAF_VEINS = 'M50 96 L50 18 M50 60 L25 40 M50 60 L75 40'
export const LEAF_TRANSFORM = 'translate(64 60) rotate(-10) scale(0.74) translate(-50 -50)'
export const LEAF_HALO = 10 // paper-coloured ring that cuts the bamboo around the leaf
export const LEAF_LINE = 3.4
export const LEAF_VEIN = 2.6
