import type { Lang } from './locales';

// Only applied to AI fighters, never to player-entered nicknames.
const NAMES: Record<string, [string, string]> = {
  'Бот-хост Арес': ['Bot host Ares', 'المضيف الآلي آريس'],
  'Бот-хост Афина': ['Bot host Athena', 'المضيف الآلي أثينا'],
  'Бот-хост Аполлон': ['Bot host Apollo', 'المضيف الآلي أبولو'],
  'Бот-хост Артемида': ['Bot host Artemis', 'المضيف الآلي أرتميس'],
  'Бот-хост Гермес': ['Bot host Hermes', 'المضيف الآلي هيرميس'],
  'Бот-хост Афродита': ['Bot host Aphrodite', 'المضيف الآلي أفروديت'],
  'Сэр Роланд': ['Sir Roland', 'السير رولاند'], 'Сир Гарет': ['Sir Gareth', 'السير غاريث'],
  'Корвус Двуклинок': ['Corvus Twinblade', 'كورفوس ذو النصلين'], 'Весп Вихрь': ['Vesp Whirlwind', 'فيسب الدوامة'],
  'Ульрих Пика': ['Ulrich Pike', 'أولريش الرمح'], 'Лотар Копейщик': ['Lothar Spearman', 'لوثار الرماح'],
  'Торвальд Молот': ['Torvald Hammer', 'تورفالد المطرقة'], 'Брат Гром': ['Brother Thunder', 'الأخ الرعد'],
  'Хальвар Лютый': ['Halvar the Fierce', 'هالفار الشرس'], 'Рагнар Секира': ['Ragnar Axe', 'راغنار الفأس'],
  'Этьен де Валь': ['Étienne de Val', 'إتيان دي فال'], 'Сир Люциан': ['Sir Lucian', 'السير لوسيان'],
  'Лорд Мортис': ['Lord Mortis', 'اللورد مورتيس'], 'Страж Склепа': ['Crypt Guardian', 'حارس القبو'],
  'Тень Жнеца': ['Reaper’s Shadow', 'ظل الحاصد'], 'Малакор Серп': ['Malakor Scythe', 'مالاكور المنجل'],
  'Центурион Праха': ['Ash Centurion', 'قائد الرماد'], 'Кратос Костяной': ['Kratos Bone', 'كراتوس العظمي'],
};
export function botDisplayName(name: string, lang: Lang): string {
  if (lang === 'ru') return name;
  const match = name.match(/^(.*?)( \d+)?$/);
  const translated = match && NAMES[match[1]];
  return translated ? translated[lang === 'ar' ? 1 : 0] + (match?.[2] ?? '') : name;
}
