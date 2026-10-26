/**
 * The sorgumcore chef — this app's brand character.
 *
 * One source of truth for the mark: the launcher icon, the splash icon and the
 * in-app logo all draw exactly this character, and `scripts/generate-icons.mjs`
 * rasterises the very same markup.
 *
 * The module is deliberately dependency-free (no React Native, no theme import)
 * so the icon generator can load it directly with Node. The palette below is the
 * slice of the Terra tokens the character uses — if `src/theme/colors.ts` changes
 * these values, change them here too.
 */
export const CHEF_PALETTE = {
  /** colors.primary — the chef's jacket. */
  uniform: '#1F3323',
  /** colors.primaryDark — apron neckline. */
  uniformDark: '#17271B',
  /** colors.accent — apron and the spoon bowl. */
  apron: '#C8963E',
  /** colors.accentDark — spoon handle. */
  apronDark: '#9A6F26',
  /** colors.clay — cheeks. */
  cheek: '#B95732',
  /** colors.text — eyes. */
  eye: '#2E3230',
  skin: '#EFC8A0',
  skinShadow: '#D9A87C',
  skinLine: '#7A4A2B',
  hat: '#FFFDF9',
  hatShadow: '#E4E0D8',
  spoonHighlight: '#E8CE97',
  groundShadow: 'rgba(31, 51, 35, 0.13)',
} as const;

const {
  uniform,
  uniformDark,
  apron,
  apronDark,
  cheek,
  eye,
  skin,
  skinShadow,
  skinLine,
  hat,
  hatShadow,
  spoonHighlight,
  groundShadow,
} = CHEF_PALETTE;

const HALO_ID = 'sorgumcoreChefHalo';

/** Character frame. Every layer below is drawn inside this 100x100 box. */
export const CHEF_VIEWBOX = '0 0 100 100';

/**
 * Box (in character units) the spoon is drawn in, centred on the raised hand.
 * Because the box centre is the grip, rotating this layer turns the spoon around
 * the hand with no extra pivot maths.
 */
export const CHEF_SPOON_BOX = { x: 44, y: 22, size: 76 } as const;

/**
 * Visible extent of the character alone (no halo), in character units. The icons
 * use it to centre the chef exactly, whatever the canvas size.
 */
export const CHEF_CHARACTER_BOUNDS = { left: 22.5, top: 1, right: 94, bottom: 99 } as const;

/**
 * Soft radial halo + ground shadow. Static depth behind the character — it never
 * moves, so the only motion on screen is the toque and the spoon.
 */
export const CHEF_BACKDROP = `
  <defs>
    <radialGradient id="${HALO_ID}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${apron}" stop-opacity="0.24"/>
      <stop offset="62%" stop-color="${apron}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${apron}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="48" r="46" fill="url(#${HALO_ID})"/>
  <ellipse cx="50" cy="93" rx="24" ry="4.5" fill="${groundShadow}"/>
`;

/**
 * Neck, body, apron, arms, head and face.
 *
 * The right arm is raised so the hand at (82, 60) can hold the spoon. This layer
 * is never animated: the body and head stay put while the hat and spoon move.
 */
export const CHEF_BODY = `
  <rect x="45" y="60" width="10" height="8" rx="3" fill="${skinShadow}"/>
  <path d="M30 72 Q50 64 70 72 L73 95 Q50 99 27 95 Z" fill="${uniform}"/>
  <path d="M42 70 h16 l2 15 q-10 5 -20 0 Z" fill="${apron}"/>
  <path d="M42 70 L50 77 L58 70" stroke="${uniformDark}" stroke-width="1.4" fill="none"/>
  <path d="M29 74 Q22 82 26 91" stroke="${skin}" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M71 74 Q84 70 82 60" stroke="${skin}" stroke-width="7" stroke-linecap="round" fill="none"/>
  <circle cx="50" cy="46" r="20" fill="${skin}"/>
  <ellipse cx="59" cy="50" rx="8" ry="13" fill="${skinShadow}" opacity="0.35"/>
  <circle cx="39" cy="53" r="3.6" fill="${cheek}" opacity="0.32"/>
  <circle cx="61" cy="53" r="3.6" fill="${cheek}" opacity="0.32"/>
  <circle cx="50" cy="50" r="1.8" fill="${skinShadow}"/>
  <path d="M44 55 Q50 60 56 55" stroke="${skinLine}" stroke-width="2" stroke-linecap="round" fill="none"/>
  <ellipse cx="43" cy="46" rx="3.1" ry="3.9" fill="${eye}"/>
  <ellipse cx="57" cy="46" rx="3.1" ry="3.9" fill="${eye}"/>
`;

/**
 * Chef toque. Animated in the loader: it drifts down and rocks sideways. It sits
 * 1 unit below the top of the frame so the drift never clips its crown.
 */
export const CHEF_TOQUE = `
  <circle cx="35" cy="19" r="11" fill="${hat}"/>
  <circle cx="50" cy="14" r="13" fill="${hat}"/>
  <circle cx="65" cy="19" r="11" fill="${hat}"/>
  <rect x="30" y="27" width="40" height="7" rx="3" fill="${hat}"/>
  <rect x="30" y="30" width="40" height="4" rx="2" fill="${hatShadow}"/>
`;

/**
 * Spoon held in the raised hand. Drawn grip-centred inside its own frame: the
 * whole spoon stays within 41 units of the centre, so rotating it to stir can
 * never push it outside the frame (and therefore never gets clipped).
 */
export const CHEF_SPOON = `
  <path d="M50 50 L56 29" stroke="${apronDark}" stroke-width="6" stroke-linecap="round" fill="none"/>
  <ellipse cx="59" cy="21" rx="6.5" ry="8" fill="${apron}"/>
  <ellipse cx="56" cy="17" rx="2.8" ry="3.6" fill="${spoonHighlight}" opacity="0.85"/>
`;

/** Spoon placed in the character frame (its own grip-centred box, scaled down). */
export const CHEF_SPOON_PLACED = `<g transform="translate(${CHEF_SPOON_BOX.x} ${CHEF_SPOON_BOX.y}) scale(${CHEF_SPOON_BOX.size / 100})">${CHEF_SPOON}</g>`;

/** Backdrop + body + toque as one still fragment (the spoon is placed separately). */
export const CHEF_STILL = `${CHEF_BACKDROP}${CHEF_BODY}${CHEF_TOQUE}`;

/**
 * Wrap a fragment in a single `<svg>` root.
 *
 * `SvgXml` (react-native-svg) does not render a bare fragment: its parser keeps
 * only one root element — the *last* top-level tag — and drops every sibling. So
 * handing it the fragments above left the loader showing a single hat-shading
 * rectangle instead of the chef. Wrapping restores the whole character. (The icon
 * generator already wraps its fragments the same way, which is why the launcher
 * icon always looked right while the in-app character did not.)
 */
export const wrapChefSvg = (content: string) => `<svg viewBox="${CHEF_VIEWBOX}">${content}</svg>`;

/** Fragments above, ready to hand to `SvgXml` (one `<svg>` root each). */
export const CHEF_STILL_SVG = wrapChefSvg(CHEF_STILL);
export const CHEF_TOQUE_SVG = wrapChefSvg(CHEF_TOQUE);
export const CHEF_SPOON_SVG = wrapChefSvg(CHEF_SPOON);

/** The character alone, complete with its spoon and no halo. */
export const CHEF_CHARACTER = `${CHEF_BODY}${CHEF_TOQUE}${CHEF_SPOON_PLACED}`;

/** The complete character (spoon included) without the halo — for small avatars. */
export const CHEF_CHARACTER_SVG = wrapChefSvg(CHEF_CHARACTER);

/** Halo + the complete character. Used for the square launcher icon. */
export const CHEF_MARK = `${CHEF_BACKDROP}${CHEF_CHARACTER}`;
