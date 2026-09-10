import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import fr from './fr.json';
import en from './en.json';

const i18n = new I18n({ fr, en });

i18n.defaultLocale = 'fr';
i18n.enableFallback = true;
i18n.locale = getLocales()[0]?.languageCode ?? 'fr';

export default i18n;
