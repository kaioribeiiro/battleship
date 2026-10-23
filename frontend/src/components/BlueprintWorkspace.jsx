import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../lib/preferences.js';

export default function BlueprintWorkspace({ children }) {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <div className="workspace">
      <div className="ruler ruler--top" aria-hidden="true" />
      <div className="ruler ruler--left" aria-hidden="true" />
      {children}
      <div className="title-block" aria-hidden="true">
        <span>{t('brandTitle')}</span>
        <span>{t('revLabel')}</span>
        <span>{user ? `Op: ${user.username}` : t('sheetFooter')}</span>
      </div>
    </div>
  );
}
