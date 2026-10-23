import { memo, useMemo } from 'react';
import {
  BOARD_SIZE,
  CELL,
  COLUMNS,
  cellIndex,
  cellKey,
  hullPoints,
  hullPointsAttr,
  rowLabel,
} from '../lib/board.js';
import { TacticalCell } from './TacticalCell.jsx';

const RANGE = Array.from({ length: BOARD_SIZE }, (_, i) => i);

function Hull({ ship, variant }) {
  const pts = hullPoints(ship);
  const stern = [(pts[0][0] + pts[4][0]) / 2, (pts[0][1] + pts[4][1]) / 2];
  const bow = pts[2];
  return (
    <g>
      <polygon className={`hull${variant ? ` hull--${variant}` : ''}`} points={hullPointsAttr(ship)} />
      <line className="hull-keel" x1={stern[0]} y1={stern[1]} x2={bow[0]} y2={bow[1]} />
    </g>
  );
}

function TacticalGridImpl({
  mode = 'own',
  cells,
  ships = [],
  revealed = [],
  preview = null,
  interactive = false,
  canPickup = false,
  armed = false,
  scan = false,
  freshKey = null,
  sunkImpact = null,
  label,
  onCellClick,
  onCellHover,
}) {
  const previewMap = useMemo(() => {
    const map = new Map();
    if (preview) {
      for (const c of preview.cells) map.set(cellKey(c.x, c.y), preview.valid ? 'valid' : 'invalid');
    }
    return map;
  }, [preview]);

  const hulls = useMemo(
    () =>
      ships.map((ship) => ({
        ship,
        sunk: ship.positions.every((p) => cells[cellIndex(p.x, p.y)] === CELL.SUNK),
      })),
    [ships, cells],
  );

  return (
    <div className="tgrid" role="group" aria-label={label}>
      <div className="tgrid__cols" aria-hidden="true">
        {RANGE.map((x) => (
          <span key={x} className="tgrid__axis">
            {COLUMNS[x]}
          </span>
        ))}
      </div>
      <div className="tgrid__rows" aria-hidden="true">
        {RANGE.map((y) => (
          <span key={y} className="tgrid__axis">
            {rowLabel(y)}
          </span>
        ))}
      </div>

      <div
        className="tboard"
        data-mode={mode}
        data-armed={armed ? 'true' : undefined}
        data-shake={sunkImpact ? 'true' : undefined}
        onMouseLeave={onCellHover ? () => onCellHover(null) : undefined}
      >
        <svg className="hulls" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true">
          {revealed.map((ship) => {
            const isSunk =
              ship.sunk ||
              (ship.positions &&
                ship.positions.length > 0 &&
                ship.positions.every((p) => cells[cellIndex(p.x, p.y)] === CELL.SUNK));
            return <Hull key={`r-${ship.type}`} ship={ship} variant={isSunk ? 'sunk' : 'revealed'} />;
          })}
          {hulls.map(({ ship, sunk }) => (
            <Hull key={ship.type} ship={ship} variant={sunk ? 'sunk' : null} />
          ))}
        </svg>

        {RANGE.map((y) =>
          RANGE.map((x) => {
            const state = cells[cellIndex(x, y)];
            const key = cellKey(x, y);
            return (
              <TacticalCell
                key={key}
                x={x}
                y={y}
                state={state}
                preview={previewMap.get(key) ?? null}
                active={interactive && (mode === 'own' || state === CELL.EMPTY)}
                pickup={canPickup && interactive && state === CELL.SHIP_HIDDEN}
                fresh={freshKey === key}
                onClick={onCellClick}
                onEnter={onCellHover}
              />
            );
          }),
        )}

        {sunkImpact && (
          <>
            <div
              key={`wave-${sunkImpact.id}`}
              className="sonar-wave"
              style={{
                left: `${(sunkImpact.x + 0.5) * 10}%`,
                top: `${(sunkImpact.y + 0.5) * 10}%`,
              }}
              aria-hidden="true"
            />
            {sunkImpact.text && (
              <div key={`banner-${sunkImpact.id}`} className="sunk-banner" role="status">
                {sunkImpact.text}
              </div>
            )}
          </>
        )}

        {scan && <div className="radar-sweep" data-idle={armed ? undefined : 'true'} aria-hidden="true" />}
      </div>
    </div>
  );
}

export const TacticalGrid = memo(TacticalGridImpl);
export default TacticalGrid;
