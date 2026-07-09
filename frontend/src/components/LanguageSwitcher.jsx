import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const toggle = () => i18n.changeLanguage(i18n.language === 'uk' ? 'en' : 'uk');
  return (
    <button className="btn btn--sm btn--ghost" onClick={toggle}>
      {i18n.language === 'uk' ? 'EN' : 'UK'}
    </button>
  );
}