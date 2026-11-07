import type { Language } from '@recoveros/shared';
import { usePreferences } from '@/store/preferences';

/**
 * Lightweight UI string catalogue. Clinical content is never machine-translated here —
 * clinician-approved text is shown as written (optionally with an AI-assisted,
 * clearly-labelled plain-language explanation).
 *
 * NOTE: Hausa and Nigerian Pidgin UI strings require review by qualified translators
 * before production release.
 */
const en = {
  'home.today': "Today's progress",
  'home.next': 'Up next',
  'home.checkin': 'Daily check-in',
  'home.checkinCta': 'Start check-in',
  'home.help': 'Need help?',
  'home.contact': 'Contact care team',
  'home.reportSymptom': 'Report a symptom',
  'tabs.home': 'Home',
  'tabs.plan': 'My plan',
  'tabs.messages': 'Messages',
  'tabs.profile': 'Profile',
  'tabs.tasks': 'Tasks',
  'emergency.title': 'In an emergency',
  'emergency.call': 'Call hospital emergency line',
  'common.done': 'Done',
  'common.skip': 'Skip',
  'common.submit': 'Submit',
  'common.offlineQueued': 'Saved on your phone. It will be sent automatically when you are back online.',
} as const;

export type MessageKey = keyof typeof en;

const ha: Partial<Record<MessageKey, string>> = {
  'home.today': 'Ci gaban yau',
  'home.next': 'Na gaba',
  'home.checkin': 'Duba lafiya na yau',
  'home.checkinCta': 'Fara duba lafiya',
  'home.help': 'Kana bukatar taimako?',
  'home.contact': 'Tuntuɓi ma’aikatan lafiya',
  'home.reportSymptom': 'Bayar da rahoton alama',
  'tabs.home': 'Gida',
  'tabs.plan': 'Shirina',
  'tabs.messages': 'Saƙonni',
  'tabs.profile': 'Bayanai',
  'tabs.tasks': 'Ayyuka',
  'emergency.title': 'A lokacin gaggawa',
  'emergency.call': 'Kira layin gaggawa na asibiti',
  'common.done': 'An gama',
  'common.skip': 'Tsallake',
  'common.submit': 'Aika',
  'common.offlineQueued': 'An adana a wayarka. Za a aika kai tsaye idan intanet ya dawo.',
};

const pcm: Partial<Record<MessageKey, string>> = {
  'home.today': 'How today dey go',
  'home.next': 'Wetin dey next',
  'home.checkin': 'Daily check-in',
  'home.checkinCta': 'Start check-in',
  'home.help': 'You need help?',
  'home.contact': 'Talk to your care team',
  'home.reportSymptom': 'Tell us wetin dey worry you',
  'emergency.title': 'If na emergency',
  'emergency.call': 'Call hospital emergency line',
  'common.done': 'I don do am',
  'common.offlineQueued': 'E don save for your phone. E go send by itself when network come back.',
};

const catalogues: Record<Language, Partial<Record<MessageKey, string>>> = { en, ha, pcm };

export function translate(lang: Language, key: MessageKey): string {
  return catalogues[lang][key] ?? en[key];
}

export function useT() {
  const lang = usePreferences((s) => s.language);
  return (key: MessageKey) => translate(lang, key);
}
