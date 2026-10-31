import type { KnightClassId } from './classes';
import type { Lang } from './locales';

// Fictional casual nicknames, not claims about actual users.
export const BOT_NICKNAMES: Record<KnightClassId, string[]> = {
  sword: ['Макс_777', 'Санёк'],
  dual: ['Котик', 'Ninja_Pro'],
  spear: ['Артём', 'Лис'],
  hammer: ['Денис', 'Богатырь'],
  barbarian: ['Волк', 'Игрок_777'],
  duelist: ['Саша', 'Lucky'],
  skeleton_knight: ['Кирилл', 'Рыцарь'],
  skeleton_reaper: ['Тёмный', 'Егор'],
  skeleton_berserker: ['Тимур', 'Миша'],
};

// Only applied to AI fighters, never to player-entered nicknames.
const NAMES: Record<string, [string, string]> = {
  'Макс_777': ['Max_777', 'ماكس_777'], 'Санёк': ['Sanyok', 'سانيوك'],
  'Котик': ['Kitty', 'كيتي'], 'Артём': ['Artem', 'أرتيوم'],
  'Лис': ['Fox', 'فوكس'], 'Денис': ['Denis', 'دينيس'],
  'Богатырь': ['Bogatýr', 'بوغاتير'], 'Волк': ['Wolf', 'وولف'],
  'Игрок_777': ['Player_777', 'لاعب_777'], 'Саша': ['Sasha', 'ساشا'],
  'Кирилл': ['Kirill', 'كيريل'], 'Рыцарь': ['Knight', 'الفارس'],
  'Тёмный': ['Dark', 'دارك'], 'Егор': ['Egor', 'يغور'],
  'Тимур': ['Timur', 'تيمور'], 'Миша': ['Misha', 'ميشا'],
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
  const prefix = name.startsWith('🤖 ') ? '🤖 ' : '';
  const match = name.slice(prefix.length).match(/^(.*?)( \d+)?$/);
  const translated = match && NAMES[match[1]];
  return translated ? prefix + translated[lang === 'ar' ? 1 : 0] + (match?.[2] ?? '') : name;
}
