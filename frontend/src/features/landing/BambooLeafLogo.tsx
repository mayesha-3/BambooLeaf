import {
  BAMBOO_SEGMENTS,
  HIGHLIGHT_INSET_Y,
  HIGHLIGHT_MIN_HEIGHT,
  HIGHLIGHT_OFFSET_X,
  LEAF_HALO,
  LEAF_LINE,
  LEAF_POINTS,
  LEAF_TRANSFORM,
  LEAF_VEIN,
  LEAF_VEINS,
} from './logo-geometry'

interface BambooLeafLogoProps {
  /** Accessible name. Pass a translated text, never a hardcoded one. Leave it out when the logo is decorative (next to the brand name). */
  title?: string
  className?: string
  /** Play the one-time "leaf settles on the bamboo" motion. */
  animate?: boolean
}

// Colours come from CSS variables (--bl-ink, --bl-paper), so the logo follows light and dark mode.
// The fallbacks keep it black and white when it is used outside the landing page.
const INK = 'var(--bl-ink, #000)'
const PAPER = 'var(--bl-paper, #fff)'

export function BambooLeafLogo({ title, className, animate = false }: BambooLeafLogoProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      focusable="false"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <g fill={INK}>
        {BAMBOO_SEGMENTS.map((s) => (
          <rect key={`${s.x}-${s.y}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />
        ))}
      </g>
      <g stroke={PAPER} strokeWidth={1.7} strokeLinecap="round" opacity={0.9}>
        {BAMBOO_SEGMENTS.filter((s) => s.h > HIGHLIGHT_MIN_HEIGHT).map((s) => (
          <line
            key={`hl-${s.x}-${s.y}`}
            x1={s.x + HIGHLIGHT_OFFSET_X}
            x2={s.x + HIGHLIGHT_OFFSET_X}
            y1={s.y + HIGHLIGHT_INSET_Y}
            y2={s.y + s.h - HIGHLIGHT_INSET_Y}
          />
        ))}
      </g>
      {/* Outer group places the leaf. The inner group is the one that moves, so the two transforms never fight. */}
      <g transform={LEAF_TRANSFORM}>
        <g className={animate ? 'bl-logo__leaf bl-logo__leaf--settle' : 'bl-logo__leaf'}>
          <polygon points={LEAF_POINTS} fill={PAPER} stroke={PAPER} strokeWidth={LEAF_HALO} strokeLinejoin="round" />
          <polygon points={LEAF_POINTS} fill={PAPER} stroke={INK} strokeWidth={LEAF_LINE} strokeLinejoin="round" />
          <path d={LEAF_VEINS} fill="none" stroke={INK} strokeWidth={LEAF_VEIN} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}
