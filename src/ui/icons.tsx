/**
 * The app's entire icon set, drawn by hand from the wireframe. 1.5pt strokes
 * in the current ink color. No icon library — these nine are all there is.
 */
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

interface IconProps {
  size?: number;
  color?: string;
}

/** The microphone. `filled` renders the dark-on-accent variant for the FAB. */
export function MicIcon({ size = 24, color = colors.contour }: IconProps) {
  const h = size * (30 / 22);
  return (
    <Svg width={size} height={h} viewBox="0 0 22 30" fill="none">
      <Rect x={6} y={1} width={10} height={17} rx={5} fill={color} />
      <Path d="M2 13 C2 20 7 23 11 23 C15 23 20 20 20 13" stroke={color} strokeWidth={2.2} fill="none" />
      <Line x1={11} y1={23} x2={11} y2={29} stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}

export function HomeIcon({ size = 20, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 17 L3 8 L10 3 L17 8 L17 17" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function ListIcon({ size = 18, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Line x1={2} y1={4} x2={16} y2={4} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={9} x2={16} y2={9} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={14} x2={11} y2={14} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={7} cy={7} r={5} stroke={color} strokeWidth={1.4} />
      <Line x1={11} y1={11} x2={15} y2={15} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

export function ShareIcon({ size = 16, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M8 10 L8 1.5" stroke={color} strokeWidth={1.4} />
      <Path d="M4.5 4.5 L8 1.5 L11.5 4.5" stroke={color} strokeWidth={1.4} />
      <Path d="M2.5 8 L2.5 14 L13.5 14 L13.5 8" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

export function PlusIcon({ size = 24, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={12} y1={4} x2={12} y2={20} stroke={color} strokeWidth={2.4} />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={color} strokeWidth={2.4} />
    </Svg>
  );
}

/** Solid triangle. Views (not Svg) elsewhere draw this with borders; either is fine. */
export function PlayIcon({ size = 12, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M2.5 1 L11 6 L2.5 11 Z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 12, color = colors.contour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Rect x={2} y={1} width={3} height={10} fill={color} />
      <Rect x={7} y={1} width={3} height={10} fill={color} />
    </Svg>
  );
}

/** A 1pt chevron drawn as two lines at 45°, per the restraint rules. */
export function ChevronIcon({ size = 12, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M4 2 L9 6 L4 10" stroke={color} strokeWidth={1.4} fill="none" />
    </Svg>
  );
}
