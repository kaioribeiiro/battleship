import { useEffect, useRef } from 'react';
import { coordLabel } from '../lib/board.js';
import { shipNameFor, t as translateStatic, useI18n } from '../lib/preferences.js';
import Panel from './Panel.jsx';

export function describeEntry(entry, t = translateStatic, shipName = shipNameFor) {
  if (entry.kind === 'SYS') return { coord: '', text: entry.text };
  const coord = coordLabel(entry.x, entry.y);
  const resultMap = {
    MISS: t('resMiss'),
    HIT: t('resHit'),
    SUNK: t('resSunk'),
  };
  let text = resultMap[entry.result] ?? entry.result;
  if (entry.result === 'SUNK' && entry.sunkShip) text += ` · ${shipName(entry.sunkShip)}`;
  return { coord, text: `${entry.kind === 'OWN_SHOT' ? t('shotOwnPrefix') : t('shotEnemyPrefix')} · ${text}` };
}

function Meter({ label, value, tone }) {
  const pct = Math.round(value * 100);
  return (
    <div className="meter" data-tone={tone}>
      <div className="meter__head">
        <span>{label}</span>
        <span className="num">{pct}%</span>
      </div>
      <div className="meter__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TelemetryPanel({ log, myIntegrity, enemyIntegrity, totalTurns, accuracy }) {
  const listRef = useRef(null);
  const { t, shipName } = useI18n();

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const metaLabel =
    typeof accuracy === 'number'
      ? `${t('metaTurn', totalTurns)} · ${t('statAccuracy')}: ${accuracy}%`
      : t('metaTurn', totalTurns);

  return (
    <Panel title={t('panelTelemetry')} meta={metaLabel}>
      <div className="meters">
        <Meter label={t('meterOwnIntegrity')} value={myIntegrity} tone="own" />
        <Meter label={t('meterEnemyIntegrity')} value={enemyIntegrity} tone="enemy" />
      </div>

      <ol className="log" ref={listRef} aria-live="polite" aria-label={t('logAria')}>
        {log.length === 0 && <li className="empty">{t('emptyLog')}</li>}
        {log.map((entry) => {
          const { coord, text } = describeEntry(entry, t, shipName);
          return (
            <li key={entry.id} className="log__row" data-kind={entry.kind} data-result={entry.result}>
              <span className="log__turn num">{entry.turn ? `T${String(entry.turn).padStart(3, '0')}` : '···'}</span>
              <span className="log__coord">{coord}</span>
              <span className="log__text">{text}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
