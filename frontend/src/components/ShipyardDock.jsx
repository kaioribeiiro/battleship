import { FLEET, cellKey } from '../lib/board.js';
import { useI18n } from '../lib/preferences.js';
import Panel from './Panel.jsx';

function Pips({ size, damaged = 0, sunk = false }) {
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: size }, (_, i) => (
        <i key={i} className={`pip${sunk ? ' pip--sunk' : i < damaged ? ' pip--hit' : ''}`} />
      ))}
    </span>
  );
}

export default function ShipyardDock({
  mode,
  // posicionamento
  draft = [],
  selectedType = null,
  vertical = false,
  submitting = false,
  onSelect,
  onRotate,
  onRandom,
  onClear,
  onConfirm,
  // batalha
  ships = [],
  shotsOnMe = [],
  myShots = [],
  enemyShips = [],
  enemySunkCount = 0,
  enemySunkTypes = [],
}) {
  const { t, shipName } = useI18n();

  if (mode === 'placement') {
    const placed = new Set(draft.map((s) => s.type));
    const complete = placed.size === FLEET.length;
    return (
      <Panel title={t('panelShipyard')} meta={t('metaPlacedCount', placed.size, FLEET.length)}>
        <ul className="dock">
          {FLEET.map((def) => {
            const isPlaced = placed.has(def.type);
            const isSelected = selectedType === def.type;
            return (
              <li key={def.type}>
                <button
                  type="button"
                  className="dock__row"
                  data-selected={isSelected ? 'true' : undefined}
                  data-placed={isPlaced ? 'true' : undefined}
                  onClick={() => onSelect(def.type)}
                >
                  <span className="dock__name">{shipName(def.type)}</span>
                  <Pips size={def.size} />
                  <span className={`tag ${isSelected ? 'tag--cyan' : ''}`}>
                    {isSelected ? t('tagSelected') : isPlaced ? t('tagPlaced') : t('tagPending')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="dock__hint">{t('dockHint')}</p>

        <div className="dock__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onRotate} disabled={!selectedType}>
            {t('btnRotate', vertical)}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onRandom} disabled={submitting}>
            {t('btnRandom')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onClear}
            disabled={submitting || draft.length === 0}
          >
            {t('btnClear')}
          </button>
        </div>
        <button
          type="button"
          className="btn btn--solid btn--block"
          onClick={onConfirm}
          disabled={!complete || submitting}
        >
          {submitting
            ? t('btnSubmitting')
            : complete
              ? t('btnConfirmFleet')
              : t('btnRemainingShips', FLEET.length - placed.size)}
        </button>
      </Panel>
    );
  }

  const hitKeys = new Set(shotsOnMe.filter((s) => s.result !== 'MISS').map((s) => cellKey(s.x, s.y)));
  const myHitKeys = new Set(myShots.filter((s) => s.result !== 'MISS').map((s) => cellKey(s.x, s.y)));
  const unknownTypes = Math.max(0, enemySunkCount - enemySunkTypes.length);
  const isRevealed = enemyShips.length > 0;

  return (
    <Panel title={t('panelFleetStatus')} meta={t('metaHullIntegrity')}>
      <h3 className="dock__subtitle">{t('subtitleOwnFleet')}</h3>
      <ul className="dock">
        {FLEET.map((def) => {
          const ship = ships.find((s) => s.type === def.type);
          if (!ship) return null;
          const damaged = ship.positions.filter((p) => hitKeys.has(cellKey(p.x, p.y))).length;
          const sunk = damaged === ship.positions.length;
          return (
            <li key={def.type} className="dock__row dock__row--static">
              <span className="dock__name">{shipName(def.type)}</span>
              <Pips size={def.size} damaged={damaged} sunk={sunk} />
              <span className={`tag ${sunk ? 'tag--crimson' : damaged ? 'tag--crimson' : 'tag--cyan'}`}>
                {sunk ? t('statusSunk') : damaged ? t('statusDamaged') : t('statusOperational')}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="dock__subtitle">
        {t('subtitleEnemyFleet')} <span className="faint">{t('metaEnemySunk', enemySunkCount, FLEET.length)}</span>
      </h3>
      <ul className="dock">
        {FLEET.map((def) => {
          const enemyShip = enemyShips.find((s) => s.type === def.type);
          const damaged = enemyShip
            ? enemyShip.positions.filter((p) => myHitKeys.has(cellKey(p.x, p.y))).length
            : 0;
          const sunk =
            enemySunkTypes.includes(def.type) ||
            Boolean(enemyShip && (enemyShip.sunk || damaged === enemyShip.positions.length));

          let statusLabel = t('statusUnknown');
          let tagClass = '';
          if (sunk) {
            statusLabel = t('statusSunk');
            tagClass = 'tag--crimson';
          } else if (isRevealed) {
            statusLabel = damaged > 0 ? t('statusDamaged') : t('statusSurvived');
            tagClass = damaged > 0 ? 'tag--crimson' : 'tag--cyan';
          }

          return (
            <li key={def.type} className="dock__row dock__row--static">
              <span className="dock__name">{shipName(def.type)}</span>
              <Pips size={def.size} damaged={damaged} sunk={sunk} />
              <span className={`tag ${tagClass}`}>{statusLabel}</span>
            </li>
          );
        })}
      </ul>
      {unknownTypes > 0 && !isRevealed && <p className="dock__hint">{t('restoredSunkHint', unknownTypes)}</p>}
    </Panel>
  );
}
