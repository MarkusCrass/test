// Translations for hero dossiers and unique skills. Russian comes from the game configuration.
import type { KnightClassId, AbilityKind } from './classes';
import type { Lang } from './locales';

type ForeignLang = Exclude<Lang, 'ru'>;
type Texts = Record<ForeignLang, string>;
const HEROES: Record<KnightClassId, { role: Texts; summary: Texts }> = {
  "sword": {
    "role": {
      "en": "Balanced knight",
      "tr": "Dengeli şövalye",
      "es": "Caballero equilibrado",
      "ar": "فارس متوازن"
    },
    "summary": {
      "en": "A balanced swordsman in steel armor and a cape, combining swift lunges, combat healing and a crushing overhead leap.",
      "tr": "Çelik zırhlı ve pelerinli dengeli kılıç ustası; hızlı hamleleri, savaşta iyileşmeyi ve yukarıdan yıkıcı sıçrayışı birleştirir.",
      "es": "Espadachín equilibrado con armadura de acero y capa, que combina estocadas rápidas, curación en combate y un salto aplastante.",
      "ar": "مبارز متوازن بدرع فولاذي وعباءة يجمع بين الطعنات السريعة والعلاج القتالي والقفزة الساحقة من الأعلى."
    }
  },
  "dual": {
    "role": {
      "en": "Mobile assassin",
      "tr": "Çevik suikastçı",
      "es": "Asesino ágil",
      "ar": "قاتل سريع"
    },
    "summary": {
      "en": "A swift hooded fighter with two blades who attacks in a whirlwind, throws daggers and escapes with a shadow slash.",
      "tr": "İki kılıçlı çevik, kapüşonlu savaşçı; kasırgayla saldırır, hançer fırlatır ve gölge kesişiyle uzaklaşır.",
      "es": "Ágil luchador encapuchado con dos espadas que ataca como un torbellino, lanza dagas y escapa con un corte sombrío.",
      "ar": "مقاتل سريع مقنّع بسيفين يهاجم بدوامة ويرمي الخناجر وينسحب بضربة الظل."
    }
  },
  "spear": {
    "role": {
      "en": "Range control",
      "tr": "Menzil kontrolü",
      "es": "Control de distancia",
      "ar": "التحكم بالمسافة"
    },
    "summary": {
      "en": "A master of the long polearm who keeps enemies at spearpoint, deflects attacks and throws a javelin.",
      "tr": "Uzun sırıklı silah ustası; düşmanları mızrak ucunda tutar, saldırıları savuşturur ve cirit fırlatır.",
      "es": "Maestro del arma de asta que mantiene a raya a los enemigos, desvía ataques y lanza jabalinas.",
      "ar": "محترف سلاح طويل يُبقي الأعداء عند رأس رمحه ويصد الهجمات ويرمي الحربة."
    }
  },
  "hammer": {
    "role": {
      "en": "Heavy defender",
      "tr": "Ağır savunmacı",
      "es": "Defensor pesado",
      "ar": "مدافع ثقيل"
    },
    "summary": {
      "en": "A massive armored guardian with a tower shield and war hammer who rams enemies, shakes the ground and hardens armor.",
      "tr": "Kule kalkanlı ve savaş çekiçli iri zırhlı muhafız; düşmanlara çarpar, yeri sarsar ve zırhını güçlendirir.",
      "es": "Guardián corpulento con escudo torre y martillo de guerra que embiste, sacude el suelo y refuerza su armadura.",
      "ar": "حارس ضخم مدرع بدرع كبير ومطرقة حرب يندفع نحو الأعداء ويهز الأرض ويقوي درعه."
    }
  },
  "barbarian": {
    "role": {
      "en": "Two-handed axe attacker",
      "tr": "Çift elli baltalı saldırgan",
      "es": "Atacante con hacha de dos manos",
      "ar": "مهاجم بفأس ذات يدين"
    },
    "summary": {
      "en": "A fierce northern warrior in a horned helmet wielding a two-handed axe, leaping into battle, entering a rage and throwing axes.",
      "tr": "Boynuzlu miğferli, çift elli balta kullanan vahşi kuzeyli savaşçı; savaşa sıçrar, öfkelenir ve balta fırlatır.",
      "es": "Feroz guerrero del norte con casco con cuernos y hacha de dos manos que salta al combate, entra en furia y lanza hachas.",
      "ar": "محارب شمالي شرس بخوذة مقرنة وفأس ذات يدين يقفز إلى القتال ويثور غضبًا ويرمي الفؤوس."
    }
  },
  "duelist": {
    "role": {
      "en": "Parry and rapier specialist",
      "tr": "Savuşturma ve meç ustası",
      "es": "Especialista en parada y estoque",
      "ar": "خبير التصدي وسيف المبارزة"
    },
    "summary": {
      "en": "A helmetless fencing virtuoso with a blade and round buckler, punishing mistakes with perfect parries and a powder bomb.",
      "tr": "Kılıç ve yuvarlak kalkan taşıyan miğfersiz eskrim ustası; hataları kusursuz savuşturmalar ve barut bombasıyla cezalandırır.",
      "es": "Virtuoso de la esgrima sin casco, con espada y rodela, que castiga errores con paradas perfectas y una bomba de pólvora.",
      "ar": "مبارز بارع بلا خوذة يحمل نصلًا وترسًا دائريًا ويعاقب الأخطاء بتصدٍ متقن وقنبلة بارود."
    }
  },
  "skeleton_knight": {
    "role": {
      "en": "Armored life-stealer",
      "tr": "Can çalan zırhlı şövalye",
      "es": "Caballero acorazado que roba vida",
      "ar": "فارس مدرع يمتص الحياة"
    },
    "summary": {
      "en": "An ancient undead knight in a horned helmet with a jagged blade and large shield, stealing health and pressing relentlessly.",
      "tr": "Boynuzlu miğferli, tırtıklı kılıç ve büyük kalkan taşıyan kadim ölümsüz şövalye; can çalar ve amansızca saldırır.",
      "es": "Antiguo caballero no muerto con casco con cuernos, hoja dentada y gran escudo que roba vida y presiona sin descanso.",
      "ar": "فارس قديم من الموتى بخوذة مقرنة ونصل مسنن ودرع كبير يمتص الصحة ويضغط بلا هوادة."
    }
  },
  "skeleton_reaper": {
    "role": {
      "en": "Life-stealing assassin",
      "tr": "Can çalan suikastçı",
      "es": "Asesino que roba vida",
      "ar": "قاتل يمتص الحياة"
    },
    "summary": {
      "en": "An elusive hooded reaper with two jagged blades who spins through enemies, steals health in a leap and throws bone shards.",
      "tr": "İki tırtıklı bıçak taşıyan yakalanması güç kapüşonlu azrail; döner, sıçrayışta can çalar ve kemik parçaları fırlatır.",
      "es": "Escurridizo segador encapuchado con dos hojas dentadas que gira, roba vida al saltar y lanza fragmentos de hueso.",
      "ar": "حاصد مقنّع مراوغ بنصلين مسننين يدور ويمتص الصحة بالقفز ويرمي شظايا العظام."
    }
  },
  "skeleton_berserker": {
    "role": {
      "en": "Axe and shield fighter",
      "tr": "Balta ve kalkan savaşçısı",
      "es": "Luchador con hacha y escudo",
      "ar": "مقاتل بالفأس والدرع"
    },
    "summary": {
      "en": "A risen arena champion with a battle axe and spiked shield who breaks defenses from above, shield-bashes and heals in combat.",
      "tr": "Savaş baltası ve dikenli kalkan taşıyan dirilmiş arena şampiyonu; yukarıdan savunmayı kırar, kalkanla vurur ve iyileşir.",
      "es": "Campeón resucitado con hacha y escudo espinoso que rompe defensas desde arriba, golpea con el escudo y se cura en combate.",
      "ar": "بطل ساحة عائد بفأس قتال ودرع شائك يكسر الدفاع من الأعلى ويضرب بالدرع ويتعافى أثناء القتال."
    }
  }
};
const ABILITIES: Record<AbilityKind, { name: Texts; description: Texts }> = {
  "sword_rush": {
    "name": {
      "en": "Heroic Charge",
      "tr": "Kahraman Hücumu",
      "es": "Carga heroica",
      "ar": "الاندفاع البطولي"
    },
    "description": {
      "en": "Dash forward with a wide slash that breaks blocks.",
      "tr": "İleri atılarak geniş, blok kıran bir darbe indir.",
      "es": "Avanza con un corte amplio que rompe bloqueos.",
      "ar": "اندفع للأمام بضربة واسعة تكسر الصد."
    }
  },
  "sword_warcry": {
    "name": {
      "en": "Oath of Steel",
      "tr": "Çelik Yemini",
      "es": "Juramento de acero",
      "ar": "عهد الفولاذ"
    },
    "description": {
      "en": "Push nearby enemies away; restore 30 HP and 35 stamina; gain 25% damage for 5 s.",
      "tr": "Yakındaki düşmanları it; 30 can ve 35 dayanıklılık yenile; 5 sn boyunca %25 hasar kazan.",
      "es": "Aleja a los enemigos; recupera 30 de vida y 35 de resistencia; gana 25 % de daño durante 5 s.",
      "ar": "ادفع الأعداء، واستعد 30 صحة و35 قدرة تحمل، واكسب ضررًا إضافيًا 25٪ لمدة 5 ثوانٍ."
    }
  },
  "sword_judgment": {
    "name": {
      "en": "Heavenly Judgment",
      "tr": "Göklerin Hükmü",
      "es": "Juicio celestial",
      "ar": "حكم السماء"
    },
    "description": {
      "en": "Leap and strike down for 34 damage, breaking blocks.",
      "tr": "Sıçrayıp yukarıdan 34 hasar veren, blok kıran bir darbe indir.",
      "es": "Salta y golpea desde arriba con 34 de daño, rompiendo bloqueos.",
      "ar": "اقفز واضرب من الأعلى بضرر 34 مع كسر الصد."
    }
  },
  "dual_cyclone": {
    "name": {
      "en": "Dance of Steel",
      "tr": "Çelik Dansı",
      "es": "Danza de acero",
      "ar": "رقصة الفولاذ"
    },
    "description": {
      "en": "Steer a 360° dual-blade whirlwind for up to three hits.",
      "tr": "Yönlendirilebilir 360° çift kılıç kasırgasıyla en fazla üç kez vur.",
      "es": "Dirige un torbellino de 360° con dos espadas y hasta tres golpes.",
      "ar": "وجّه دوامة سيفين بزاوية 360° لما يصل إلى ثلاث ضربات."
    }
  },
  "dual_dagger": {
    "name": {
      "en": "Throwing Blade",
      "tr": "Fırlatma Bıçağı",
      "es": "Hoja arrojadiza",
      "ar": "النصل القاذف"
    },
    "description": {
      "en": "Throw a dagger 15.5 m for 22 damage and gain 25% speed for 3.5 s.",
      "tr": "15,5 m menzilli hançerle 22 hasar ver ve 3,5 sn boyunca %25 hız kazan.",
      "es": "Lanza una daga a 15,5 m con 22 de daño y gana 25 % de velocidad durante 3,5 s.",
      "ar": "ارم خنجرًا لمسافة 15.5 م بضرر 22 واكسب سرعة 25٪ لمدة 3.5 ثانية."
    }
  },
  "dual_shadowstep": {
    "name": {
      "en": "Shadow Rush",
      "tr": "Gölge Hücumu",
      "es": "Ataque sombrío",
      "ar": "اندفاع الظل"
    },
    "description": {
      "en": "Dash through enemies for 28 damage, break blocks and restore 25 stamina.",
      "tr": "Düşmanların içinden atıl; 28 hasar ver, bloğu kır ve 25 dayanıklılık yenile.",
      "es": "Atraviesa enemigos, inflige 28 de daño, rompe bloqueos y recupera 25 de resistencia.",
      "ar": "اندفع عبر الأعداء بضرر 28 واكسر الصد واستعد 25 قدرة تحمل."
    }
  },
  "spear_dragon": {
    "name": {
      "en": "Dragon Thrust",
      "tr": "Ejderha Hamlesi",
      "es": "Estocada del dragón",
      "ar": "طعنة التنين"
    },
    "description": {
      "en": "Dash 4.4 m forward, breaking blocks and knocking enemies back.",
      "tr": "4,4 m ileri atıl, blokları kır ve düşmanları geri it.",
      "es": "Avanza 4,4 m, rompe bloqueos y repele enemigos.",
      "ar": "اندفع 4.4 م للأمام واكسر الصد وادفع الأعداء للخلف."
    }
  },
  "spear_sweep": {
    "name": {
      "en": "Circular Guard",
      "tr": "Dairesel Savunma",
      "es": "Defensa circular",
      "ar": "الحماية الدائرية"
    },
    "description": {
      "en": "Sweep 360° to knock enemies back, then leap backwards.",
      "tr": "360° süpürerek düşmanları geri it ve geriye sıçra.",
      "es": "Barre 360° para repeler enemigos y salta hacia atrás.",
      "ar": "اضرب حولك بزاوية 360° لدفع الأعداء ثم اقفز للخلف."
    }
  },
  "spear_javelin": {
    "name": {
      "en": "Siege Javelin",
      "tr": "Kuşatma Ciridi",
      "es": "Jabalina de asedio",
      "ar": "حربة الحصار"
    },
    "description": {
      "en": "Throw a spear 19 m for 28 damage, knockback and a brief stun.",
      "tr": "19 m cirit fırlat; 28 hasar, geri itme ve kısa sersemletme uygula.",
      "es": "Lanza una jabalina a 19 m con 28 de daño, empuje y aturdimiento breve.",
      "ar": "ارم حربة لمسافة 19 م بضرر 28 مع دفع وصعق قصير."
    }
  },
  "hammer_ram": {
    "name": {
      "en": "Siege Ram",
      "tr": "Kuşatma Koçu",
      "es": "Ariete de asedio",
      "ar": "كبش الحصار"
    },
    "description": {
      "en": "Charge behind your shield, knocking enemies back and stunning them for 1.15 s.",
      "tr": "Kalkanınla hücum et; düşmanları geri it ve 1,15 sn sersemlet.",
      "es": "Carga con el escudo, repele enemigos y atúrdelos 1,15 s.",
      "ar": "اندفع بالدرع وادفع الأعداء وصعقهم لمدة 1.15 ثانية."
    }
  },
  "hammer_quake": {
    "name": {
      "en": "Titan’s Wrath",
      "tr": "Titanın Gazabı",
      "es": "Ira del titán",
      "ar": "غضب الجبار"
    },
    "description": {
      "en": "Strike the ground in a 4.2 m area and reduce incoming damage by 35% for 5.5 s.",
      "tr": "4,2 m alanda yere vur ve 5,5 sn boyunca alınan hasarı %35 azalt.",
      "es": "Golpea el suelo en un área de 4,2 m y reduce el daño recibido un 35 % durante 5,5 s.",
      "ar": "اضرب الأرض ضمن 4.2 م وخفّض الضرر الوارد 35٪ لمدة 5.5 ثانية."
    }
  },
  "hammer_forge": {
    "name": {
      "en": "Bastion’s Horn",
      "tr": "Hisar Borusu",
      "es": "Cuerno del bastión",
      "ar": "بوق الحصن"
    },
    "description": {
      "en": "Restore 34 HP and 40 stamina; gain 25% damage for 4.5 s.",
      "tr": "34 can ve 40 dayanıklılık yenile; 4,5 sn boyunca %25 hasar kazan.",
      "es": "Recupera 34 de vida y 40 de resistencia; gana 25 % de daño durante 4,5 s.",
      "ar": "استعد 34 صحة و40 قدرة تحمل واكسب ضررًا 25٪ لمدة 4.5 ثانية."
    }
  },
  "barb_leap": {
    "name": {
      "en": "Crusher’s Leap",
      "tr": "Yıkıcı Sıçrayış",
      "es": "Salto demoledor",
      "ar": "قفزة الساحق"
    },
    "description": {
      "en": "Leap forward with an axe strike for 35 damage that breaks blocks.",
      "tr": "İleri sıçrayıp blok kıran 35 hasarlı balta darbesi indir.",
      "es": "Salta hacia delante con un hachazo de 35 de daño que rompe bloqueos.",
      "ar": "اقفز للأمام بضربة فأس بضرر 35 تكسر الصد."
    }
  },
  "barb_rage": {
    "name": {
      "en": "Blood Rage",
      "tr": "Kan Öfkesi",
      "es": "Furia sangrienta",
      "ar": "غضب الدم"
    },
    "description": {
      "en": "Knock nearby enemies back; gain 25% damage and speed for 5.5 s.",
      "tr": "Yakındaki düşmanları it; 5,5 sn boyunca %25 hasar ve hız kazan.",
      "es": "Repele enemigos cercanos; gana 25 % de daño y velocidad durante 5,5 s.",
      "ar": "ادفع الأعداء القريبين واكسب 25٪ ضررًا وسرعة لمدة 5.5 ثانية."
    }
  },
  "barb_hatchet": {
    "name": {
      "en": "Throwing Axe",
      "tr": "Fırlatma Baltası",
      "es": "Hacha arrojadiza",
      "ar": "الفأس القاذفة"
    },
    "description": {
      "en": "Throw an axe 16.5 m for 26 damage and a 0.55 s stun.",
      "tr": "16,5 m balta fırlat; 26 hasar ver ve 0,55 sn sersemlet.",
      "es": "Lanza un hacha a 16,5 m con 26 de daño y 0,55 s de aturdimiento.",
      "ar": "ارم فأسًا لمسافة 16.5 م بضرر 26 وصعق لمدة 0.55 ثانية."
    }
  },
  "duelist_lunge": {
    "name": {
      "en": "Flash Lunge",
      "tr": "Ani Hamle",
      "es": "Estocada relámpago",
      "ar": "الطعنة الخاطفة"
    },
    "description": {
      "en": "Thrust 3.9 m forward for 29 damage, breaking blocks and interrupting enemies.",
      "tr": "3,9 m ileri hamleyle 29 hasar ver, bloğu kır ve düşmanı durdur.",
      "es": "Avanza 3,9 m con 29 de daño, rompe bloqueos e interrumpe al enemigo.",
      "ar": "اطعن للأمام 3.9 م بضرر 29 واكسر الصد واقطع هجوم العدو."
    }
  },
  "duelist_riposte": {
    "name": {
      "en": "Duelist’s Pirouette",
      "tr": "Düellocu Pirueti",
      "es": "Pirueta del duelista",
      "ar": "دوران المبارز"
    },
    "description": {
      "en": "Slash 360°, leap back and gain 25% speed for 4 s.",
      "tr": "360° kes, geriye sıçra ve 4 sn boyunca %25 hız kazan.",
      "es": "Corta 360°, salta atrás y gana 25 % de velocidad durante 4 s.",
      "ar": "اضرب 360° واقفز للخلف واكسب سرعة 25٪ لمدة 4 ثوانٍ."
    }
  },
  "duelist_bomb": {
    "name": {
      "en": "Powder Grenade",
      "tr": "Barut Bombası",
      "es": "Granada de pólvora",
      "ar": "قنبلة البارود"
    },
    "description": {
      "en": "Throw a bomb 14.5 m for 18 damage and a 1 s stun.",
      "tr": "14,5 m bomba fırlat; 18 hasar ver ve 1 sn sersemlet.",
      "es": "Lanza una bomba a 14,5 m con 18 de daño y 1 s de aturdimiento.",
      "ar": "ارم قنبلة لمسافة 14.5 م بضرر 18 وصعق لمدة ثانية."
    }
  },
  "sk_crypt_charge": {
    "name": {
      "en": "Crypt Charge",
      "tr": "Mahzen Hücumu",
      "es": "Carga de la cripta",
      "ar": "اندفاع القبو"
    },
    "description": {
      "en": "Charge with your shield, stun for 1.1 s and reduce incoming damage by 35% for 4.5 s.",
      "tr": "Kalkanla hücum et, 1,1 sn sersemlet ve 4,5 sn alınan hasarı %35 azalt.",
      "es": "Carga con el escudo, aturde 1,1 s y reduce el daño recibido un 35 % durante 4,5 s.",
      "ar": "اندفع بالدرع واصعق لمدة 1.1 ثانية وخفّض الضرر الوارد 35٪ لمدة 4.5 ثانية."
    }
  },
  "sk_soul_cleave": {
    "name": {
      "en": "Soul Harvest",
      "tr": "Ruh Hasadı",
      "es": "Cosecha de almas",
      "ar": "حصاد الأرواح"
    },
    "description": {
      "en": "Slash 360° for 26 damage and steal 22 HP per enemy hit.",
      "tr": "360° keserek 26 hasar ver ve vurulan düşman başına 22 can çal.",
      "es": "Corta 360° con 26 de daño y roba 22 de vida por enemigo alcanzado.",
      "ar": "اضرب 360° بضرر 26 وامتص 22 صحة من كل عدو تصيبه."
    }
  },
  "sk_grave_slam": {
    "name": {
      "en": "Grave Rupture",
      "tr": "Mezar Yarması",
      "es": "Ruptura sepulcral",
      "ar": "شق القبر"
    },
    "description": {
      "en": "Leap and slam the ground for 34 damage, breaking blocks and shaking the area.",
      "tr": "Sıçrayıp yere vur; 34 hasar ver, bloğu kır ve çevreyi sars.",
      "es": "Salta y golpea el suelo con 34 de daño, rompiendo bloqueos y sacudiendo el área.",
      "ar": "اقفز واضرب الأرض بضرر 34 واكسر الصد وهز المنطقة."
    }
  },
  "sr_bone_whirl": {
    "name": {
      "en": "Bone Whirlwind",
      "tr": "Kemik Kasırgası",
      "es": "Torbellino de huesos",
      "ar": "دوامة العظام"
    },
    "description": {
      "en": "A steerable, fast 360° whirlwind with three hits.",
      "tr": "Yönlendirilebilir, hızlı ve üç vuruşlu 360° kasırga.",
      "es": "Un torbellino rápido y dirigible de 360° con tres golpes.",
      "ar": "دوامة سريعة قابلة للتوجيه بزاوية 360° وثلاث ضربات."
    }
  },
  "sr_reaper_leap": {
    "name": {
      "en": "Vampire Leap",
      "tr": "Vampir Sıçrayışı",
      "es": "Salto vampírico",
      "ar": "قفزة مصاص الدماء"
    },
    "description": {
      "en": "Leap for 29 damage, break blocks and steal 20 HP on hit.",
      "tr": "Sıçrayarak 29 hasar ver, bloğu kır ve isabette 20 can çal.",
      "es": "Salta con 29 de daño, rompe bloqueos y roba 20 de vida al impactar.",
      "ar": "اقفز بضرر 29 واكسر الصد وامتص 20 صحة عند الإصابة."
    }
  },
  "sr_bone_shard": {
    "name": {
      "en": "Bone Shard",
      "tr": "Kemik Parçası",
      "es": "Fragmento óseo",
      "ar": "شظية عظم"
    },
    "description": {
      "en": "Throw a shard 17 m for 23 damage; gain 25% speed for 3.5 s.",
      "tr": "17 m kemik parçası fırlatıp 23 hasar ver; 3,5 sn %25 hız kazan.",
      "es": "Lanza un fragmento a 17 m con 23 de daño; gana 25 % de velocidad durante 3,5 s.",
      "ar": "ارم شظية لمسافة 17 م بضرر 23 واكسب سرعة 25٪ لمدة 3.5 ثانية."
    }
  },
  "sb_execution": {
    "name": {
      "en": "Gladiator’s Execution",
      "tr": "Gladyatör İnfazı",
      "es": "Ejecución del gladiador",
      "ar": "إعدام المصارع"
    },
    "description": {
      "en": "Leap with an axe for 33 damage, breaking blocks and knocking enemies down.",
      "tr": "Baltayla sıçrayıp 33 hasar ver, bloğu kır ve düşmanı yere ser.",
      "es": "Salta con el hacha para causar 33 de daño, romper bloqueos y derribar enemigos.",
      "ar": "اقفز بالفأس بضرر 33 واكسر الصد وأسقط الأعداء."
    }
  },
  "sb_shield_bash": {
    "name": {
      "en": "Spiked Shield Bash",
      "tr": "Dikenli Kalkan Darbesi",
      "es": "Golpe de escudo espinoso",
      "ar": "ضربة الدرع الشائك"
    },
    "description": {
      "en": "Bash with your shield, stun for 1.1 s and restore 25 stamina.",
      "tr": "Kalkanla vur, 1,1 sn sersemlet ve 25 dayanıklılık yenile.",
      "es": "Golpea con el escudo, aturde 1,1 s y recupera 25 de resistencia.",
      "ar": "اضرب بالدرع واصعق لمدة 1.1 ثانية واستعد 25 قدرة تحمل."
    }
  },
  "sb_undying_fury": {
    "name": {
      "en": "Undying Will",
      "tr": "Ölümsüz İrade",
      "es": "Voluntad inmortal",
      "ar": "إرادة الخلود"
    },
    "description": {
      "en": "Heal 28 HP, gain 25% damage for 5 s and knock nearby enemies back.",
      "tr": "28 can yenile, 5 sn %25 hasar kazan ve yakındaki düşmanları it.",
      "es": "Cura 28 de vida, gana 25 % de daño durante 5 s y repele enemigos cercanos.",
      "ar": "استعد 28 صحة واكسب ضررًا 25٪ لمدة 5 ثوانٍ وادفع الأعداء القريبين."
    }
  }
};
export function heroText(id: KnightClassId, field: 'role' | 'summary', lang: Lang, russian: string): string {
  return lang === 'ru' ? russian : HEROES[id][field][lang];
}
export function abilityText(id: AbilityKind, field: 'name' | 'description', lang: Lang, russian: string): string {
  return lang === 'ru' ? russian : ABILITIES[id][field][lang];
}
