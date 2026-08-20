/* Line-art glyphs, drawn in one consistent outline style.
   Every icon inherits `currentColor` so cards and the header can recolour
   them without a second asset. */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

type IconProps = { size?: number }

function Svg({ children, size = 24 }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  )
}

const glyphs: Record<string, () => React.ReactElement> = {
  asteroid: () => (
    <Svg>
      <circle cx="11" cy="12" r="7" {...S} />
      <circle cx="9" cy="10" r="1.4" {...S} />
      <circle cx="13" cy="14" r="1.1" {...S} />
      <path d="M17 5.5 20.5 3M19 9l3-1.5" {...S} />
    </Svg>
  ),
  candy: () => (
    <Svg>
      <circle cx="12" cy="12" r="4.2" {...S} />
      <path d="M8.2 10.4 4 7.5v9l4.2-2.9M15.8 10.4 20 7.5v9l-4.2-2.9" {...S} />
    </Svg>
  ),
  graph: () => (
    <Svg>
      <circle cx="5" cy="17" r="2.2" {...S} />
      <circle cx="12" cy="7" r="2.2" {...S} />
      <circle cx="19" cy="15" r="2.2" {...S} />
      <path d="m6.8 15.6 3.6-6.6M13.8 8.4l3.6 5" {...S} />
    </Svg>
  ),
  basketball: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <path d="M12 3.5v17M3.5 12h17M5.6 5.8c3.4 3.4 3.4 9 0 12.4M18.4 5.8c-3.4 3.4-3.4 9 0 12.4" {...S} />
    </Svg>
  ),
  car: () => (
    <Svg>
      <path d="M3 14.5h18M4.5 14.5 6.4 9a2 2 0 0 1 1.9-1.4h7.4A2 2 0 0 1 17.6 9l1.9 5.5" {...S} />
      <path d="M3 14.5V18h3v-3.5M21 14.5V18h-3v-3.5" {...S} />
      <circle cx="7.5" cy="14.5" r="1.5" {...S} />
      <circle cx="16.5" cy="14.5" r="1.5" {...S} />
    </Svg>
  ),
  hand: () => (
    <Svg>
      <path d="M8 12V5.6a1.6 1.6 0 0 1 3.2 0V11m0-.6V4.4a1.6 1.6 0 0 1 3.2 0V11m0-.4V6.2a1.6 1.6 0 0 1 3.2 0V15a5 5 0 0 1-5 5h-1.7a5 5 0 0 1-4.2-2.3L4 14.2a1.7 1.7 0 0 1 2.7-2L8 13.6" {...S} />
    </Svg>
  ),
  ice: () => (
    <Svg>
      <rect x="3.5" y="6.5" width="7" height="7" rx="1.4" {...S} />
      <rect x="12" y="4" width="6" height="6" rx="1.3" {...S} />
      <rect x="10" y="14" width="8" height="6" rx="1.3" {...S} />
    </Svg>
  ),
  wand: () => (
    <Svg>
      <rect x="3.5" y="5" width="17" height="14" rx="2" {...S} />
      <path d="m8 15 5.5-5.5M13 8.5l2.5 2.5M16 6.5l1 1" {...S} />
      <path d="m18.5 13.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" {...S} />
    </Svg>
  ),
  basket: () => (
    <Svg>
      <path d="M3.5 10h17l-1.7 8.2a2 2 0 0 1-2 1.6H7.2a2 2 0 0 1-2-1.6z" {...S} />
      <path d="M8.5 10 11 4M15.5 10 13 4M9 13.5v3M15 13.5v3M12 13.5v3" {...S} />
    </Svg>
  ),
  smiley: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <circle cx="9.3" cy="10" r="0.9" fill="currentColor" />
      <circle cx="14.7" cy="10" r="0.9" fill="currentColor" />
      <path d="M8.4 14.2a4.4 4.4 0 0 0 7.2 0" {...S} />
    </Svg>
  ),
  slant: () => (
    <Svg>
      <path d="M4 19 9 5M10 19l5-14M16 19l4-11" {...S} />
      <path d="M3 21h18" {...S} strokeOpacity="0.5" />
    </Svg>
  ),
  puzzle: () => (
    <Svg>
      <path d="M10 4h4v2.2a1.6 1.6 0 1 0 3.2 0V4H20v4.4h-2.2a1.6 1.6 0 1 0 0 3.2H20V16h-4.4v-2.2a1.6 1.6 0 1 0-3.2 0V16H8v-4.4h2.2a1.6 1.6 0 1 0 0-3.2H8V4z" {...S} />
      <rect x="4" y="16" width="5" height="4.5" rx="1" {...S} />
    </Svg>
  ),
  contrast: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" />
      <circle cx="12" cy="12" r="3" {...S} />
    </Svg>
  ),
  share: () => (
    <Svg>
      <circle cx="6" cy="12" r="2.4" {...S} />
      <circle cx="17.5" cy="6.5" r="2.4" {...S} />
      <circle cx="17.5" cy="17.5" r="2.4" {...S} />
      <path d="m8.2 10.9 7.1-3.3M8.2 13.1l7.1 3.3" {...S} />
    </Svg>
  ),
  // --- activity icons, one per game, drawn to match what it actually does ---

  rocket: () => (
    <Svg>
      <path d="M12 2.5c2.6 2.2 4 5.3 4 8.6v4.2l-1.9 1.6h-4.2L8 15.3v-4.2c0-3.3 1.4-6.4 4-8.6z" {...S} />
      <circle cx="12" cy="9.6" r="1.7" {...S} />
      <path d="M8 12.4 5.4 15v2.6L8 16.2M16 12.4 18.6 15v2.6L16 16.2" {...S} />
      <path d="M10.6 19.2 12 22l1.4-2.8" {...S} />
    </Svg>
  ),
  tiles: () => (
    <Svg>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" {...S} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" {...S} />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" {...S} />
      <path d="M14.6 17h4.8M17 14.6v4.8" {...S} />
    </Svg>
  ),
  hoop: () => (
    <Svg>
      <ellipse cx="12" cy="15.5" rx="6.5" ry="2.6" {...S} />
      <path d="M12 4.2v6" {...S} />
      <circle cx="12" cy="7" r="2.6" {...S} />
      <path d="M6.6 18.4 5 21M17.4 18.4 19 21" {...S} />
    </Svg>
  ),
  funnel: () => (
    <Svg>
      <path d="M4.5 4.5h15l-5.6 6.6v6.3l-3.8 2.1v-8.4z" {...S} />
      <circle cx="8" cy="19" r="1.3" {...S} />
      <circle cx="17" cy="17.5" r="1.3" {...S} />
    </Svg>
  ),
  cube: () => (
    <Svg>
      <path d="M6.5 6.5h11l-1.3 12a1.6 1.6 0 0 1-1.6 1.4H9.4a1.6 1.6 0 0 1-1.6-1.4z" {...S} />
      <rect x="9.6" y="10.4" width="4.8" height="4.4" rx="1" {...S} />
      <path d="M12 5.8V2.6M9.4 4.2 8 2.4M14.6 4.2 16 2.4" {...S} />
    </Svg>
  ),
  trace: () => (
    <Svg>
      <path d="M4 17.5c3.4 0 3.4-9 6.8-9s3.4 9 6.8 9" {...S} strokeDasharray="2.6 2.2" />
      <path d="m15.6 13.6 4.2-4.2 2.1 2.1-4.2 4.2-2.6.5z" {...S} />
    </Svg>
  ),
  balloon: () => (
    <Svg>
      <ellipse cx="12" cy="9" r="5.4" rx="4.6" ry="5.4" {...S} />
      <path d="m10.7 14.2.7 1.5h1.2l.7-1.5" {...S} />
      <path d="M12 15.7c0 2.4 1.8 2.4 1.8 4.8" {...S} />
    </Svg>
  ),
  balloonJump: () => (
    <Svg>
      <ellipse cx="8.5" cy="8.5" rx="3.4" ry="4" {...S} />
      <path d="m7.6 12.4.5 1.1h.9l.5-1.1" {...S} />
      <path d="M13.5 16.5c2.6-3.4 4.6-4.6 7-4.8" {...S} strokeDasharray="2.4 2" />
      <path d="M18.4 10.5 20.8 11.6l-1 2.4" {...S} />
    </Svg>
  ),
  flash: () => (
    <Svg>
      <rect x="4.5" y="6.5" width="15" height="11" rx="2" {...S} />
      <path d="M10.2 14.4 12 9.2l1.8 5.2M10.9 12.8h2.2" {...S} />
      <path d="M2.4 4.2 4 5.6M21.6 4.2 20 5.6M2.4 19.8 4 18.4M21.6 19.8 20 18.4" {...S} />
    </Svg>
  ),
  letterJump: () => (
    <Svg>
      <path d="M7.6 15.6 9.4 9.8l1.8 5.8M8.2 13.8h2.4" {...S} />
      <path d="M13.6 15.4c1.6-3.4 3.4-4.6 5.6-4.8" {...S} strokeDasharray="2.4 2" />
      <path d="M16.8 9.4 19.8 10.4l-.8 2.8" {...S} />
      <path d="M4 19h16" {...S} strokeOpacity="0.45" />
    </Svg>
  ),
  words: () => (
    <Svg>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" {...S} />
      <path d="M6.6 10h6M6.6 13.2h10.8M6.6 16.2h4.6" {...S} />
    </Svg>
  ),
  numbers: () => (
    <Svg>
      <path d="M6.4 9.2 8.2 8v8" {...S} />
      <path d="M12.4 9.6a1.9 1.9 0 1 1 3.4 1.2L12.4 16h3.9" {...S} />
      <path d="M4 19.6h16" {...S} strokeOpacity="0.45" />
    </Svg>
  ),
  contrastJump: () => (
    <Svg>
      <circle cx="8.5" cy="12" r="5" {...S} />
      <path d="M8.5 7a5 5 0 0 0 0 10z" fill="currentColor" />
      <path d="M15.4 8.6c2.6.6 4 1.9 4.4 3.4-.4 1.5-1.8 2.8-4.4 3.4" {...S} strokeDasharray="2.4 2" />
      <path d="m17.6 6.6 2.6 2-2 2.2" {...S} />
    </Svg>
  ),
  barPattern: () => (
    <Svg>
      <rect x="3.6" y="5" width="16.8" height="3" rx="1" fill="currentColor" />
      <rect x="3.6" y="10.5" width="9.6" height="3" rx="1" fill="currentColor" />
      <rect x="15" y="10.5" width="5.4" height="3" rx="1" fill="currentColor" />
      <rect x="3.6" y="16" width="16.8" height="3" rx="1" fill="currentColor" />
    </Svg>
  ),
  chart: () => (
    <Svg size={34}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" {...S} strokeWidth="1.8" />
      <path d="M7 8h10M8.5 12h7M10.5 16h3" {...S} strokeWidth="2" />
    </Svg>
  ),
  list: () => (
    <Svg size={34}>
      <path d="M4 6h16M4 12h16M4 18h16" {...S} strokeWidth="2.4" />
    </Svg>
  ),
  gamepad: () => (
    <Svg size={34}>
      <path d="M7.5 8h9a5 5 0 0 1 4.9 4.1l.5 3A3 3 0 0 1 19 18.5c-1 0-1.6-.5-2.2-1.2L15.5 16h-7l-1.3 1.3c-.6.7-1.2 1.2-2.2 1.2a3 3 0 0 1-2.9-3.4l.5-3A5 5 0 0 1 7.5 8z" {...S} strokeWidth="1.9" />
      <path d="M7.6 11.4v2.4M6.4 12.6h2.4" {...S} strokeWidth="1.9" />
      <circle cx="16" cy="12" r="0.9" fill="currentColor" />
      <circle cx="17.8" cy="13.8" r="0.9" fill="currentColor" />
    </Svg>
  ),
  gear: () => (
    <Svg size={34}>
      <circle cx="12" cy="12" r="3.2" {...S} strokeWidth="1.9" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" {...S} strokeWidth="1.7" />
    </Svg>
  ),
  close: () => (
    <Svg size={26}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...S} strokeWidth="2.4" />
    </Svg>
  ),
  help: () => (
    <Svg size={26}>
      <path d="M9.2 9.2a2.9 2.9 0 1 1 3.8 2.8c-.7.3-1 .9-1 1.6v.5" {...S} strokeWidth="2" />
      <circle cx="12" cy="17.5" r="1.1" fill="currentColor" />
    </Svg>
  ),
  home: () => (
    <Svg size={26}>
      <path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" {...S} strokeWidth="2" />
    </Svg>
  ),
  back: () => (
    <Svg size={26}>
      <path d="M15 5 8 12l7 7" {...S} strokeWidth="2.4" />
    </Svg>
  ),
}

export function Icon({ name, size }: { name: string; size?: number }) {
  // Cards whose reference art is a boxed capital use the `letter:X` form.
  if (name.startsWith('letter:')) {
    return <span className="card__icon-letter">{name.slice(7)}</span>
  }
  const Glyph = glyphs[name]
  if (!Glyph) return null
  return size ? <span style={{ display: 'grid' }}><Glyph /></span> : <Glyph />
}

export const iconNames = Object.keys(glyphs)
