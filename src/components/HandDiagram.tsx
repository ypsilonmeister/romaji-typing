import {
  FINGER_GROUP,
  FINGER_LABELS,
  HOME_POSITION_KEYS,
  type FingerId,
} from '../lesson/keyboardLayout';

export interface HandDiagramProps {
  /** 次に使う指（なければ未発光）。 */
  readonly activeFinger: FingerId | undefined;
  /** ヒント強調中か。 */
  readonly hintActive: boolean;
}

interface FingerShape {
  readonly id: FingerId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx: number;
  readonly transform?: string;
}

const LEFT_FINGERS: readonly FingerShape[] = [
  { id: 'left-pinky', x: 18, y: 54, width: 22, height: 64, rx: 11 },
  { id: 'left-ring', x: 46, y: 32, width: 24, height: 84, rx: 12 },
  { id: 'left-middle', x: 76, y: 20, width: 24, height: 96, rx: 12 },
  { id: 'left-index', x: 106, y: 32, width: 24, height: 84, rx: 12 },
  {
    id: 'left-thumb',
    x: 132,
    y: 94,
    width: 24,
    height: 54,
    rx: 12,
    transform: 'rotate(26 144 121)',
  },
];

const RIGHT_FINGERS: readonly FingerShape[] = [
  {
    id: 'right-thumb',
    x: 204,
    y: 94,
    width: 24,
    height: 54,
    rx: 12,
    transform: 'rotate(-26 216 121)',
  },
  { id: 'right-index', x: 230, y: 32, width: 24, height: 84, rx: 12 },
  { id: 'right-middle', x: 260, y: 20, width: 24, height: 96, rx: 12 },
  { id: 'right-ring', x: 290, y: 32, width: 24, height: 84, rx: 12 },
  { id: 'right-pinky', x: 320, y: 54, width: 22, height: 64, rx: 11 },
];

const HOME_LEFT: readonly { key: string; finger: FingerId; bump?: boolean }[] = [
  { key: 'A', finger: 'left-pinky' },
  { key: 'S', finger: 'left-ring' },
  { key: 'D', finger: 'left-middle' },
  { key: 'F', finger: 'left-index', bump: true },
];

const HOME_RIGHT: readonly { key: string; finger: FingerId; bump?: boolean }[] = [
  { key: 'J', finger: 'right-index', bump: true },
  { key: 'K', finger: 'right-middle' },
  { key: 'L', finger: 'right-ring' },
  { key: ';', finger: 'right-pinky' },
];

export function HandDiagram({ activeFinger, hintActive }: HandDiagramProps) {
  function renderFinger(shape: FingerShape) {
    const group = FINGER_GROUP[shape.id];
    const isActive = activeFinger === shape.id;
    const homeKey = HOME_POSITION_KEYS[shape.id];
    const classes = [
      'hand-finger',
      `finger-${group}`,
      isActive ? 'hand-finger-active' : '',
      isActive && hintActive ? 'hand-finger-hint' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <g
        key={shape.id}
        className={classes}
        data-finger-id={shape.id}
        data-active={isActive ? 'true' : undefined}
        transform={shape.transform}
      >
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
          className="hand-finger-shape"
        />
        {homeKey && (
          <text
            x={shape.x + shape.width / 2}
            y={shape.y + 20}
            textAnchor="middle"
            className="hand-finger-key"
          >
            {homeKey}
          </text>
        )}
      </g>
    );
  }

  return (
    <section className="lesson-hands hands-panel" aria-label="てのず">
      <div className="hands-header">
        <span className="hands-title">
          {activeFinger ? FINGER_LABELS[activeFinger] : 'ホームポジション'}
        </span>
      </div>
      <svg
        className="hands-svg"
        viewBox="0 0 360 176"
        role="img"
        aria-label={
          activeFinger
            ? `りょうての ず。つぎは ${FINGER_LABELS[activeFinger]}`
            : 'りょうての ず（ホームポジション ASDF と JKL;）'
        }
      >
        {/* 左手 */}
        <g className="hand-group" aria-label="ひだりて">
          {LEFT_FINGERS.map(renderFinger)}
          <rect x="20" y="102" width="114" height="62" rx="22" className="hand-palm" />
          <text x="77" y="140" textAnchor="middle" className="hand-palm-label">
            ひだり
          </text>
        </g>

        {/* 右手 */}
        <g className="hand-group" aria-label="みぎて">
          {RIGHT_FINGERS.map(renderFinger)}
          <rect x="226" y="102" width="114" height="62" rx="22" className="hand-palm" />
          <text x="283" y="140" textAnchor="middle" className="hand-palm-label">
            みぎ
          </text>
        </g>
      </svg>

      {/* ホームポジション常時表示（ASDF / JKL;） */}
      <div className="home-position-bar" aria-label="ホームポジション ASDF JKL;">
        <div className="home-group">
          {HOME_LEFT.map((item) => (
            <span
              key={item.key}
              className={`home-chip finger-${FINGER_GROUP[item.finger]}${
                activeFinger === item.finger ? ' home-chip-active' : ''
              }`}
            >
              {item.key}
              {item.bump && <span className="home-chip-bump" aria-hidden="true" />}
            </span>
          ))}
        </div>
        <div className="home-group">
          {HOME_RIGHT.map((item) => (
            <span
              key={item.key}
              className={`home-chip finger-${FINGER_GROUP[item.finger]}${
                activeFinger === item.finger ? ' home-chip-active' : ''
              }`}
            >
              {item.key}
              {item.bump && <span className="home-chip-bump" aria-hidden="true" />}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
