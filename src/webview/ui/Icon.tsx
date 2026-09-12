import type { SVGProps } from 'react';

/**
 * A small, consistent icon set drawn inline.
 *
 * Inline SVG needs no icon font, no extra CSP allowance and no network, and it
 * inherits `currentColor` so icons follow the theme like text does. Every icon
 * shares one 16px grid and stroke weight, which is what makes them read as a set.
 */
const PATHS = {
  plus: 'M8 3.5v9M3.5 8h9',
  check: 'M3.5 8.4l3 3 6-6.4',
  chevronRight: 'M6 3.5L10.5 8 6 12.5',
  chevronDown: 'M3.5 6L8 10.5 12.5 6',
  chevronLeft: 'M10 3.5L5.5 8 10 12.5',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  note: 'M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4',
  notes: 'M3 2.5h7l3 3v8H3zM6 7h4M6 9.5h4M6 12h2',
  file: 'M4.5 2.5h5l2.5 2.5v8.5h-7.5zM9.5 2.5V5H12',
  edit: 'M10.5 3l2.5 2.5L6.5 12H4v-2.5z',
  focus: 'M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3',
  download: 'M8 3v7M5 7.5L8 10.5 11 7.5M3.5 13h9',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z',
  eyeOff: 'M2 2l12 12M6.6 6.6a2 2 0 002.8 2.8M4.2 4.7C2.5 5.9 1.5 8 1.5 8S4 12.5 8 12.5c1.2 0 2.3-.4 3.2-1M7 3.6c.3 0 .7-.1 1-.1 4 0 6.5 4.5 6.5 4.5s-.5.9-1.4 1.9',
  sun: 'M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
  moon: 'M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z',
  book: 'M2.5 3.5c2-.8 4-.8 5.5.5 1.5-1.3 3.5-1.3 5.5-.5v9c-2-.8-4-.8-5.5.5-1.5-1.3-3.5-1.3-5.5-.5zM8 4v9',
  zoomIn: 'M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5M7 4.8v4.4M4.8 7h4.4',
  zoomOut: 'M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5M4.8 7h4.4',
  fitWidth: 'M2 3v10M14 3v10M4.5 8h7M6 6L4.5 8 6 10M10 6l1.5 2L10 10',
  fitPage: 'M4 2.5h8v11H4zM6.5 6L8 4.5 9.5 6M6.5 10L8 11.5 9.5 10',
  search: 'M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5',
  outline: 'M3 4h10M5.5 8h7.5M5.5 12h7.5M3 8h.01M3 12h.01',
  close: 'M4 4l8 8M12 4l-8 8',
  arrowUp: 'M8 13V3M4 7l4-4 4 4',
  arrowDown: 'M8 3v10M4 9l4 4 4-4',
  external: 'M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5',
  inbox: 'M2.5 9l1.8-5.5h7.4L13.5 9v4h-11zM2.5 9h3l1 1.5h3l1-1.5h3',
  sparkle: 'M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  readonly size?: number;
}

export function Icon({ name, size = 16, strokeWidth = 1.4, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
