import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import fr from '../locales/fr.json';
import en from '../locales/en.json';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    supportedLngs: ['en', 'fr'],
    lng: localStorage.getItem('i18nextLng') || import.meta.env.VITE_DEFAULT_LOCALE || 'en',
    fallbackLng: 'en',
    defaultNS: 'translation',
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
