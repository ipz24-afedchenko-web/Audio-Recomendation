import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';

const STORAGE_KEY = 'app-language';

const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
const initial = saved || 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const LANGUAGE_KEY = STORAGE_KEY;
export default i18n;
