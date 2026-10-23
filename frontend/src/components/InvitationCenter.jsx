import { useSocket } from '../context/SocketContext.jsx';
import { useI18n } from '../lib/preferences.js';
import { formatCountdown, useNow } from '../lib/useNow.js';

export default function InvitationCenter() {
  const { incoming, outgoing, notices, respondInvite, dismissNotice } = useSocket();
  const { t } = useI18n();
  const now = useNow(1000);

  return (
    <div className="comms" aria-live="polite">
      {incoming.map((entry) => (
        <div
          key={entry.invitation.id}
          className="comm comm--incoming"
          role="alertdialog"
          aria-label={t('inviteReceivedAria')}
        >
          <div className="comm__head">
            <span className="led led--on led--blink" />
            <strong>{t('inviteReceivedTitle')}</strong>
            <span className="num muted">{formatCountdown(entry.invitation.expiresAt, now)}</span>
          </div>
          <p className="comm__body">{t('inviteReceivedBody', entry.inviter.username)}</p>
          <div className="comm__actions">
            <button type="button" className="btn btn--solid btn--small" onClick={() => respondInvite(entry, true)}>
              {t('btnAccept')}
            </button>
            <button type="button" className="btn btn--danger btn--small" onClick={() => respondInvite(entry, false)}>
              {t('btnDecline')}
            </button>
          </div>
        </div>
      ))}

      {outgoing && (
        <div className="comm comm--outgoing">
          <div className="comm__head">
            <span className="led led--on led--blink" />
            <strong>{t('inviteSentTitle')}</strong>
            <span className="num muted">{formatCountdown(outgoing.expiresAt, now)}</span>
          </div>
          <p className="comm__body">{t('inviteSentBody', outgoing.inviteeName)}</p>
        </div>
      )}

      {notices.map((n) => (
        <button
          key={n.id}
          type="button"
          className="comm comm--notice"
          data-tone={n.tone}
          onClick={() => dismissNotice(n.id)}
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}
