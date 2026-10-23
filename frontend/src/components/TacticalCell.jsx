import { memo } from 'react';
import { CELL, coordLabel } from '../lib/board.js';
import { useI18n } from '../lib/preferences.js';

const STATE_KEY = {
  EMPTY: 'cellEmpty',
  SHIP_HIDDEN: 'cellShip',
  MISS: 'cellMiss',
  HIT: 'cellHit',
  SUNK: 'cellSunk',
};

function TacticalCellImpl({ x, y, state, preview, active, pickup, fresh, onClick, onEnter }) {
  const { t } = useI18n();
  const coord = coordLabel(x, y);

  return (
    <button
      type="button"
      className="tcell"
      data-state={state}
      data-preview={preview || undefined}
      data-interactive={active && !pickup ? 'true' : undefined}
      data-pickup={pickup ? 'true' : undefined}
      data-fresh={fresh ? 'true' : undefined}
      tabIndex={-1}
      title={coord}
      aria-label={`${coord}: ${t(STATE_KEY[state] || 'cellEmpty')}`}
      aria-disabled={!active}
      onClick={active ? () => onClick(x, y) : undefined}
      onMouseEnter={active && onEnter ? () => onEnter(x, y) : undefined}
    >
      {state === CELL.MISS && (
        <svg className="mark mark--miss" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="12" />
          <circle cx="50" cy="50" r="30" />
        </svg>
      )}
      {state === CELL.HIT && (
        <svg className="mark mark--hit" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M18 18L82 82M82 18L18 82" />
        </svg>
      )}
      {state === CELL.SUNK && (
        <>
          <svg className="mark mark--bracket" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M6 30V6H30M70 6H94V30M94 70V94H70M30 94H6V70" />
          </svg>
          <svg className="mark mark--sunk" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M18 18L82 82M82 18L18 82" />
          </svg>
        </>
      )}
    </button>
  );
}

export const TacticalCell = memo(TacticalCellImpl);
