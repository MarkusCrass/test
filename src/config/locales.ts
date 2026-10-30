import { UI_LOCALES } from './uiLocales';
import type { KnightClassId } from './classes';

export type Lang = 'ru' | 'en' | 'tr' | 'es' | 'ar';

export interface LangMeta {
  code: Lang;
  name: string; // name in its own language
  rtl: boolean;
}

export const LANGS: LangMeta[] = [
  { code: 'ru', name: 'Русский', rtl: false },
  { code: 'en', name: 'English', rtl: false },
  { code: 'tr', name: 'Türkçe', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'ar', name: 'العربية', rtl: true },
];

export const DEFAULT_LANG: Lang = 'ru';

/** All UI strings keyed by id, translated per language. */
export const LOCALES: Record<string, Record<Lang, string>> = {
  ...UI_LOCALES,
  rotateHint: { ru: "Потяните мышью для обзора 360°", en: "Drag to rotate 360°", tr: "360° döndürmek için sürükleyin", es: "Arrastra para girar 360°", ar: "اسحب للتدوير 360°" },
  backArena: { ru: "Назад в Арену", en: "Back to arena", tr: "Arenaya dön", es: "Volver a la arena", ar: "العودة إلى الساحة" },
  fightNow: { ru: "Сразу начать дуэль", en: "Start duel now", tr: "Düelloyu başlat", es: "Iniciar duelo", ar: "ابدأ المبارزة" },
  mpTitle: { ru: "Сетевая арена", en: "Online arena", tr: "Çevrimiçi arena", es: "Arena en línea", ar: "الساحة الجماعية" },
  mpSubtitle: { ru: "До 5 живых игроков в матче · Серверная физика 60 Гц", en: "Up to 5 players · Server physics at 60 Hz", tr: "En fazla 5 oyuncu · 60 Hz sunucu fiziği", es: "Hasta 5 jugadores · Física de servidor a 60 Hz", ar: "حتى 5 لاعبين · فيزياء الخادم 60 هرتز" },
  mpName: { ru: "Ваш никнейм", en: "Your nickname", tr: "Takma adınız", es: "Tu apodo", ar: "اسمك المستعار" },
  mpSelectedHero: { ru: "Выбранный герой", en: "Selected hero", tr: "Seçili kahraman", es: "Héroe seleccionado", ar: "البطل المختار" },
  mpQuickDesc: { ru: "Мгновенный вход в открытую комнату", en: "Join an open room instantly", tr: "Açık bir odaya hemen katıl", es: "Entrar a una sala abierta", ar: "انضم فورًا إلى غرفة مفتوحة" },
  mpCreateTitle: { ru: "Создать свою комнату", en: "Create your room", tr: "Oda oluştur", es: "Crear tu sala", ar: "إنشاء غرفتك" },
  mpFillBots: { ru: "Дополнить ботами ИИ до 5 бойцов", en: "Fill up to 5 fighters with bots", tr: "5 savaşçıya kadar bot ekle", es: "Completar hasta 5 luchadores con bots", ar: "أكمل العدد إلى 5 بالمقاتلين الآليين" },
  mpPublic: { ru: "Показывать в открытом списке", en: "Show in public list", tr: "Genel listede göster", es: "Mostrar en la lista pública", ar: "إظهار في القائمة العامة" },
  mpJoin: { ru: "Войти", en: "Join", tr: "Katıl", es: "Entrar", ar: "انضم" },
  mpOpenRooms: { ru: "Открытые комнаты", en: "Public rooms", tr: "Açık odalar", es: "Salas públicas", ar: "الغرف العامة" },
  mpRefresh: { ru: "Обновить", en: "Refresh", tr: "Yenile", es: "Actualizar", ar: "تحديث" },
  mpShare: { ru: "Отправьте 4-буквенный код друзьям для мгновенного входа", en: "Share the 4-letter code with friends to join", tr: "Katılmaları için 4 harfli kodu arkadaşlarınla paylaş", es: "Comparte el código de 4 letras con tus amigos", ar: "شارك الرمز المكون من 4 أحرف مع أصدقائك" },
  mpBots: { ru: "Боты ИИ", en: "AI bots", tr: "Yapay zekâ botları", es: "Bots de IA", ar: "روبوتات" },
  mpPublicLabel: { ru: "Публичная", en: "Public", tr: "Herkese açık", es: "Pública", ar: "عامة" },
  mpChangeHero: { ru: "Сменить героя:", en: "Change hero:", tr: "Kahraman değiştir:", es: "Cambiar héroe:", ar: "تغيير البطل:" },
  pauseSub: { ru: "Выберите действие для продолжения", en: "Choose an action to continue", tr: "Devam etmek için bir işlem seçin", es: "Elige una acción para continuar", ar: "اختر إجراءً للمتابعة" },
  controlsBadge: { ru: "Справка по клавишам", en: "Key guide", tr: "Tuş rehberi", es: "Guía de teclas", ar: "دليل المفاتيح" },
  controlsTitle: { ru: "Управление в бою", en: "Combat controls", tr: "Savaş kontrolleri", es: "Controles de combate", ar: "التحكم في القتال" },
  controlMove: { ru: "Перемещение", en: "Movement", tr: "Hareket", es: "Movimiento", ar: "الحركة" },
  controlMoveDesc: { ru: "Свободное движение + Shift для спринта", en: "Move freely + Shift to sprint", tr: "Serbest hareket + koşmak için Shift", es: "Movimiento libre + Shift para correr", ar: "تحرك بحرية + Shift للركض" },
  controlCamera: { ru: "ММО-камера 360° и Зум", en: "360° camera and zoom", tr: "360° kamera ve yakınlaştırma", es: "Cámara de 360° y zoom", ar: "كاميرا 360° والتكبير" },
  controlCameraDesc: { ru: "Полное вращение вокруг героя, взгляд вверх/вниз и отдаление", en: "Rotate around the hero, look up/down and zoom", tr: "Kahramanın etrafında dön, yukarı/aşağı bak ve yakınlaştır", es: "Gira alrededor del héroe, mira arriba/abajo y ajusta el zoom", ar: "دور حول البطل وانظر للأعلى والأسفل وكبّر" },
  controlLook: { ru: "Свободный обзор и Прицел", en: "Free look and aim", tr: "Serbest bakış ve nişan", es: "Vista libre y apuntar", ar: "النظر الحر والتصويب" },
  controlLookDesc: { ru: "Обзор 360° на бегу (СКМ/V) · Свободный прицел по экрану (~)", en: "360° look while moving (middle mouse/V) · Free aim (~)", tr: "Hareket ederken 360° bakış (orta fare/V) · Serbest nişan (~)", es: "Vista de 360° al moverse (botón central/V) · Apuntado libre (~)", ar: "نظرة 360° أثناء الحركة (الزر الأوسط/V) · تصويب حر (~)" },
  controlAttack: { ru: "Комбо и Пробой", en: "Combo and heavy attack", tr: "Kombo ve güçlü saldırı", es: "Combo y ataque fuerte", ar: "الضربات المتتالية والهجوم القوي" },
  controlAttackDesc: { ru: "Мгновенная серия ударов и заряженный пробой в точку прицела", en: "Quick combo and charged attack at the aim point", tr: "Hızlı kombo ve nişan noktasına yüklü saldırı", es: "Combo rápido y ataque cargado al apuntar", ar: "ضربات سريعة وهجوم مشحون نحو الهدف" },
  controlBlock: { ru: "Блок и парирование", en: "Block and parry", tr: "Blok ve savuşturma", es: "Bloqueo y parada", ar: "الصد والتصدي" },
  controlBlockDesc: { ru: "Вовремя нажатый блок оглушает врага", en: "A well-timed block stuns the enemy", tr: "Zamanında blok düşmanı sersemletir", es: "Un bloqueo a tiempo aturde al enemigo", ar: "الصد في الوقت المناسب يصعق العدو" },
  controlSkills: { ru: "Активные навыки", en: "Active skills", tr: "Aktif yetenekler", es: "Habilidades activas", ar: "المهارات النشطة" },
  controlSkillsDesc: { ru: "Три уникальных приёма каждого героя", en: "Three unique skills for each hero", tr: "Her kahramanın üç eşsiz yeteneği", es: "Tres habilidades únicas por héroe", ar: "ثلاث مهارات فريدة لكل بطل" },
  controlJump: { ru: "Прыжок", en: "Jump", tr: "Zıpla", es: "Saltar", ar: "القفز" },
  controlJumpDesc: { ru: "Прыжки через преграды и двухуровневый мост", en: "Jump over obstacles and across the two-level bridge", tr: "Engellerin ve iki katlı köprünün üzerinden atla", es: "Salta obstáculos y el puente de dos niveles", ar: "اقفز فوق العوائق والجسر ذي المستويين" },
  controlDodge: { ru: "Рывок / Толчок", en: "Dodge / Push", tr: "Kaçın / İt", es: "Esquivar / Empujar", ar: "مراوغة / دفع" },
  controlDodgeDesc: { ru: "Резкое уклонение или силовой толчок щитом", en: "Quick dodge or powerful shield push", tr: "Hızlı kaçınma veya güçlü kalkan itişi", es: "Esquiva rápida o empujón con el escudo", ar: "مراوغة سريعة أو دفع قوي بالدرع" },
  ok: { ru: "Понятно", en: "Got it", tr: "Anladım", es: "Entendido", ar: "فهمت" },
  resPlace: { ru: "Место", en: "Place", tr: "Sıra", es: "Puesto", ar: "المركز" },
  resFighter: { ru: "Боец", en: "Fighter", tr: "Savaşçı", es: "Luchador", ar: "المقاتل" },
  resHero: { ru: "Герой", en: "Hero", tr: "Kahraman", es: "Héroe", ar: "البطل" },
  resStatus: { ru: "Статус", en: "Status", tr: "Durum", es: "Estado", ar: "الحالة" },
  resKills: { ru: "Фраги", en: "Kills", tr: "Skor", es: "Bajas", ar: "الإقصاءات" },
  resDamage: { ru: "Урон", en: "Damage", tr: "Hasar", es: "Daño", ar: "الضرر" },
  backMenu: { ru: "В меню", en: "Menu", tr: "Menü", es: "Menú", ar: "القائمة" },
  changeHero: { ru: "Сменить героя", en: "Change hero", tr: "Kahraman değiştir", es: "Cambiar héroe", ar: "تغيير البطل" },
  playAgain: { ru: "Играть снова!", en: "Play again!", tr: "Tekrar oyna!", es: "¡Jugar de nuevo!", ar: "العب مجددًا!" },
  adBadge: { ru: "Реклама", en: "Advertisement", tr: "Reklam", es: "Publicidad", ar: "إعلان" },
  settingsBadge: { ru: "Параметры", en: "Options", tr: "Seçenekler", es: "Opciones", ar: "الخيارات" },
  settingsThemeFull: { ru: "Покрытие и стиль арены", en: "Arena surface and style", tr: "Arena zemini ve stili", es: "Superficie y estilo de la arena", ar: "سطح الساحة ونمطها" },
  qualityUltra: { ru: "Ультра", en: "Ultra", tr: "Ultra", es: "Ultra", ar: "فائق" },
  qualityHigh: { ru: "Высокое", en: "High", tr: "Yüksek", es: "Alto", ar: "عالٍ" },
  qualityLow: { ru: "Быстрое", en: "Fast", tr: "Hızlı", es: "Rápido", ar: "سريع" },
  renderStyle: { ru: "Стиль рендера", en: "Render style", tr: "Görüntüleme stili", es: "Estilo de renderizado", ar: "نمط العرض" },
  statHealth: { ru: "Здоровье", en: "Health", tr: "Can", es: "Salud", ar: "الصحة" },
  statSpeed: { ru: "Скорость", en: "Speed", tr: "Hız", es: "Velocidad", ar: "السرعة" },
  statAttack: { ru: "Сила удара", en: "Attack", tr: "Saldırı", es: "Ataque", ar: "الهجوم" },
  statDefense: { ru: "Защита", en: "Defense", tr: "Savunma", es: "Defensa", ar: "الدفاع" },
  statReach: { ru: "Дальность", en: "Reach", tr: "Menzil", es: "Alcance", ar: "المدى" },
  uniqueSkills: { ru: "Уникальные навыки [1], [2] и [3]", en: "Unique skills [1], [2] and [3]", tr: "Özel yetenekler [1], [2] ve [3]", es: "Habilidades únicas [1], [2] y [3]", ar: "مهارات فريدة [1] و[2] و[3]" },
  rosterTitle: { ru: "Бойцы на арене", en: "Fighters in the arena", tr: "Arenadaki savaşçılar", es: "Luchadores en la arena", ar: "المقاتلون في الساحة" },
  spectating: { ru: "Вы выбыли · Режим наблюдения", en: "Eliminated · Spectator mode", tr: "Elendiniz · İzleyici modu", es: "Eliminado · Modo espectador", ar: "تم إقصاؤك · وضع المشاهدة" },
  specPrevious: { ru: "Пред. [Q]", en: "Previous [Q]", tr: "Önceki [Q]", es: "Anterior [Q]", ar: "السابق [Q]" },
  specNext: { ru: "След. [E]", en: "Next [E]", tr: "Sonraki [E]", es: "Siguiente [E]", ar: "التالي [E]" },
  specRestart: { ru: "Снова в бой", en: "Fight again", tr: "Tekrar savaş", es: "Volver a luchar", ar: "قاتل مجددًا" },
  lastSurvivor: { ru: 'Последний выживший', en: 'Last survivor', tr: 'Son hayatta kalan', es: 'Último superviviente', ar: 'الناجي الأخير' },
  matchFinished: { ru: 'Матч завершён', en: 'Match finished', tr: 'Maç sona erdi', es: 'Partida terminada', ar: 'انتهت المباراة' },
  // ===== App / Brand =====
  brand: { ru: 'Knights Last Standing', en: 'Knights Last Standing', tr: 'Knightler Son Duran', es: 'Caballeros Último en Pie', ar: 'Knights Last Standing' },
  eyebrowArena: { ru: 'Выберите режим боя', en: 'Choose battle mode', tr: 'Savaş modu seçin', es: 'Elige modo de batalla', ar: 'اختر نمط القتال' },
  headlineReady: { ru: 'Готовы к схватке?', en: 'Ready to fight?', tr: 'Savaşmaya hazır mısınız?', es: '¿Listo para pelear?', ar: 'مستعد للقتال؟' },

  // ===== Nav =====
  navArena: { ru: 'Арена', en: 'Arena', tr: 'Arena', es: 'Arena', ar: 'الساحة' },
  navHeroes: { ru: 'Герои', en: 'Heroes', tr: 'Kahramanlar', es: 'Héroes', ar: 'الأبطال' },
  navOnline: { ru: 'Онлайн', en: 'Online', tr: 'Çevrimiçi', es: 'En línea', ar: 'عبر الإنترنت' },
  navControls: { ru: 'Управление', en: 'Controls', tr: 'Kontroller', es: 'Controles', ar: 'التحكم' },
  navSettings: { ru: 'Настройки', en: 'Settings', tr: 'Ayarlar', es: 'Ajustes', ar: 'الإعدادات' },
  navShop: { ru: 'Магазин', en: 'Shop', tr: 'Mağaza', es: 'Tienda', ar: 'المتجر' },
  navLanguage: { ru: 'Язык', en: 'Language', tr: 'Dil', es: 'Idioma', ar: 'اللغة' },

  // ===== Coins =====
  coinLabel: { ru: 'Монеты:', en: 'Coins:', tr: 'Altın:', es: 'Monedas:', ar: 'العملات:' },
  coinPrice: { ru: 'монет', en: 'coins', tr: 'altın', es: 'monedas', ar: 'عملة' },
  hubHeroPrice: { ru: '{price} монет', en: '{price} coins', tr: '{price} coin', es: '{price} monedas', ar: '{price} عملة' },

  // ===== Mode cards =====
  modeFfaName: { ru: 'Королевская схватка', en: 'Royal Rumble', tr: 'Krallık Savaşı', es: 'Batalla Real', ar: 'معركة الملك' },
  modeFfaTag: { ru: '5 бойцов', en: '5 fighters', tr: '5 savaşçı', es: '5 luchadores', ar: '5 مقاتلين' },
  modeFfaDesc: { ru: 'Каждый сам за себя на двухуровневом мосту цитадели', en: 'Every fighter for themselves on the citadel bridge', tr: 'Her savaşçı kendi için, kale köprüsünde', es: 'Cada luchador por sí mismo en el puente de la ciudadela', ar: 'كل مقاتل من أجل نفسه على جسر القلعة' },
  modeDuelName: { ru: 'Дуэль 1 на 1', en: 'Duel 1v1', tr: '1v1 Düello', es: 'Duelo 1 contra 1', ar: 'مبارزة 1 ضد 1' },
  modeDuelTag: { ru: 'Тренировка', en: 'Training', tr: 'Antrenman', es: 'Entrenamiento', ar: 'تدريب' },
  modeDuelDesc: { ru: 'Чистая дуэль против ИИ для отработки парирований', en: 'Pure duel against AI to practice parries', tr: 'Savuşturma çalışmak için yapay zekâya karşı düello', es: 'Duelo puro contra IA para practicar paradas', ar: 'مبارزة خالصة ضد الذكاء الاصطناعي للتدرب على التصدي' },
  modeOnlineName: { ru: 'Сетевая игра', en: 'Online Play', tr: 'Çevrimiçi Oyun', es: 'Juego en línea', ar: 'لعب جماعي' },
  modeOnlineTag: { ru: 'До 5 игроков', en: 'Up to 5 players', tr: 'En fazla 5 oyuncu', es: 'Hasta 5 jugadores', ar: 'حتى 5 لاعبين' },
  modeOnlineDesc: { ru: 'Быстрый поиск матча, список залов и вход по коду друга', en: 'Quick matchmaking, room list and friend code entry', tr: 'Hızlı eşleşme, oda listesi ve arkadaş kodu girişi', es: 'Búsqueda rápida, lista de salas y entrada con código de amigo', ar: 'البحث السريع عن مباراة، قائمة الغرف ودخول رمز الصديق' },

  // ===== Hero strip =====
  heroYourHero: { ru: 'Ваш герой', en: 'Your hero', tr: 'Kahramanınız', es: 'Tu héroe', ar: 'بطلُك' },
  heroInspect: { ru: 'Навыки и характеристики', en: 'Skills and stats', tr: 'Yetenekler ve İstatistikler', es: 'Habilidades y estadísticas', ar: 'المهارات والإحصائيات' },

  // ===== Play button =====
  playFight: { ru: 'В БОЙ!', en: 'FIGHT!', tr: 'SAVAŞ!', es: '¡PELEA!', ar: 'قتال!' },
  playBuy: { ru: 'Купить за {price}', en: 'Buy for {price}', tr: '{price} için satın al', es: 'Comprar por {price}', ar: 'اشترِ بـ {price}' },

  // ===== Results =====
  resBadge: { ru: 'Итоги матча', en: 'Match results', tr: 'Maç sonuçları', es: 'Resultados del partido', ar: 'نتائج المباراة' },
  resVictory: { ru: 'Победа на арене!', en: 'Victory in the arena!', tr: 'Arenada zafer!', es: '¡Victoria en la arena!', ar: 'انتصار في الساحة!' },
  resWinner: { ru: 'Победитель: {name}', en: 'Winner: {name}', tr: 'Kazanan: {name}', es: 'Ganador: {name}', ar: 'الفائز: {name}' },
  resDraw: { ru: 'Ничья на арене', en: 'Draw in the arena', tr: 'Arenada berabere', es: 'Empate en la arena', ar: 'تعادل في الساحة' },
  resTimeUp: { ru: 'Время раунда вышло', en: 'Round time expired', tr: 'Süre doldu', es: 'Tiempo agotado', ar: 'انتهت وقت الجولة' },
  resDuration: { ru: 'Длительность боя: {sec} сек.', en: 'Battle duration: {sec} sec.', tr: 'Savaş süresi: {sec} saniye', es: 'Duración de la batalla: {sec} seg.', ar: 'مدة المعركة: {sec} ثانية.' },
  resCoinsEarned: { ru: 'Заработано монет: {coins}', en: 'Coins earned: {coins}', tr: 'Kazanan altın: {coins}', es: 'Monedas ganadas: {coins}', ar: 'العملات المكتسبة: {coins}' },
  resPlace1: { ru: 'победа', en: 'victory', tr: 'zafer', es: 'victoria', ar: 'انتصار' },
  resPlace2: { ru: '2-е место', en: '2nd place', tr: '2. sıra', es: '2.º puesto', ar: 'المركز الثاني' },
  resPlace3: { ru: '3-е место', en: '3rd place', tr: '3. sıra', es: '3.er puesto', ar: 'المركز الثالث' },
  resPlaceOther: { ru: 'место', en: 'place', tr: 'sıra', es: 'puesto', ar: 'المركز' },
  resultsCoinsRow: { ru: 'Заработано монет: {coins} ({place}). ', en: 'Coins earned: {coins} ({place}). ', tr: 'Kazanılan para: {coins} ({place}). ', es: 'Monedas ganadas: {coins} ({place}). ', ar: 'تم كسب العملات: {coins} ({place}). ' },
  resultsPlace1: { ru: 'победа', en: 'victory', tr: 'galibiyet', es: 'victoria', ar: 'انتصار' },
  resultsPlace2: { ru: '2-е место', en: '2nd place', tr: '2. yer', es: '2.º puesto', ar: 'المركز الثاني' },
  resultsPlace3: { ru: '3-е место', en: '3rd place', tr: '3. yer', es: '3.er puesto', ar: 'المركز الثالث' },
  resultsPlaceOther: { ru: 'место', en: 'place', tr: 'yer', es: 'puesto', ar: 'المركز' },
  resultsTimeUp: { ru: 'Время раунда вышло — чемпион определён по запасу здоровья и урону.', en: 'Round time expired — champion decided by health and damage remaining.', tr: 'Round süresi doldu — şampiyon kalan can ve hasar ile belirlendi.', es: 'Tiempo de ronda agotado — campeón decidido por salud y daño restantes.', ar: 'انتهت وقت الجولة — البطل يحدد من خلال الصحة المتبقية والضرر.' },
  resultsDuration: { ru: 'Длительность боя: {secs} сек.', en: 'Battle duration: {secs} sec.', tr: 'Savaş süresi: {secs} saniye.', es: 'Duración de la batalla: {secs} seg.', ar: 'مدة المعركة: {secs} ثانية.' },
  resultsActiveRoom: { ru: ' · Комната активна', en: ' · Room active', tr: ' · Oda aktif', es: ' · Sala activa', ar: ' · الغرفة نشطة' },

  // ===== Ad =====
  adTitle: { ru: 'Смотрите рекламу', en: 'Watch ad', tr: 'Reklam izleyin', es: 'Ver anuncio', ar: 'شاهد الإعلان' },
  adSub: { ru: 'Получите +10 монет за просмотр', en: 'Get +10 coins for watching', tr: 'İzlemek için +10 altın kazanın', es: 'Obtén +10 monedas al ver', ar: 'احصل على +10 عملات عند المشاهدة' },
  adCountdownLabel: { ru: 'Реклама пойдёт через', en: 'Ad starts in', tr: 'Reklam başlıyor', es: 'El anuncio comienza en', ar: 'يبدأ الإعلان خلال' },
  adRewardBtn: { ru: 'Получить +10 монет', en: 'Get +10 coins', tr: '+10 altın alın', es: 'Obtener +10 monedas', ar: 'احصل على +10 عملات' },
  adCloseBtn: { ru: 'Закрыть', en: 'Close', tr: 'Kapat', es: 'Cerrar', ar: 'إغلاق' },

  adUnavailable: { ru: 'Реклама недоступна или просмотр не завершён. Монеты не начислены.', en: 'The ad is unavailable or was not completed. No coins were awarded.', tr: 'Reklam kullanılamıyor veya tamamlanmadı. Altın verilmedi.', es: 'El anuncio no está disponible o no se completó. No se otorgaron monedas.', ar: 'الإعلان غير متاح أو لم يكتمل. لم تُمنح عملات.' },
  aboutTitle: { ru: 'Об игре и лицензии', en: 'About and licenses', tr: 'Oyun ve lisanslar', es: 'Acerca del juego y licencias', ar: 'حول اللعبة والتراخيص' },
  aboutIntro: { ru: 'Авторы ресурсов, используемые библиотеки и полные тексты лицензий.', en: 'Asset creators, libraries and full license notices.', tr: 'Varlık oluşturucuları, kütüphaneler ve tam lisans metinleri.', es: 'Creadores de recursos, bibliotecas y textos completos de licencias.', ar: 'منشئو الموارد والمكتبات ونصوص التراخيص الكاملة.' },
  aboutLoading: { ru: 'Загрузка…', en: 'Loading…', tr: 'Yükleniyor…', es: 'Cargando…', ar: 'جار التحميل…' },
  aboutError: { ru: 'Не удалось загрузить текст лицензии.', en: 'Could not load the license text.', tr: 'Lisans metni yüklenemedi.', es: 'No se pudo cargar el texto de la licencia.', ar: 'تعذر تحميل نص الترخيص.' },
  cloudConflictTitle: { ru: 'Выберите сохранение', en: 'Choose a save', tr: 'Kayıt seçin', es: 'Elige una partida', ar: 'اختر ملف الحفظ' },
  cloudConflictText: { ru: 'На этом устройстве и в облаке есть разные изменения. Выберите, какой прогресс продолжить. Другая версия останется в резервной копии на устройстве.', en: 'This device and the cloud contain different changes. Choose which progress to continue. The other version remains backed up on this device.', tr: 'Bu cihaz ve bulutta farklı değişiklikler var. Devam etmek için bir kayıt seçin. Diğer sürüm bu cihazda yedeklenir.', es: 'Este dispositivo y la nube tienen cambios diferentes. Elige qué progreso continuar. La otra versión queda guardada en este dispositivo.', ar: 'توجد تغييرات مختلفة على هذا الجهاز وفي السحابة. اختر التقدم الذي تريد متابعته. ستبقى النسخة الأخرى محفوظة على الجهاز.' },
  cloudChooseRemote: { ru: 'Использовать облако', en: 'Use cloud save', tr: 'Bulut kaydını kullan', es: 'Usar partida en la nube', ar: 'استخدام الحفظ السحابي' },
  cloudChooseLocal: { ru: 'Использовать это устройство', en: 'Use this device', tr: 'Bu cihazı kullan', es: 'Usar este dispositivo', ar: 'استخدام هذا الجهاز' },
  // ===== Settings =====
  settingsTitle: { ru: 'Настройки игры', en: 'Game Settings', tr: 'Oyun Ayarları', es: 'Configuración del juego', ar: 'إعدادات اللعبة' },
  settingsVol: { ru: 'Громкость звука', en: 'Sound volume', tr: 'Ses seviyesi', es: 'Volumen de sonido', ar: 'مستوى الصوت' },
  settingsSens: { ru: 'Чувствительность мыши', en: 'Mouse sensitivity', tr: 'Fare hassasiyeti', es: 'Sensibilidad del ratón', ar: 'حساسية الماوس' },
  settingsTheme: { ru: 'Покрытие арены', en: 'Arena surface', tr: 'Arena zemini', es: 'Superficie de arena', ar: 'سطح الساحة' },
  settingsQuality: { ru: 'Качество графики', en: 'Graphics quality', tr: 'Grafik kalitesi', es: 'Calidad gráfica', ar: 'جودة الرسومات' },
  settingsDebug: { ru: 'Показывать сектора ударов и цели ИИ [F3]', en: 'Show hit sectors and AI targets [F3]', tr: 'Vuruş bölgeleri ve AI hedeflerini göster [F3]', es: 'Mostrar sectores de golpe y objetivos de IA [F3]', ar: 'إظهار قطاعات الضرب وأهداف الذكاء الاصطناعي [F3]' },
  settingsDone: { ru: 'Готово', en: 'Done', tr: 'Tamam', es: 'Listo', ar: 'تم' },

  // ===== Pause =====
  pauseBadge: { ru: 'Матч на паузе', en: 'Match paused', tr: 'Maç durduruldu', es: 'Partido en pausa', ar: 'المباراة متوقفة' },
  pauseTitle: { ru: 'Пауза', en: 'Pause', tr: 'Duraklat', es: 'Pausa', ar: 'إيقاف مؤقت' },
  pauseResume: { ru: 'Продолжить бой', en: 'Resume fight', tr: 'Savaşmaya devam et', es: 'Reanudar pelea', ar: 'استئناف القتال' },
  pauseRestart: { ru: 'Начать заново', en: 'Restart match', tr: 'Maçı yeniden başlat', es: 'Reiniciar partido', ar: 'إعادة تشغيل المباراة' },
  pauseSettings: { ru: 'Настройки', en: 'Settings', tr: 'Ayarlar', es: 'Ajustes', ar: 'الإعدادات' },
  pauseControls: { ru: 'Управление', en: 'Controls', tr: 'Kontroller', es: 'Controles', ar: 'التحكم' },
  pauseMenu: { ru: 'Выйти в меню', en: 'Exit to menu', tr: 'Menüye dön', es: 'Salir al menú', ar: 'الخروج إلى القائمة' },

  // ===== Multiplayer =====
  mpOnline: { ru: 'Онлайн', en: 'Online', tr: 'Çevrimiçi', es: 'Conectado', ar: 'متصل' },
  mpConnecting: { ru: 'Подключение...', en: 'Connecting...', tr: 'Bağlanıyor...', es: 'Conectando...', ar: 'جاري الاتصال...' },
  mpOffline: { ru: 'Оффлайн', en: 'Offline', tr: 'Çevrimdışı', es: 'Desconectado', ar: 'غير متصل' },
  mpQuickJoin: { ru: 'Быстрый поиск боя', en: 'Quick match', tr: 'Hızlı eşleşme', es: 'Partida rápida', ar: 'مباراة سريعة' },
  mpCreateRoom: { ru: 'Создать комнату', en: 'Create room', tr: 'Oda oluştur', es: 'Crear sala', ar: 'إنشاء غرفة' },
  mpJoinCode: { ru: 'Присоединиться по коду', en: 'Join by code', tr: 'Koda katılın', es: 'Unirse por código', ar: 'انضم عبر الرمز' },
  mpRoomCode: { ru: 'Код комнаты', en: 'Room code', tr: 'Oda kodu', es: 'Código de sala', ar: 'رمز الغرفة' },
  mpCopyCode: { ru: 'Скопировать', en: 'Copy', tr: 'Kopyala', es: 'Copiar', ar: 'نسخ' },
  mpReady: { ru: 'Готов к бою', en: 'Ready to fight', tr: 'Savaşa hazır', es: 'Listo para pelear', ar: 'مستعد للقتال' },
  mpStart: { ru: 'Начать матч!', en: 'Start match!', tr: 'Maçı başlat!', es: '¡Iniciar partido!', ar: 'ابدأ المباراة!' },
  mpLeave: { ru: 'Покинуть комнату', en: 'Leave room', tr: 'Odadan ayrıl', es: 'Salir de la sala', ar: 'مغادرة الغرفة' },
  mpBack: { ru: 'На главную', en: 'Back to menu', tr: 'Menüye dön', es: 'Volver al menú', ar: 'العودة إلى القائمة' },
  mpNoticeCopied: { ru: 'Код комнаты «{code}» скопирован', en: 'Room code "{code}" copied', tr: 'Oda kodu "{code}" kopyalandı', es: 'Código de sala "{code}" copiado', ar: 'تم نسخ رمز الغرفة "{code}"' },

  // ===== Shop (knights) =====
  shopTitle: { ru: 'Герои арены', en: 'Arena Heroes', tr: 'Arena Kahramanları', es: 'Héroes de la arena', ar: 'أبطال الساحة' },
  shopEyebrow: { ru: 'Магазин рыцарей', en: 'Knight Shop', tr: 'Şövalye Mağazası', es: 'Tienda de caballeros', ar: 'متجر الفرسان' },
  shopCoins: { ru: 'Ваши монеты:', en: 'Your coins:', tr: 'Altınlarınız:', es: 'Tus monedas:', ar: 'عملاتك:' },
  shopRare: { ru: 'Редкий', en: 'Rare', tr: 'Nadir', es: 'Raro', ar: 'نادر' },
  shopEpic: { ru: 'Эпический', en: 'Epic', tr: 'Epik', es: 'Épico', ar: 'أسطوري' },
  shopLegendary: { ru: 'Легендарный', en: 'Legendary', tr: 'Efsanevi', es: 'Legendario', ar: 'أسطوري' },
  shopStatusOwned: { ru: 'Владение', en: 'Owned', tr: 'Sahip', es: 'Poseído', ar: 'مملوك' },
  shopStatusActive: { ru: 'Активен', en: 'Active', tr: 'Etkin', es: 'Activo', ar: 'نشط' },
  shopStatusLocked: { ru: 'Заблокирован', en: 'Locked', tr: 'Kilitli', es: 'Bloqueado', ar: 'مقفل' },
  shopBtnEquip: { ru: 'Экипировать', en: 'Equip', tr: 'Kuşan', es: 'Equipar', ar: 'تجهيز' },
  shopBtnBuy: { ru: 'Купить за {price}', en: 'Buy for {price}', tr: '{price} için satın al', es: 'Comprar por {price}', ar: 'اشترِ بـ {price}' },
  shopBtnFree: { ru: 'Забрать бесплатно', en: 'Get free', tr: 'Ücretsiz alın', es: 'Obtener gratis', ar: 'احصل مجاناً' },
  shopBtnActive: { ru: 'Уже экипирован', en: 'Already equipped', tr: 'Zaten kuşanıldı', es: 'Ya equipado', ar: 'مجهز بالفعل' },
  shopBtnNoCoins: { ru: 'Не хватает монет', en: 'Not enough coins', tr: 'Yeterli altın yok', es: 'No hay suficientes monedas', ar: 'لا توجد عملات كافية' },
  shopStatsHp: { ru: 'HP:', en: 'HP:', tr: 'HP:', es: 'HP:', ar: 'نقاط الصحة:' },
  shopStatsSpeed: { ru: 'Скорость:', en: 'Speed:', tr: 'Hız:', es: 'Velocidad:', ar: 'السرعة:' },
  shopStatsDefense: { ru: 'Защита:', en: 'Defense:', tr: 'Savunma:', es: 'Defensa:', ar: 'الدفاع:' },

  // ===== Classes short names =====
  clsSword: { ru: 'Мечник', en: 'Sword Knight', tr: 'Kılıç Şövalyesi', es: 'Caballero de Espada', ar: 'فارس السيف' },
  clsDual: { ru: 'Дуэлянт', en: 'Dual Blades', tr: 'Çift Kılıç', es: 'Espadas Gemelas', ar: 'سيفان' },
  clsSpear: { ru: 'Копейщик', en: 'Spearman', tr: 'Mızrakçı', es: 'Lancero', ar: 'حامل الرمح' },
  clsHammer: { ru: 'Бастион', en: 'Hammer Guardian', tr: 'Çekiç Muhafızı', es: 'Guardián de Martillo', ar: 'حامل المطرقة' },
  clsBarbarian: { ru: 'Варвар', en: 'Barbarian', tr: 'Barbar', es: 'Bárbaro', ar: 'البربري' },
  clsDuelist: { ru: 'Фехтовальщик', en: 'Duelist', tr: 'Duellist', es: 'Duelista', ar: 'المبارز' },
  clsSkKnight: { ru: 'Страж склепа', en: 'Crypt Knight', tr: 'Mahzen Şövalyesi', es: 'Caballero de la Cripta', ar: 'فارس القبر' },
  clsSkReaper: { ru: 'Жнец костей', en: 'Bone Reaper', tr: 'Kemik Azraili', es: 'Segador de Huesos', ar: 'حاصد العظام' },
  clsSkBerserker: { ru: 'Гладиатор', en: 'Gladiator', tr: 'Gladyatör', es: 'Gladiador', ar: 'المصارع' },
};

/** Translate a key with optional {price} / {name} / {coins} / {code} / {sec} replacements. */
export function t(key: string, lang: Lang, params?: Record<string, string | number>): string {
  const langMap = LOCALES[key];
  if (!langMap) {
    return key;
  }
  let text = langMap[lang] ?? langMap[DEFAULT_LANG] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

export function getLangName(code: Lang): string {
  const m = LANGS.find((l) => l.code === code);
  return m ? m.name : code;
}

export function isRtl(lang: Lang): boolean {
  const m = LANGS.find((l) => l.code === lang);
  return Boolean(m?.rtl);
}

export function classDisplayName(classId: KnightClassId, lang: Lang): string {
  const key = ({ sword: 'clsSword', dual: 'clsDual', spear: 'clsSpear', hammer: 'clsHammer', barbarian: 'clsBarbarian', duelist: 'clsDuelist', skeleton_knight: 'clsSkKnight', skeleton_reaper: 'clsSkReaper', skeleton_berserker: 'clsSkBerserker' } as const)[classId];
  const tMap = LOCALES[key];
  if (tMap) {
    return tMap[lang] ?? tMap[DEFAULT_LANG] ?? classId;
  }
  return classId;
}
export function isLanguage(value: unknown): value is Lang {
  return LANGS.some(({ code }) => code === value);
}

export function detectLanguage(value?: string): Lang {
  const code = value?.toLowerCase().split(/[-_]/)[0];
  return isLanguage(code) ? code : DEFAULT_LANG;
}

/** Platform fallback: Russian for be/kk/uk/uz, English for other unsupported languages. */
export function detectYandexLanguage(value?: string): Lang {
  const code = value?.toLowerCase().split(/[-_]/)[0];
  if (isLanguage(code)) return code;
  return code && ['be', 'kk', 'uk', 'uz'].includes(code) ? 'ru' : 'en';
}
