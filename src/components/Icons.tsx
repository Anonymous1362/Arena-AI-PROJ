/**
 * Copper icon set — custom vector glyphs drawn on a 24×24 grid.
 * Stroke-based (feather lineage), round caps/joins, 1.8 weight.
 * Every icon accepts `color`, `size`, `strokeWidth`; used across buttons,
 * tab bar, agent panels and charts. Works on iOS/Android/web via react-native-svg.
 */
import React from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function Base({ size = 22, color = '#000', strokeWidth = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {children}
      </G>
    </Svg>
  );
}

/* -------------------------------- brand --------------------------------- */

/** The Copper asterisk — six tapered rays. */
export const Asterisk = (p: IconProps) => (
  <Base strokeWidth={p.strokeWidth ?? 2.4} {...p}>
    <Path d="M12 3v18" />
    <Path d="M19.8 7.5L4.2 16.5" />
    <Path d="M19.8 16.5L4.2 7.5" />
  </Base>
);

/* ------------------------------ composer/chat ---------------------------- */

export const ArrowUp = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 19V5" />
    <Path d="M5.5 11.5L12 5l6.5 6.5" />
  </Base>
);

export const Paperclip = (p: IconProps) => (
  <Base {...p}>
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Base>
);

export const Stop = ({ size = 22, color = '#000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
  </Svg>
);

/* ------------------------------ navigation ------------------------------ */

export const ChevronDown = (p: IconProps) => (
  <Base {...p}>
    <Path d="M6 9.5l6 6 6-6" />
  </Base>
);

export const ChevronRight = (p: IconProps) => (
  <Base {...p}>
    <Path d="M9.5 6l6 6-6 6" />
  </Base>
);

export const ChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <Path d="M14.5 6l-6 6 6 6" />
  </Base>
);

export const Message = (p: IconProps) => (
  <Base {...p}>
    <Path d="M21 14.5a2 2 0 0 1-2 2H8l-4.5 4v-15a2 2 0 0 1 2-2H19a2 2 0 0 1 2 2z" />
  </Base>
);

export const Layers = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 2.5L2.5 7.5 12 12.5l9.5-5z" />
    <Path d="M2.5 12.5l9.5 5 9.5-5" />
    <Path d="M2.5 17l9.5 5 9.5-5" />
  </Base>
);

export const Sliders = (p: IconProps) => (
  <Base {...p}>
    <Path d="M5 21v-6" />
    <Path d="M5 11V3" />
    <Path d="M12 21v-9" />
    <Path d="M12 8V3" />
    <Path d="M19 21v-4" />
    <Path d="M19 13V3" />
    <Path d="M2.8 15h4.4" />
    <Path d="M9.8 8h4.4" />
    <Path d="M16.8 17h4.4" />
  </Base>
);

/* ------------------------------ agent/tools ------------------------------ */

export const Terminal = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4.5 17l5.5-5-5.5-5" />
    <Path d="M12.5 19H20" />
  </Base>
);

export const Wrench = (p: IconProps) => (
  <Base {...p}>
    <Path d="M14.7 6.3a4.8 4.8 0 0 1 6.3-6.05L17.5 3.8l2.7 2.7 3.55-3.5a4.8 4.8 0 0 1-6.05 6.3L6.3 20.7a2.1 2.1 0 0 1-3-3z" />
  </Base>
);

export const Plan = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4 5.5h2" />
    <Path d="M9.5 5.5H20" />
    <Path d="M4 12h2" />
    <Path d="M9.5 12H20" />
    <Path d="M4 18.5h2" />
    <Path d="M9.5 18.5H20" />
  </Base>
);

export const Folder = (p: IconProps) => (
  <Base {...p}>
    <Path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h5l2.5 3H20a2 2 0 0 1 2 2z" />
  </Base>
);

export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Path d="M14 2.5V8h6" />
  </Base>
);

/* --------------------------------- usage --------------------------------- */

export const Bolt = (p: IconProps) => (
  <Base {...p}>
    <Path d="M13 2.5L4 13.5h6.5L11 21.5l9-11h-6.5z" />
  </Base>
);

export const ChartBars = (p: IconProps) => (
  <Base {...p}>
    <Path d="M5.5 20V11" />
    <Path d="M12 20V4.5" />
    <Path d="M18.5 20v-6.5" />
    <Path d="M3 20h18" />
  </Base>
);

export const Gauge = (p: IconProps) => (
  <Base {...p}>
    <Path d="M20.5 15.5a8.5 8.5 0 1 0-17 0" />
    <Path d="M12 15.5l4-5.5" />
    <Path d="M3.5 19h17" />
  </Base>
);

export const Clock = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3.5 2" />
  </Base>
);

export const Coins = (p: IconProps) => (
  <Base {...p}>
    <EllipsePath />
  </Base>
);

const EllipsePath = () => (
  <>
    <Path d="M12 8.5c3.6 0 6.5-1.2 6.5-2.75S15.6 3 12 3 5.5 4.2 5.5 5.75 8.4 8.5 12 8.5z" />
    <Path d="M5.5 5.75v12.5c0 1.55 2.9 2.75 6.5 2.75s6.5-1.2 6.5-2.75V5.75" />
    <Path d="M5.5 12c0 1.55 2.9 2.75 6.5 2.75s6.5-1.2 6.5-2.75" />
  </>
);

/* ------------------------------- providers ------------------------------- */

export const Cloud = (p: IconProps) => (
  <Base {...p}>
    <Path d="M18 10.5h-1.26A8 8 0 1 0 9 20.5h9a5 5 0 0 0 0-10z" />
  </Base>
);

export const Home = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Base>
);

export const Key = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={7.5} cy={15.5} r={4.5} />
    <Path d="M10.8 12.2L21 2" />
    <Path d="M15.5 7.5l3.5 3.5" />
  </Base>
);

export const Gift = (p: IconProps) => (
  <Base {...p}>
    <Rect x={3.5} y={8} width={17} height={4} rx={1} />
    <Path d="M5.5 12v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8" />
    <Path d="M12 8v13" />
    <Path d="M12 8s-1-4.5-4-4.5a2.25 2.25 0 0 0 0 4.5z" />
    <Path d="M12 8s1-4.5 4-4.5a2.25 2.25 0 0 1 0 4.5z" />
  </Base>
);

export const CreditCard = (p: IconProps) => (
  <Base {...p}>
    <Rect x={2.5} y={5} width={19} height={14} rx={2.5} />
    <Path d="M2.5 10h19" />
  </Base>
);

/* --------------------------------- actions -------------------------------- */

export const Plus = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 5v14" />
    <Path d="M5 12h14" />
  </Base>
);

export const Check = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4.5 12.5l5 5 10-11" />
  </Base>
);

export const Close = (p: IconProps) => (
  <Base {...p}>
    <Path d="M6 6l12 12" />
    <Path d="M18 6L6 18" />
  </Base>
);

export const Search = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="M16.5 16.5L21 21" />
  </Base>
);

export const Copy = (p: IconProps) => (
  <Base {...p}>
    <Rect x={9} y={9} width={11.5} height={11.5} rx={2} />
    <Path d="M5 15H4.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V5" />
  </Base>
);

export const Trash = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3.5 6.5h17" />
    <Path d="M8 6.5V4.8a1.8 1.8 0 0 1 1.8-1.8h4.4A1.8 1.8 0 0 1 16 4.8v1.7" />
    <Path d="M5.5 6.5l1 13a2 2 0 0 0 2 1.9h7a2 2 0 0 0 2-1.9l1-13" />
  </Base>
);

export const Mic = (p: IconProps) => (
  <Base {...p}>
    <Rect x={9} y={2.5} width={6} height={11.5} rx={3} />
    <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <Path d="M12 18v3.5" />
  </Base>
);

export const Pencil = (p: IconProps) => (
  <Base {...p}>
    <Path d="M17 3.2a2.6 2.6 0 0 1 3.7 3.7L7.6 20 2.5 21.5 4 16.4z" />
  </Base>
);
