// Additional UI translations.
import type { Lang } from './locales';

export const UI_LOCALES: Record<string, Record<Lang, string>> = {
  "emptyRooms": {
    "ru": "Пока нет открытых комнат",
    "en": "No public rooms yet",
    "tr": "Henüz açık oda yok",
    "es": "Aún no hay salas públicas",
    "ar": "لا توجد غرف عامة بعد"
  },
  "emptyRoomsHint": {
    "ru": "Нажмите «Быстрый поиск боя» или создайте комнату — друзья смогут подключиться за секунду.",
    "en": "Use Quick match or create a room for friends to join.",
    "tr": "Hızlı eşleşmeyi kullanın veya arkadaşlarınız için oda oluşturun.",
    "es": "Usa Partida rápida o crea una sala para tus amigos.",
    "ar": "استخدم المباراة السريعة أو أنشئ غرفة لأصدقائك."
  },
  "waiting": {
    "ru": "Ожидание",
    "en": "Waiting",
    "tr": "Bekleniyor",
    "es": "Esperando",
    "ar": "انتظار"
  },
  "inBattle": {
    "ru": "В бою",
    "en": "In battle",
    "tr": "Savaşta",
    "es": "En combate",
    "ar": "في القتال"
  },
  "botsPlus": {
    "ru": "+Боты ИИ",
    "en": "+AI bots",
    "tr": "+Botlar",
    "es": "+Bots de IA",
    "ar": "+روبوتات"
  },
  "playersOnly": {
    "ru": "Только игроки",
    "en": "Players only",
    "tr": "Yalnızca oyuncular",
    "es": "Solo jugadores",
    "ar": "اللاعبون فقط"
  },
  "roomFull": {
    "ru": "Заполнена",
    "en": "Full",
    "tr": "Dolu",
    "es": "Llena",
    "ar": "ممتلئة"
  },
  "leader": {
    "ru": "Лидер",
    "en": "Host",
    "tr": "Lider",
    "es": "Anfitrión",
    "ar": "المضيف"
  },
  "ready": {
    "ru": "Готов",
    "en": "Ready",
    "tr": "Hazır",
    "es": "Listo",
    "ar": "جاهز"
  },
  "notReady": {
    "ru": "Не готов",
    "en": "Not ready",
    "tr": "Hazır değil",
    "es": "No está listo",
    "ar": "غير جاهز"
  },
  "you": {
    "ru": "Вы",
    "en": "You",
    "tr": "Sen",
    "es": "Tú",
    "ar": "أنت"
  },
  "ai": {
    "ru": "ИИ",
    "en": "AI",
    "tr": "YZ",
    "es": "IA",
    "ar": "ذكاء اصطناعي"
  },
  "arenaBot": {
    "ru": "Бот арены",
    "en": "Arena bot",
    "tr": "Arena botu",
    "es": "Bot de arena",
    "ar": "روبوت الساحة"
  },
  "botReplaced": {
    "ru": "Уступит место игроку",
    "en": "Replaced when a player joins",
    "tr": "Oyuncu katıldığında yerini bırakır",
    "es": "Cede su lugar a un jugador",
    "ar": "يترك مكانه عند انضمام لاعب"
  },
  "autoBot": {
    "ru": "Авто-бот",
    "en": "Auto bot",
    "tr": "Otomatik bot",
    "es": "Bot automático",
    "ar": "روبوت تلقائي"
  },
  "freeSlot": {
    "ru": "Свободно",
    "en": "Available",
    "tr": "Boş",
    "es": "Libre",
    "ar": "متاح"
  },
  "waitingPlayer": {
    "ru": "Ожидание игрока",
    "en": "Waiting for player",
    "tr": "Oyuncu bekleniyor",
    "es": "Esperando jugador",
    "ar": "بانتظار لاعب"
  },
  "codeLabel": {
    "ru": "Код: {code}",
    "en": "Code: {code}",
    "tr": "Kod: {code}",
    "es": "Código: {code}",
    "ar": "الرمز: {code}"
  },
  "empty": {
    "ru": "Пусто",
    "en": "Empty",
    "tr": "Boş",
    "es": "Vacío",
    "ar": "فارغ"
  },
  "cancelReady": {
    "ru": "Готов (отменить)",
    "en": "Ready (cancel)",
    "tr": "Hazır (iptal et)",
    "es": "Listo (cancelar)",
    "ar": "جاهز (إلغاء)"
  },
  "confirmReady": {
    "ru": "Подтвердить готовность",
    "en": "Confirm readiness",
    "tr": "Hazır olduğunu onayla",
    "es": "Confirmar que estás listo",
    "ar": "تأكيد الجاهزية"
  },
  "leaveBattle": {
    "ru": "Покинуть сетевой бой",
    "en": "Leave online match",
    "tr": "Çevrimiçi savaştan ayrıl",
    "es": "Salir de la partida en línea",
    "ar": "مغادرة المباراة الجماعية"
  },
  "invalidCode": {
    "ru": "Введите 4-буквенный код комнаты.",
    "en": "Enter a 4-letter room code.",
    "tr": "4 harfli oda kodunu girin.",
    "es": "Introduce un código de sala de 4 letras.",
    "ar": "أدخل رمز الغرفة المكون من 4 أحرف."
  },
  "finalPhase": {
    "ru": "Финал",
    "en": "Final",
    "tr": "Final",
    "es": "Final",
    "ar": "النهائي"
  },
  "aliveCount": {
    "ru": "{alive} / {total} в живых",
    "en": "{alive} / {total} alive",
    "tr": "{alive} / {total} hayatta",
    "es": "{alive} / {total} con vida",
    "ar": "{alive} / {total} على قيد الحياة"
  },
  "roomPing": {
    "ru": "Зал {code} · {ping} мс",
    "en": "Room {code} · {ping} ms",
    "tr": "Oda {code} · {ping} ms",
    "es": "Sala {code} · {ping} ms",
    "ar": "الغرفة {code} · {ping} مللي ثانية"
  },
  "roomLabel": {
    "ru": "Зал {code}",
    "en": "Room {code}",
    "tr": "Oda {code}",
    "es": "Sala {code}",
    "ar": "الغرفة {code}"
  },
  "freeLookHint": {
    "ru": "Свободный ММО-обзор 360° активен ([V] или отпустите СКМ для возврата)",
    "en": "360° free look active (press V or release middle mouse to return)",
    "tr": "360° serbest bakış etkin (dönmek için V veya orta fareyi bırak)",
    "es": "Vista libre 360° activa (pulsa V o suelta el botón central)",
    "ar": "النظر الحر 360° نشط (اضغط V أو حرر زر الفأرة الأوسط للعودة)"
  },
  "aimHint": {
    "ru": "Свободный прицел ММО · Зажмите ПКМ/СКМ для вращения камеры 360° · [~] Экшен-камера",
    "en": "Free aim · Hold right/middle mouse to rotate 360° · [~] Action camera",
    "tr": "Serbest nişan · 360° döndürmek için sağ/orta fareyi tut · [~] Aksiyon kamerası",
    "es": "Apuntado libre · Mantén botón derecho/central para girar 360° · [~] Cámara de acción",
    "ar": "تصويب حر · اضغط زر الفأرة الأيمن/الأوسط للتدوير 360° · [~] كاميرا الحركة"
  },
  "pointerHint": {
    "ru": "Наводите прицел везде · Зажмите ПКМ/СКМ для камеры 360° или кликните ЛКМ · [~] Режим прицела",
    "en": "Aim anywhere · Hold right/middle mouse for 360° camera or click left mouse · [~] Aim mode",
    "tr": "Her yere nişan al · 360° kamera için sağ/orta fareyi tut veya sol tıkla · [~] Nişan modu",
    "es": "Apunta libremente · Mantén botón derecho/central para cámara 360° o haz clic izquierdo · [~] Modo de apuntado",
    "ar": "صوّب في أي مكان · اضغط الزر الأيمن/الأوسط للكاميرا 360° أو انقر الأيسر · [~] وضع التصويب"
  },
  "actionHintLocked": {
    "ru": "Колесо мыши — зум · [СКМ / V] свободный обзор · [~] свободный прицел · [Tab] навыки",
    "en": "Mouse wheel: zoom · [Middle mouse / V] free look · [~] free aim · [Tab] skills",
    "tr": "Fare tekeri: yakınlaştır · [Orta fare / V] serbest bakış · [~] serbest nişan · [Tab] yetenekler",
    "es": "Rueda: zoom · [Botón central / V] vista libre · [~] apuntado libre · [Tab] habilidades",
    "ar": "عجلة الفأرة: تكبير · [الزر الأوسط / V] نظرة حرة · [~] تصويب حر · [Tab] المهارات"
  },
  "actionHintFree": {
    "ru": "Зажмите ПКМ/СКМ для вращения камеры 360° · [~] экшен-камера · Наведите на навык",
    "en": "Hold right/middle mouse to rotate 360° · [~] action camera · Hover over a skill",
    "tr": "360° dönmek için sağ/orta fareyi tut · [~] aksiyon kamerası · Yeteneğin üzerine gel",
    "es": "Mantén botón derecho/central para girar 360° · [~] cámara de acción · Pasa el cursor sobre una habilidad",
    "ar": "اضغط الزر الأيمن/الأوسط للتدوير 360° · [~] كاميرا الحركة · مرّر فوق مهارة"
  },
  "eliminated": {
    "ru": "Выбыл",
    "en": "Eliminated",
    "tr": "Elendi",
    "es": "Eliminado",
    "ar": "تم إقصاؤه"
  },
  "spectatorCamera": {
    "ru": "Камера: {name} ({hero}) · Осталось: {count}",
    "en": "Camera: {name} ({hero}) · Remaining: {count}",
    "tr": "Kamera: {name} ({hero}) · Kalan: {count}",
    "es": "Cámara: {name} ({hero}) · Restantes: {count}",
    "ar": "الكاميرا: {name} ({hero}) · المتبقي: {count}"
  },
  "decidingWinner": {
    "ru": "Определение победителя...",
    "en": "Determining the winner...",
    "tr": "Kazanan belirleniyor...",
    "es": "Determinando el ganador...",
    "ar": "جارٍ تحديد الفائز..."
  },
  "stateIdle": {
    "ru": "Готов",
    "en": "Ready",
    "tr": "Hazır",
    "es": "Listo",
    "ar": "جاهز"
  },
  "stateMoving": {
    "ru": "В движении",
    "en": "Moving",
    "tr": "Hareket ediyor",
    "es": "En movimiento",
    "ar": "يتحرك"
  },
  "stateAttacking": {
    "ru": "Комбо",
    "en": "Combo",
    "tr": "Kombo",
    "es": "Combo",
    "ar": "ضربات متتالية"
  },
  "stateHeavyAttacking": {
    "ru": "Пробой!",
    "en": "Heavy attack!",
    "tr": "Güçlü saldırı!",
    "es": "¡Ataque fuerte!",
    "ar": "هجوم قوي!"
  },
  "stateBlocking": {
    "ru": "Блок",
    "en": "Blocking",
    "tr": "Blok",
    "es": "Bloqueo",
    "ar": "صد"
  },
  "stateDodging": {
    "ru": "Рывок",
    "en": "Dodging",
    "tr": "Kaçınma",
    "es": "Esquiva",
    "ar": "مراوغة"
  },
  "stateHitReaction": {
    "ru": "Урон",
    "en": "Hit",
    "tr": "Darbe",
    "es": "Golpe",
    "ar": "ضربة"
  },
  "stateStunned": {
    "ru": "Оглушён",
    "en": "Stunned",
    "tr": "Sersemlemiş",
    "es": "Aturdido",
    "ar": "مصعوق"
  },
  "stateDead": {
    "ru": "Пал",
    "en": "Fallen",
    "tr": "Düştü",
    "es": "Caído",
    "ar": "سقط"
  },
  "buffDamage": {
    "ru": "Обет стали: +25% урон ({time}с)",
    "en": "Oath of Steel: +25% damage ({time}s)",
    "tr": "Çelik Yemini: +%25 hasar ({time} sn)",
    "es": "Juramento de acero: +25 % de daño ({time} s)",
    "ar": "عهد الفولاذ: +25٪ ضرر ({time} ث)"
  },
  "buffSpeed": {
    "ru": "Шаг теней: +25% скорость ({time}с)",
    "en": "Shadow Step: +25% speed ({time}s)",
    "tr": "Gölge Adımı: +%25 hız ({time} sn)",
    "es": "Paso sombrío: +25 % de velocidad ({time} s)",
    "ar": "خطوة الظل: +25٪ سرعة ({time} ث)"
  },
  "buffDefense": {
    "ru": "Железный бастион: -35% урон ({time}с)",
    "en": "Iron Bastion: -35% damage taken ({time}s)",
    "tr": "Demir Hisar: alınan hasar -%35 ({time} sn)",
    "es": "Bastión de hierro: -35 % de daño recibido ({time} s)",
    "ar": "الحصن الحديدي: -35٪ ضرر وارد ({time} ث)"
  },
  "roomReturn": {
    "ru": "В комнату",
    "en": "Back to room",
    "tr": "Odaya dön",
    "es": "Volver a la sala",
    "ar": "العودة إلى الغرفة"
  },
  "newRound": {
    "ru": "Новый раунд!",
    "en": "New round!",
    "tr": "Yeni tur!",
    "es": "¡Nueva ronda!",
    "ar": "جولة جديدة!"
  },
  "rematchReady": {
    "ru": "Готов к реваншу",
    "en": "Ready for rematch",
    "tr": "Rövanşa hazırım",
    "es": "Listo para la revancha",
    "ar": "جاهز للإعادة"
  },
  "aliveHp": {
    "ru": "Жив · {hp} HP",
    "en": "Alive · {hp} HP",
    "tr": "Hayatta · {hp} HP",
    "es": "Vivo · {hp} HP",
    "ar": "حي · {hp} صحة"
  },
  "mouse": {
    "ru": "Мышь",
    "en": "Mouse",
    "tr": "Fare",
    "es": "Ratón",
    "ar": "الفأرة"
  },
  "wheel": {
    "ru": "Колесо",
    "en": "Wheel",
    "tr": "Tekerlek",
    "es": "Rueda",
    "ar": "العجلة"
  },
  "middleMouse": {
    "ru": "СКМ",
    "en": "Middle mouse",
    "tr": "Orta fare",
    "es": "Botón central",
    "ar": "الزر الأوسط"
  },
  "leftMouse": {
    "ru": "ЛКМ",
    "en": "Left mouse",
    "tr": "Sol fare",
    "es": "Botón izquierdo",
    "ar": "الزر الأيسر"
  },
  "rightMouse": {
    "ru": "ПКМ",
    "en": "Right mouse",
    "tr": "Sağ fare",
    "es": "Botón derecho",
    "ar": "الزر الأيمن"
  },
  "hold": {
    "ru": "Удерж.",
    "en": "Hold",
    "tr": "Basılı tut",
    "es": "Mantener",
    "ar": "اضغط مطولًا"
  },
  "controlsHint": {
    "ru": "В бою удерживайте Tab, чтобы показать курсор, или нажмите Esc для паузы",
    "en": "Hold Tab in battle to show the cursor, or press Esc to pause",
    "tr": "Savaşta imleci göstermek için Tab tuşunu basılı tutun veya duraklatmak için Esc tuşuna basın",
    "es": "Mantén Tab en combate para mostrar el cursor o pulsa Esc para pausar",
    "ar": "اضغط Tab أثناء القتال لإظهار المؤشر أو Esc للإيقاف المؤقت"
  },
  "enterName": {
    "ru": "Введите имя...",
    "en": "Enter name...",
    "tr": "Adınızı girin...",
    "es": "Introduce tu nombre...",
    "ar": "أدخل الاسم..."
  },
  "codePlaceholder": {
    "ru": "КОД",
    "en": "CODE",
    "tr": "KOD",
    "es": "CÓDIGO",
    "ar": "الرمز"
  },
  "pixel1": {
    "ru": "Чёткий HD 3D (1x)",
    "en": "Crisp HD 3D (1x)",
    "tr": "Net HD 3D (1x)",
    "es": "3D HD nítido (1x)",
    "ar": "ثلاثي الأبعاد عالي الدقة (1x)"
  },
  "pixel2": {
    "ru": "Ретро 3D с контуром (2x)",
    "en": "Outlined retro 3D (2x)",
    "tr": "Konturlu retro 3D (2x)",
    "es": "3D retro con contorno (2x)",
    "ar": "ثلاثي الأبعاد كلاسيكي محدد (2x)"
  },
  "pixel3": {
    "ru": "Пиксель-арт 3D (3x)",
    "en": "Pixel-art 3D (3x)",
    "tr": "Piksel sanat 3D (3x)",
    "es": "3D de píxeles (3x)",
    "ar": "فن البكسل ثلاثي الأبعاد (3x)"
  },
  "qualityUltraDesc": {
    "ru": "Ультра (HDR + Тени 2K)",
    "en": "Ultra (HDR + 2K shadows)",
    "tr": "Ultra (HDR + 2K gölgeler)",
    "es": "Ultra (HDR + sombras 2K)",
    "ar": "فائق (HDR + ظلال 2K)"
  },
  "qualityHighDesc": {
    "ru": "Высокое (HDR + Тени)",
    "en": "High (HDR + shadows)",
    "tr": "Yüksek (HDR + gölgeler)",
    "es": "Alto (HDR + sombras)",
    "ar": "عالٍ (HDR + ظلال)"
  },
  "skillLight": {
    "ru": "Лёгкая атака",
    "en": "Light attack",
    "tr": "Hafif saldırı",
    "es": "Ataque ligero",
    "ar": "هجوم خفيف"
  },
  "skillHeavy": {
    "ru": "Тяжёлая атака",
    "en": "Heavy attack",
    "tr": "Ağır saldırı",
    "es": "Ataque fuerte",
    "ar": "هجوم ثقيل"
  },
  "skillDefense": {
    "ru": "Защита",
    "en": "Defense",
    "tr": "Savunma",
    "es": "Defensa",
    "ar": "الدفاع"
  },
  "skillDodge": {
    "ru": "Уклонение",
    "en": "Dodge",
    "tr": "Kaçınma",
    "es": "Esquivar",
    "ar": "مراوغة"
  },
  "skillComboCat": {
    "ru": "Серия из {count} ударов · Нажатие ЛКМ",
    "en": "{count}-hit combo · Click left mouse",
    "tr": "{count} vuruşluk kombo · Sol tık",
    "es": "Combo de {count} golpes · Clic izquierdo",
    "ar": "سلسلة من {count} ضربات · انقر الزر الأيسر"
  },
  "skillHeavyCat": {
    "ru": "Силовой приём · Удержание ЛКМ",
    "en": "Heavy attack · Hold left mouse",
    "tr": "Ağır saldırı · Sol fareyi basılı tut",
    "es": "Ataque fuerte · Mantén botón izquierdo",
    "ar": "هجوم قوي · اضغط الزر الأيسر مطولًا"
  },
  "skillDefenseCat": {
    "ru": "Защитная стойка · ПКМ",
    "en": "Defense · Right mouse",
    "tr": "Savunma · Sağ fare",
    "es": "Defensa · Botón derecho",
    "ar": "دفاع · الزر الأيمن"
  },
  "skillAbilityCat": {
    "ru": "Уникальный навык · Клавиша [{key}]",
    "en": "Unique skill · Key [{key}]",
    "tr": "Özel yetenek · Tuş [{key}]",
    "es": "Habilidad única · Tecla [{key}]",
    "ar": "مهارة فريدة · المفتاح [{key}]"
  },
  "skillDodgeCat": {
    "ru": "Тактический манёвр · Alt / C / Ctrl",
    "en": "Tactical maneuver · Alt / C / Ctrl",
    "tr": "Taktik manevra · Alt / C / Ctrl",
    "es": "Maniobra táctica · Alt / C / Ctrl",
    "ar": "مناورة تكتيكية · Alt / C / Ctrl"
  },
  "skillLightDesc": {
    "ru": "Серия быстрых ударов для ближнего боя.",
    "en": "A rapid combo for close combat.",
    "tr": "Yakın dövüş için hızlı vuruş serisi.",
    "es": "Una combinación rápida para el combate cercano.",
    "ar": "سلسلة ضربات سريعة للقتال القريب."
  },
  "skillHeavyDesc": {
    "ru": "Удерживайте ЛКМ для мощного удара.",
    "en": "Hold left mouse for a powerful attack.",
    "tr": "Güçlü saldırı için sol fareyi basılı tut.",
    "es": "Mantén el botón izquierdo para un ataque potente.",
    "ar": "اضغط زر الفأرة الأيسر مطولًا لهجوم قوي."
  },
  "skillDefenseDesc": {
    "ru": "Используйте защиту, чтобы уменьшить входящий урон.",
    "en": "Use defense to reduce incoming damage.",
    "tr": "Alınan hasarı azaltmak için savunmayı kullan.",
    "es": "Usa la defensa para reducir el daño recibido.",
    "ar": "استخدم الدفاع لتقليل الضرر الوارد."
  },
  "skillDodgeDesc": {
    "ru": "Используйте манёвр для уклонения или толчка.",
    "en": "Use this maneuver to dodge or push.",
    "tr": "Kaçınmak veya itmek için bu manevrayı kullan.",
    "es": "Usa esta maniobra para esquivar o empujar.",
    "ar": "استخدم هذه المناورة للمراوغة أو الدفع."
  },
  "skillDamage": {
    "ru": "Урон: {value}",
    "en": "Damage: {value}",
    "tr": "Hasar: {value}",
    "es": "Daño: {value}",
    "ar": "الضرر: {value}"
  },
  "skillRange": {
    "ru": "Дальность: {value} м",
    "en": "Range: {value} m",
    "tr": "Menzil: {value} m",
    "es": "Alcance: {value} m",
    "ar": "المدى: {value} م"
  },
  "skillHeal": {
    "ru": "Лечение: +{value} HP",
    "en": "Heal: +{value} HP",
    "tr": "İyileşme: +{value} HP",
    "es": "Curación: +{value} HP",
    "ar": "علاج: +{value} صحة"
  },
  "skillLeech": {
    "ru": "Вампиризм: +{value} HP",
    "en": "Life steal: +{value} HP",
    "tr": "Can çalma: +{value} HP",
    "es": "Robo de vida: +{value} HP",
    "ar": "امتصاص صحة: +{value}"
  },
  "skillBreak": {
    "ru": "Пробивает блок",
    "en": "Breaks blocks",
    "tr": "Bloğu kırar",
    "es": "Rompe bloqueos",
    "ar": "يكسر الصد"
  },
  "skillArmor": {
    "ru": "Гиперброня",
    "en": "Hyper armor",
    "tr": "Süper zırh",
    "es": "Superarmadura",
    "ar": "درع فائق"
  },
  "skillStun": {
    "ru": "Оглушение: {value}с",
    "en": "Stun: {value}s",
    "tr": "Sersemletme: {value} sn",
    "es": "Aturdimiento: {value} s",
    "ar": "صعق: {value} ث"
  },
  "skillGuard": {
    "ru": "Защита: -{value}% урона",
    "en": "Defense: -{value}% damage",
    "tr": "Savunma: -%{value} hasar",
    "es": "Defensa: -{value} % de daño",
    "ar": "دفاع: -{value}٪ ضرر"
  },
  "skillAngle": {
    "ru": "Сектор: {value}°",
    "en": "Angle: {value}°",
    "tr": "Açı: {value}°",
    "es": "Ángulo: {value}°",
    "ar": "الزاوية: {value}°"
  },
  "skillPush": {
    "ru": "Импульс отталкивания",
    "en": "Pushback pulse",
    "tr": "Geri itme darbesi",
    "es": "Impulso de empuje",
    "ar": "دفعة إبعاد"
  },
  "skillInvuln": {
    "ru": "Неуязвимость: {value}с",
    "en": "Invulnerability: {value}s",
    "tr": "Dokunulmazlık: {value} sn",
    "es": "Invulnerabilidad: {value} s",
    "ar": "حصانة: {value} ث"
  },
  "skillInterrupt": {
    "ru": "Сбивает замах",
    "en": "Interrupts attacks",
    "tr": "Saldırıları keser",
    "es": "Interrumpe ataques",
    "ar": "يقطع الهجمات"
  },
  "skillCooldown": {
    "ru": "Перезарядка: {value} сек",
    "en": "Cooldown: {value} sec",
    "tr": "Bekleme: {value} sn",
    "es": "Recarga: {value} s",
    "ar": "إعادة الاستخدام: {value} ث"
  },
  "skillNoCooldown": {
    "ru": "Без отката",
    "en": "No cooldown",
    "tr": "Bekleme yok",
    "es": "Sin recarga",
    "ar": "دون انتظار"
  },
  "skillStamina": {
    "ru": "Выносливость: {value}",
    "en": "Stamina: {value}",
    "tr": "Dayanıklılık: {value}",
    "es": "Resistencia: {value}",
    "ar": "التحمل: {value}"
  },
  "staminaValue": {
    "ru": "{value} СТ",
    "en": "{value} STA",
    "tr": "{value} DAY",
    "es": "{value} RES",
    "ar": "{value} تحمل"
  },
  "meters": {
    "ru": "{value} м",
    "en": "{value} m",
    "tr": "{value} m",
    "es": "{value} m",
    "ar": "{value} م"
  },
  "metersSec": {
    "ru": "{value} м/с",
    "en": "{value} m/s",
    "tr": "{value} m/sn",
    "es": "{value} m/s",
    "ar": "{value} م/ث"
  },
  "abilityMeta": {
    "ru": "{cooldown}с · {stamina} СТ",
    "en": "{cooldown}s · {stamina} STA",
    "tr": "{cooldown} sn · {stamina} DAY",
    "es": "{cooldown} s · {stamina} RES",
    "ar": "{cooldown} ث · {stamina} تحمل"
  },
  "theme_oak_tournament": {
    "ru": "Дубовый помост",
    "en": "Oak platform",
    "tr": "Meşe platform",
    "es": "Plataforma de roble",
    "ar": "منصة البلوط"
  },
  "theme_sandstone_colosseum": {
    "ru": "Золотой песчаник",
    "en": "Golden sandstone",
    "tr": "Altın kumtaşı",
    "es": "Arenisca dorada",
    "ar": "الحجر الرملي الذهبي"
  },
  "theme_azure_marble": {
    "ru": "Сапфировый мрамор",
    "en": "Sapphire marble",
    "tr": "Safir mermer",
    "es": "Mármol zafiro",
    "ar": "الرخام الياقوتي"
  },
  "theme_obsidian_citadel": {
    "ru": "Тёмная цитадель",
    "en": "Dark citadel",
    "tr": "Karanlık kale",
    "es": "Ciudadela oscura",
    "ar": "القلعة المظلمة"
  },
  "themeShort_oak_tournament": {
    "ru": "Дерево",
    "en": "Wood",
    "tr": "Ahşap",
    "es": "Madera",
    "ar": "خشب"
  },
  "themeShort_sandstone_colosseum": {
    "ru": "Песчаник",
    "en": "Sandstone",
    "tr": "Kumtaşı",
    "es": "Arenisca",
    "ar": "حجر رملي"
  },
  "themeShort_azure_marble": {
    "ru": "Мрамор",
    "en": "Marble",
    "tr": "Mermer",
    "es": "Mármol",
    "ar": "رخام"
  },
  "themeShort_obsidian_citadel": {
    "ru": "Базальт",
    "en": "Basalt",
    "tr": "Bazalt",
    "es": "Basalto",
    "ar": "بازلت"
  },
  "themeDesc_oak_tournament": {
    "ru": "Тёплый настил из светлого и мореного дуба + светлый известняк",
    "en": "Warm light and stained oak with pale limestone",
    "tr": "Açık ve koyu meşe zemin ve açık kireç taşı",
    "es": "Roble claro y oscuro con piedra caliza clara",
    "ar": "بلوط فاتح وداكن مع حجر جيري فاتح"
  },
  "themeDesc_sandstone_colosseum": {
    "ru": "Турнирный песок ристалища и солнечные золотистые бастионы",
    "en": "Tournament sand and golden bastions",
    "tr": "Turnuva kumu ve altın burçlar",
    "es": "Arena de torneo y bastiones dorados",
    "ar": "رمال البطولة وحصون ذهبية"
  },
  "themeDesc_azure_marble": {
    "ru": "Светлый королевский камень с контрастным мореным дубом",
    "en": "Pale royal stone with dark oak",
    "tr": "Koyu meşeyle açık kraliyet taşı",
    "es": "Piedra real clara con roble oscuro",
    "ar": "حجر ملكي فاتح مع بلوط داكن"
  },
  "themeDesc_obsidian_citadel": {
    "ru": "Суровый тёмный базальт и мореный дуб в отблесках огня",
    "en": "Dark basalt and stained oak in firelight",
    "tr": "Ateş ışığında koyu bazalt ve meşe",
    "es": "Basalto y roble oscuro a la luz del fuego",
    "ar": "بازلت وبلوط داكنان تحت ضوء النار"
  },
  "netRoomMissing": {
    "ru": "Комната «{code}» не найдена.",
    "en": "Room “{code}” not found.",
    "tr": "“{code}” odası bulunamadı.",
    "es": "No se encontró la sala «{code}».",
    "ar": "لم يتم العثور على الغرفة «{code}»."
  },
  "netMatchStarted": {
    "ru": "Бой в этой комнате уже начался. Дождитесь завершения раунда.",
    "en": "This room is already in a match. Wait until the round ends.",
    "tr": "Bu odadaki maç başladı. Turun bitmesini bekleyin.",
    "es": "La partida ya ha empezado. Espera a que termine la ronda.",
    "ar": "بدأ القتال في هذه الغرفة. انتظر حتى نهاية الجولة."
  },
  "netRoomFull": {
    "ru": "Комната заполнена ({count}).",
    "en": "Room is full ({count}).",
    "tr": "Oda dolu ({count}).",
    "es": "La sala está llena ({count}).",
    "ar": "الغرفة ممتلئة ({count})."
  },
  "netHostOnly": {
    "ru": "Только глава комнаты может начать поединок.",
    "en": "Only the host can start the match.",
    "tr": "Maçı yalnızca oda sahibi başlatabilir.",
    "es": "Solo el anfitrión puede iniciar la partida.",
    "ar": "يمكن للمضيف فقط بدء المباراة."
  },
  "netNeedPlayers": {
    "ru": "Нужно минимум 2 игрока (или включите «Дополнить ботами до 5»).",
    "en": "At least 2 players are needed (or enable bots).",
    "tr": "En az 2 oyuncu gerekli (veya botları etkinleştirin).",
    "es": "Se necesitan al menos 2 jugadores (o activar bots).",
    "ar": "يلزم لاعبان على الأقل (أو فعّل الروبوتات)."
  },
  "netExpired": {
    "ru": "Сессия истекла. Нажмите «Обновить» для переподключения.",
    "en": "Session expired. Press Refresh to reconnect.",
    "tr": "Oturum süresi doldu. Yeniden bağlanmak için Yenile’ye basın.",
    "es": "La sesión caducó. Pulsa Actualizar para reconectar.",
    "ar": "انتهت الجلسة. اضغط تحديث لإعادة الاتصال."
  },
  "netBusy": {
    "ru": "Сервер хостинга временно перегружен. Попробуйте через пару секунд.",
    "en": "The server is temporarily busy. Try again in a few seconds.",
    "tr": "Sunucu geçici olarak yoğun. Birkaç saniye sonra tekrar deneyin.",
    "es": "El servidor está ocupado. Vuelve a intentarlo en unos segundos.",
    "ar": "الخادم مشغول مؤقتًا. حاول مجددًا بعد بضع ثوانٍ."
  },
  "netLost": {
    "ru": "Потеряна связь с сервером арены.",
    "en": "Connection to the arena server was lost.",
    "tr": "Arena sunucusuyla bağlantı kesildi.",
    "es": "Se perdió la conexión con el servidor de la arena.",
    "ar": "انقطع الاتصال بخادم الساحة."
  },
  "netDisconnected": {
    "ru": "Соединение с сервером прервано.",
    "en": "Server connection interrupted.",
    "tr": "Sunucu bağlantısı kesildi.",
    "es": "Se interrumpió la conexión con el servidor.",
    "ar": "انقطع الاتصال بالخادم."
  },
  "netCannotConnect": {
    "ru": "Не удалось подключиться к серверу арены",
    "en": "Could not connect to the arena server",
    "tr": "Arena sunucusuna bağlanılamadı",
    "es": "No se pudo conectar al servidor de la arena",
    "ar": "تعذر الاتصال بخادم الساحة"
  },
  "netError": {
    "ru": "Ошибка сети",
    "en": "Network error",
    "tr": "Ağ hatası",
    "es": "Error de red",
    "ar": "خطأ في الشبكة"
  }
};
