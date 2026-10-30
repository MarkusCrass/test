// Basic attack and defense descriptions for every hero.
import type { KnightClassId } from './classes';
import type { Lang } from './locales';
type ForeignLang = Exclude<Lang, 'ru'>;
type BasicSkill = 'light' | 'heavy' | 'defense' | 'dodge';
type Texts = Record<ForeignLang, string>;
const DATA: Record<KnightClassId, Record<BasicSkill, { name: Texts; description: Texts }>> = {
  "sword": {
    "light": {
      "name": {
        "en": "Slashing combo",
        "tr": "Kesme kombosu",
        "es": "Combo cortante",
        "ar": "سلسلة القطع"
      },
      "description": {
        "en": "Three wide sword strikes while stepping forward, ideal for pressure.",
        "tr": "İleri adımla üç geniş kılıç darbesi; baskı kurmak için idealdir.",
        "es": "Tres tajos amplios avanzando, ideales para presionar.",
        "ar": "ثلاث ضربات سيف واسعة أثناء التقدم، مثالية للضغط."
      }
    },
    "heavy": {
      "name": {
        "en": "Charged slash",
        "tr": "Yüklü kesiş",
        "es": "Corte cargado",
        "ar": "الضربة المشحونة"
      },
      "description": {
        "en": "Hold left mouse for a powerful overhead slash that breaks weakened guards.",
        "tr": "Zayıflamış savunmayı kıran güçlü üst darbe için sol fareyi basılı tut.",
        "es": "Mantén el botón izquierdo para un tajo potente que rompe defensas debilitadas.",
        "ar": "اضغط الزر الأيسر لضربة علوية قوية تكسر الدفاع الضعيف."
      }
    },
    "defense": {
      "name": {
        "en": "Sword block",
        "tr": "Kılıç bloğu",
        "es": "Bloqueo con espada",
        "ar": "صد بالسيف"
      },
      "description": {
        "en": "Hold right mouse to block frontal attacks at the cost of stamina.",
        "tr": "Önden gelen saldırıları dayanıklılık harcayarak engellemek için sağ fareyi tut.",
        "es": "Mantén el botón derecho para bloquear ataques frontales consumiendo resistencia.",
        "ar": "اضغط الزر الأيمن لصد الهجمات الأمامية مقابل التحمل."
      }
    },
    "dodge": {
      "name": {
        "en": "Dodge roll",
        "tr": "Kaçınma taklası",
        "es": "Voltereta evasiva",
        "ar": "دحرجة مراوغة"
      },
      "description": {
        "en": "Roll with a brief window of invulnerability.",
        "tr": "Kısa süreli dokunulmazlıkla yuvarlan.",
        "es": "Rueda con un breve periodo de invulnerabilidad.",
        "ar": "تدحرج مع فترة حصانة قصيرة."
      }
    }
  },
  "dual": {
    "light": {
      "name": {
        "en": "Twin-blade flurry",
        "tr": "Çift kılıç serisi",
        "es": "Ráfaga de espadas",
        "ar": "وابل السيفين"
      },
      "description": {
        "en": "A fast three-hit combo ending in a cross slash.",
        "tr": "Çapraz kesişle biten hızlı üç vuruşluk kombo.",
        "es": "Combo rápido de tres golpes con corte cruzado final.",
        "ar": "سلسلة سريعة من ثلاث ضربات تنتهي بقطع متقاطع."
      }
    },
    "heavy": {
      "name": {
        "en": "Whirling lunge",
        "tr": "Dönen hamle",
        "es": "Estocada giratoria",
        "ar": "اندفاع دوّار"
      },
      "description": {
        "en": "Hold left mouse to rush forward with both blades.",
        "tr": "İki kılıçla ileri atılmak için sol fareyi basılı tut.",
        "es": "Mantén el botón izquierdo para avanzar con ambas espadas.",
        "ar": "اضغط الزر الأيسر للاندفاع بالسيفين."
      }
    },
    "defense": {
      "name": {
        "en": "Quick parry",
        "tr": "Hızlı savuşturma",
        "es": "Parada rápida",
        "ar": "تصدي سريع"
      },
      "description": {
        "en": "Right mouse: parry within 0.28 s to block and stun a nearby attacker.",
        "tr": "Sağ fare: 0,28 sn içinde savuştur; saldırıyı engelle ve yakındaki saldırganı sersemlet.",
        "es": "Botón derecho: para en 0,28 s para bloquear y aturdir al atacante cercano.",
        "ar": "الزر الأيمن: تصدّ خلال 0.28 ثانية لصد الضربة وصعق المهاجم القريب."
      }
    },
    "dodge": {
      "name": {
        "en": "Quick dash",
        "tr": "Hızlı atılma",
        "es": "Desplazamiento rápido",
        "ar": "اندفاع سريع"
      },
      "description": {
        "en": "Dash a long distance with low stamina cost.",
        "tr": "Az dayanıklılık harcayarak uzun mesafeye atıl.",
        "es": "Desplázate lejos con poco gasto de resistencia.",
        "ar": "اندفع مسافة طويلة بتكلفة تحمل منخفضة."
      }
    }
  },
  "spear": {
    "light": {
      "name": {
        "en": "Pike thrusts",
        "tr": "Mızrak hamleleri",
        "es": "Estocadas de pica",
        "ar": "طعنات الرمح"
      },
      "description": {
        "en": "Long-range thrusts keep enemies at a safe distance.",
        "tr": "Uzun menzilli hamleler düşmanları güvenli mesafede tutar.",
        "es": "Estocadas de largo alcance mantienen a los enemigos a distancia.",
        "ar": "طعنات بعيدة المدى تُبقي الأعداء على مسافة آمنة."
      }
    },
    "heavy": {
      "name": {
        "en": "Charged thrust",
        "tr": "Yüklü hamle",
        "es": "Estocada cargada",
        "ar": "الطعنة المشحونة"
      },
      "description": {
        "en": "Hold left mouse for a powerful long-range piercing thrust.",
        "tr": "Güçlü ve uzun menzilli delici hamle için sol fareyi basılı tut.",
        "es": "Mantén el botón izquierdo para una estocada perforante de largo alcance.",
        "ar": "اضغط الزر الأيسر لطعنة قوية بعيدة المدى."
      }
    },
    "defense": {
      "name": {
        "en": "Pole deflection",
        "tr": "Sırık savurması",
        "es": "Desvío con asta",
        "ar": "صد بالرمح"
      },
      "description": {
        "en": "Right mouse: deflect a blow and push nearby enemies away.",
        "tr": "Sağ fare: darbeyi savuştur ve yakındaki düşmanları it.",
        "es": "Botón derecho: desvía el golpe y aleja enemigos cercanos.",
        "ar": "الزر الأيمن: اصد الضربة وادفع الأعداء القريبين."
      }
    },
    "dodge": {
      "name": {
        "en": "Backstep",
        "tr": "Geri adım",
        "es": "Paso atrás",
        "ar": "خطوة للخلف"
      },
      "description": {
        "en": "Leap backwards or in your movement direction to create distance.",
        "tr": "Mesafe açmak için geriye veya hareket yönüne sıçra.",
        "es": "Salta atrás o en tu dirección de movimiento para tomar distancia.",
        "ar": "اقفز للخلف أو باتجاه حركتك لزيادة المسافة."
      }
    }
  },
  "hammer": {
    "light": {
      "name": {
        "en": "Crushing hammer",
        "tr": "Ezici çekiç",
        "es": "Martillo aplastante",
        "ar": "المطرقة الساحقة"
      },
      "description": {
        "en": "Wide hammer swings knock enemies back and strain their guard.",
        "tr": "Geniş çekiç darbeleri düşmanları iter ve savunmalarını zorlar.",
        "es": "Los golpes amplios de martillo empujan y debilitan la defensa enemiga.",
        "ar": "ضربات مطرقة واسعة تدفع الأعداء وتستنزف دفاعهم."
      }
    },
    "heavy": {
      "name": {
        "en": "Hammer slam",
        "tr": "Çekiç darbesi",
        "es": "Golpe de martillo",
        "ar": "ضربة المطرقة"
      },
      "description": {
        "en": "Hold left mouse for an unblockable hammer slam into the ground.",
        "tr": "Engellenemeyen yer darbesi için sol fareyi basılı tut.",
        "es": "Mantén el botón izquierdo para un golpe de martillo imbloqueable al suelo.",
        "ar": "اضغط الزر الأيسر لضربة مطرقة أرضية لا يمكن صدها."
      }
    },
    "defense": {
      "name": {
        "en": "Tower shield block",
        "tr": "Kule kalkanı bloğu",
        "es": "Bloqueo con escudo torre",
        "ar": "صد الدرع الكبير"
      },
      "description": {
        "en": "Right mouse: guard a wide 155° arc with low stamina cost.",
        "tr": "Sağ fare: 155° geniş açıyla az dayanıklılık harcayarak korun.",
        "es": "Botón derecho: protege un arco de 155° con bajo coste de resistencia.",
        "ar": "الزر الأيمن: احمِ زاوية 155° بتكلفة تحمل منخفضة."
      }
    },
    "dodge": {
      "name": {
        "en": "Shield shove",
        "tr": "Kalkan itişi",
        "es": "Empujón con escudo",
        "ar": "دفعة الدرع"
      },
      "description": {
        "en": "Step forward with your shield and push enemies in front of you.",
        "tr": "Kalkanla ileri adım at ve önündeki düşmanları it.",
        "es": "Avanza con el escudo y empuja a los enemigos delante.",
        "ar": "تقدم بالدرع وادفع الأعداء أمامك."
      }
    }
  },
  "barbarian": {
    "light": {
      "name": {
        "en": "Axe combo",
        "tr": "Balta kombosu",
        "es": "Combo de hacha",
        "ar": "سلسلة الفأس"
      },
      "description": {
        "en": "Three wide axe strikes deal heavy damage to shields.",
        "tr": "Üç geniş balta darbesi kalkanlara ağır hasar verir.",
        "es": "Tres golpes amplios de hacha dañan mucho los escudos.",
        "ar": "ثلاث ضربات فأس واسعة تلحق ضررًا كبيرًا بالدروع."
      }
    },
    "heavy": {
      "name": {
        "en": "Northern guillotine",
        "tr": "Kuzey giyotini",
        "es": "Guillotina del norte",
        "ar": "مقصلة الشمال"
      },
      "description": {
        "en": "Hold left mouse for an unblockable circular axe strike with hyper armor.",
        "tr": "Süper zırhlı, engellenemez dairesel balta darbesi için sol fareyi tut.",
        "es": "Mantén el botón izquierdo para un hachazo circular imbloqueable con superarmadura.",
        "ar": "اضغط الزر الأيسر لضربة فأس دائرية لا تصد مع درع فائق."
      }
    },
    "defense": {
      "name": {
        "en": "Axe block",
        "tr": "Balta bloğu",
        "es": "Bloqueo con hacha",
        "ar": "صد بالفأس"
      },
      "description": {
        "en": "Right mouse: brace your axe against frontal attacks.",
        "tr": "Sağ fare: önden gelen saldırıları baltanla engelle.",
        "es": "Botón derecho: usa el hacha para bloquear ataques frontales.",
        "ar": "الزر الأيمن: استخدم الفأس لصد الهجمات الأمامية."
      }
    },
    "dodge": {
      "name": {
        "en": "Predator dash",
        "tr": "Avcı atılması",
        "es": "Avance depredador",
        "ar": "اندفاع المفترس"
      },
      "description": {
        "en": "A powerful invulnerable roll to close the distance.",
        "tr": "Mesafeyi kapatmak için dokunulmaz güçlü bir takla.",
        "es": "Una voltereta potente e invulnerable para acercarse.",
        "ar": "دحرجة قوية بحصانة للاقتراب من الهدف."
      }
    }
  },
  "duelist": {
    "light": {
      "name": {
        "en": "Fencing combo",
        "tr": "Eskrim kombosu",
        "es": "Combo de esgrima",
        "ar": "سلسلة المبارزة"
      },
      "description": {
        "en": "Three precise sword strikes advance into a swift lunge.",
        "tr": "Üç isabetli kılıç darbesi hızlı bir hamleye dönüşür.",
        "es": "Tres golpes precisos avanzan hacia una rápida estocada.",
        "ar": "ثلاث ضربات سيف دقيقة تتقدم إلى طعنة سريعة."
      }
    },
    "heavy": {
      "name": {
        "en": "Grandmaster thrust",
        "tr": "Usta hamlesi",
        "es": "Estocada del maestro",
        "ar": "طعنة الأستاذ"
      },
      "description": {
        "en": "Hold left mouse for a swift long-range rapier thrust.",
        "tr": "Hızlı ve uzun menzilli meç hamlesi için sol fareyi tut.",
        "es": "Mantén el botón izquierdo para una estocada rápida y larga.",
        "ar": "اضغط الزر الأيسر لطعنة سريعة بعيدة المدى."
      }
    },
    "defense": {
      "name": {
        "en": "Buckler parry",
        "tr": "Küçük kalkan savuşturması",
        "es": "Parada con rodela",
        "ar": "تصدي بالترس"
      },
      "description": {
        "en": "Right mouse: parry within 0.32 s to stun the attacker for 1.25 s.",
        "tr": "Sağ fare: 0,32 sn içinde savuştur; saldırganı 1,25 sn sersemlet.",
        "es": "Botón derecho: para en 0,32 s para aturdir al atacante 1,25 s.",
        "ar": "الزر الأيمن: تصدّ خلال 0.32 ثانية لصعق المهاجم 1.25 ثانية."
      }
    },
    "dodge": {
      "name": {
        "en": "Fencing step",
        "tr": "Eskrim adımı",
        "es": "Paso de esgrima",
        "ar": "خطوة المبارزة"
      },
      "description": {
        "en": "A nimble, highly maneuverable dash.",
        "tr": "Çevik ve kolay yönlendirilen bir atılma.",
        "es": "Un desplazamiento ágil y maniobrable.",
        "ar": "اندفاع رشيق وسهل المناورة."
      }
    }
  },
  "skeleton_knight": {
    "light": {
      "name": {
        "en": "Crypt blade",
        "tr": "Mahzen kılıcı",
        "es": "Hoja de la cripta",
        "ar": "نصل القبو"
      },
      "description": {
        "en": "A relentless blade combo behind a large shield.",
        "tr": "Büyük kalkanın ardında amansız kılıç kombosu.",
        "es": "Un combo implacable de espada tras un gran escudo.",
        "ar": "سلسلة سيف متواصلة خلف درع كبير."
      }
    },
    "heavy": {
      "name": {
        "en": "Grave blade judgment",
        "tr": "Mezar kılıcı hükmü",
        "es": "Juicio sepulcral",
        "ar": "حكم نصل القبر"
      },
      "description": {
        "en": "Hold left mouse for a heavy strike with hyper armor that breaks guards and pushes enemies.",
        "tr": "Süper zırhlı, blok kıran ve düşmanları iten ağır darbe için sol fareyi tut.",
        "es": "Mantén el botón izquierdo para un golpe con superarmadura que rompe defensas y empuja.",
        "ar": "اضغط الزر الأيسر لضربة ثقيلة بدرع فائق تكسر الدفاع وتدفع الأعداء."
      }
    },
    "defense": {
      "name": {
        "en": "Cursed shield",
        "tr": "Lanetli kalkan",
        "es": "Escudo maldito",
        "ar": "الدرع الملعون"
      },
      "description": {
        "en": "Right mouse: guard 148° in front and absorb 92% of damage.",
        "tr": "Sağ fare: önde 148° koru ve hasarın %92’sini em.",
        "es": "Botón derecho: protege 148° al frente y absorbe el 92 % del daño.",
        "ar": "الزر الأيمن: احمِ زاوية 148° أمامك وامتص 92٪ من الضرر."
      }
    },
    "dodge": {
      "name": {
        "en": "Crypt shove",
        "tr": "Mahzen itişi",
        "es": "Empujón de la cripta",
        "ar": "دفعة القبو"
      },
      "description": {
        "en": "Step forward with your shield to push nearby enemies.",
        "tr": "Yakındaki düşmanları itmek için kalkanla ileri adım at.",
        "es": "Avanza con el escudo para empujar enemigos cercanos.",
        "ar": "تقدم بالدرع لدفع الأعداء القريبين."
      }
    }
  },
  "skeleton_reaper": {
    "light": {
      "name": {
        "en": "Reaper blades",
        "tr": "Azrail bıçakları",
        "es": "Hojas del segador",
        "ar": "نصال الحاصد"
      },
      "description": {
        "en": "A rapid three-hit combo for closing in and finishing wounded foes.",
        "tr": "Yaklaşmak ve yaralı düşmanları bitirmek için hızlı üçlü kombo.",
        "es": "Combo rápido de tres golpes para acercarse y rematar enemigos heridos.",
        "ar": "سلسلة سريعة من ثلاث ضربات للاقتراب والإجهاز على المصابين."
      }
    },
    "heavy": {
      "name": {
        "en": "Phantom execution",
        "tr": "Hayalet infazı",
        "es": "Ejecución espectral",
        "ar": "إعدام الشبح"
      },
      "description": {
        "en": "Hold left mouse to leap and strike with both bone blades.",
        "tr": "İki kemik bıçakla sıçrayıp vurmak için sol fareyi tut.",
        "es": "Mantén el botón izquierdo para saltar y golpear con ambas hojas óseas.",
        "ar": "اضغط الزر الأيسر للقفز والضرب بنصلي العظام."
      }
    },
    "defense": {
      "name": {
        "en": "Phantom parry",
        "tr": "Hayalet savuşturması",
        "es": "Parada espectral",
        "ar": "تصدي الشبح"
      },
      "description": {
        "en": "Right mouse: parry within 0.28 s to stun the attacker for 1.1 s.",
        "tr": "Sağ fare: 0,28 sn içinde savuştur ve saldırganı 1,1 sn sersemlet.",
        "es": "Botón derecho: para en 0,28 s y aturde al atacante 1,1 s.",
        "ar": "الزر الأيمن: تصدّ خلال 0.28 ثانية لصعق المهاجم 1.1 ثانية."
      }
    },
    "dodge": {
      "name": {
        "en": "Mist step",
        "tr": "Sis adımı",
        "es": "Paso de niebla",
        "ar": "خطوة الضباب"
      },
      "description": {
        "en": "A swift dash with a long invulnerability window.",
        "tr": "Uzun dokunulmazlık süresine sahip hızlı atılma.",
        "es": "Un avance rápido con larga invulnerabilidad.",
        "ar": "اندفاع سريع بفترة حصانة طويلة."
      }
    }
  },
  "skeleton_berserker": {
    "light": {
      "name": {
        "en": "Gladiator combo",
        "tr": "Gladyatör kombosu",
        "es": "Combo de gladiador",
        "ar": "سلسلة المصارع"
      },
      "description": {
        "en": "A fierce axe and shield combo that moves forward.",
        "tr": "İleri ilerleyen sert balta ve kalkan kombosu.",
        "es": "Una feroz combinación de hacha y escudo avanzando.",
        "ar": "سلسلة فأس ودرع شرسة تتقدم للأمام."
      }
    },
    "heavy": {
      "name": {
        "en": "Skull splitter",
        "tr": "Kafatası yarıcı",
        "es": "Partecráneos",
        "ar": "شاق الجمجمة"
      },
      "description": {
        "en": "Hold left mouse to leap and strike down with the axe.",
        "tr": "Baltayla sıçrayıp yukarıdan vurmak için sol fareyi tut.",
        "es": "Mantén el botón izquierdo para saltar y golpear con el hacha.",
        "ar": "اضغط الزر الأيسر للقفز وضرب الفأس من الأعلى."
      }
    },
    "defense": {
      "name": {
        "en": "Spiked buckler block",
        "tr": "Dikenli kalkan bloğu",
        "es": "Bloqueo con rodela espinosa",
        "ar": "صد الترس الشائك"
      },
      "description": {
        "en": "Right mouse: guard 130° in front with low stamina cost.",
        "tr": "Sağ fare: az dayanıklılıkla önde 130° korun.",
        "es": "Botón derecho: protege 130° al frente con bajo coste de resistencia.",
        "ar": "الزر الأيمن: احمِ زاوية 130° أمامك بتكلفة تحمل منخفضة."
      }
    },
    "dodge": {
      "name": {
        "en": "Gladiator roll",
        "tr": "Gladyatör taklası",
        "es": "Voltereta de gladiador",
        "ar": "دحرجة المصارع"
      },
      "description": {
        "en": "A quick combat roll to evade attacks.",
        "tr": "Saldırılardan kaçmak için hızlı savaş taklası.",
        "es": "Una voltereta rápida para esquivar ataques.",
        "ar": "دحرجة قتالية سريعة لتفادي الهجمات."
      }
    }
  }
};
export function coreSkillText(id: KnightClassId, skill: BasicSkill, field: 'name' | 'description', lang: Exclude<Lang, 'ru'>): string { return DATA[id][skill][field][lang]; }
