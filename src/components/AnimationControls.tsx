import type { AnimationSpeed } from '../types';
import './AnimationControls.css';

const BASE_DATE = new Date('2024-10-20T00:00:00');

function timestampToDate(days: number): string {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + Math.floor(days));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  currentTime: number;
  isPlaying: boolean;
  speed: AnimationSpeed;
  minTime: number;
  maxTime: number;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSpeedChange: (s: AnimationSpeed) => void;
  onSeek: (t: number) => void;
}

const SPEEDS: AnimationSpeed[] = [0.125, 0.25, 0.5, 1, 2];

export function AnimationControls({
  currentTime,
  isPlaying,
  speed,
  minTime,
  maxTime,
  onTogglePlay,
  onStepForward,
  onStepBackward,
  onSpeedChange,
  onSeek,
}: Props) {
  const progress = maxTime > minTime ? (currentTime - minTime) / (maxTime - minTime) : 0;

  return (
    <div className="animation-controls">
      <div className="controls-row">
        <button className="ctrl-btn" onClick={onStepBackward} title="Step Backward 1 day">
          &#9664;&#9664;
        </button>
        <button className="ctrl-btn play-btn" onClick={onTogglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="ctrl-btn" onClick={onStepForward} title="Step Forward 1 day">
          &#9654;&#9654;
        </button>

        <div className="speed-group">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`speed-btn ${speed === s ? 'active' : ''}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-row">
        <span className="time-label">{timestampToDate(minTime)}</span>
        <input
          type="range"
          className="timeline-slider"
          min={minTime}
          max={maxTime}
          step={1}
          value={currentTime}
          onChange={e => onSeek(parseFloat(e.target.value))}
        />
        <span className="time-label">{timestampToDate(maxTime)}</span>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="current-time">
        Date: <strong>{timestampToDate(currentTime)}</strong>
      </div>
    </div>
  );
}
