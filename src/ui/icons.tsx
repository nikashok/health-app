/**
 * Small SVG icon set (react-native-svg, already a dependency). Replaces the text glyphs
 * (‹ › + − ⌕ ✕) that rendered with per-font offsets. 24×24 grid, stroked, round caps, so
 * every icon has the same weight; `color` and `size` are all a caller needs.
 */
import { Circle, Line, Path, Polyline, Rect, Svg } from 'react-native-svg';

export type IconName =
  | 'today'
  | 'diary'
  | 'progress'
  | 'plus'
  | 'minus'
  | 'search'
  | 'clear'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'star'
  | 'star-filled'
  | 'check'
  | 'repeat';

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const p = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {render(name, p, color)}
    </Svg>
  );
}

type Stroke = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: string;
};

function render(name: IconName, p: Stroke, color: string) {
  switch (name) {
    case 'today': // a calorie ring, three-quarters full
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} opacity={0.35} />
          <Path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" {...p} />
        </>
      );
    case 'diary': // a list page
      return (
        <>
          <Rect x={4.5} y={3.5} width={15} height={17} rx={2.5} {...p} />
          <Line x1={8.5} y1={8.5} x2={15.5} y2={8.5} {...p} />
          <Line x1={8.5} y1={12} x2={15.5} y2={12} {...p} />
          <Line x1={8.5} y1={15.5} x2={12.5} y2={15.5} {...p} />
        </>
      );
    case 'progress': // a trend line on axes
      return (
        <>
          <Polyline points="3.5,4 3.5,20.5 20.5,20.5" {...p} />
          <Polyline points="7,15.5 11,11 14,13.5 19.5,7" {...p} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} {...p} />
          <Line x1={5} y1={12} x2={19} y2={12} {...p} />
        </>
      );
    case 'minus':
      return <Line x1={5} y1={12} x2={19} y2={12} {...p} />;
    case 'search':
      return (
        <>
          <Circle cx={10.5} cy={10.5} r={6} {...p} />
          <Line x1={15} y1={15} x2={20} y2={20} {...p} />
        </>
      );
    case 'clear': // filled circle with a knocked-out cross
      return (
        <>
          <Circle cx={12} cy={12} r={9} fill={color} />
          <Line x1={9} y1={9} x2={15} y2={15} {...p} stroke="#000" />
          <Line x1={15} y1={9} x2={9} y2={15} {...p} stroke="#000" />
        </>
      );
    case 'chevron-left':
      return <Polyline points="15,5 8,12 15,19" {...p} />;
    case 'chevron-right':
      return <Polyline points="9,5 16,12 9,19" {...p} />;
    case 'chevron-down':
      return <Polyline points="5,9 12,16 19,9" {...p} />;
    case 'star':
    case 'star-filled':
      return (
        <Path
          d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
          {...p}
          fill={name === 'star-filled' ? color : 'none'}
        />
      );
    case 'check':
      return <Polyline points="5,12.5 10,17.5 19,7" {...p} />;
    case 'repeat':
      return (
        <>
          <Path d="M4.5 11V9.5a3 3 0 0 1 3-3h11" {...p} />
          <Polyline points="15.5,3.5 18.5,6.5 15.5,9.5" {...p} />
          <Path d="M19.5 13v1.5a3 3 0 0 1-3 3h-11" {...p} />
          <Polyline points="8.5,20.5 5.5,17.5 8.5,14.5" {...p} />
        </>
      );
  }
}
