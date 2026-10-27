export type KnightClassId = 'sword' | 'dual' | 'spear' | 'hammer';

export type AttackAnimStyle =
  | 'slash_right'
  | 'slash_left'
  | 'overhead_cleave'
  | 'dual_left'
  | 'dual_right'
  | 'dual_cross'
  | 'dual_finisher'
  | 'spear_poke'
  | 'spear_impale'
  | 'hammer_swing'
  | 'hammer_slam';

export interface AttackConfig {
  id: string;
  name: string;
  isHeavy: boolean;
  damage: number;
  windupDuration: number;
  activeDuration: number;
  recoveryDuration: number;
  range: number;
  hitAngleDeg: number;
  staminaCost: number;
  knockback: number;
  blockable: boolean;
  guardStaminaDamage: number;
  interruptible: boolean;
  lungeSpeed: number;
  maxTurnRateWindup: number; // rad/sec allowed during windup (0 during active/recovery)
  stunDurationOnHit: number; // hit reaction / stagger duration
  animStyle: AttackAnimStyle;
}

export type DefenseMode =
  | 'directional_block'
  | 'timed_parry'
  | 'spear_deflect'
  | 'heavy_shield';

export interface DefenseConfig {
  mode: DefenseMode;
  name: string;
  description: string;
  blockAngleDeg: number;
  damageReduction: number; // 0..1 fraction mitigated on successful block
  entryStaminaCost: number;
  holdStaminaPerSec: number;
  blockedHitStaminaFactor: number;
  activeWindow: number; // seconds (Infinity for sustained hold blocks)
  recoveryLockout: number; // seconds after releasing/finishing parry/deflect
  parryStunDuration: number; // stun applied to melee attacker if parried
  deflectPushback: number; // pushback pulse when spear deflect activates
}

export type DodgeMode = 'roll' | 'quick_dash' | 'backstep' | 'shield_shove';

export interface DodgeConfig {
  mode: DodgeMode;
  name: string;
  description: string;
  staminaCost: number;
  duration: number;
  iframesDuration: number;
  speed: number;
  defaultBackward: boolean;
  shoveRadius: number;
  shoveKnockback: number;
  shoveDamage: number;
}

export interface StaminaConfig {
  max: number;
  regenPerSec: number;
  regenDelay: number;
  sprintCostPerSec: number;
  lightAttackCost: number;
}

export interface ClassVisualConfig {
  primarySteel: number;
  secondaryArmor: number;
  clothColor: number;
  plumeColor: number;
  bodyScaleWidth: number;
  bodyScaleHeight: number;
  headScale: number;
  capsuleRadius: number;
}

export interface KnightClassConfig {
  id: KnightClassId;
  codeLabel: string;
  name: string;
  role: string;
  summary: string;
  maxHp: number;
  moveSpeed: number;
  sprintSpeed: number;
  turnSpeed: number; // rad/s outside attacks
  armorReduction: number; // passive damage mitigation 0..0.3
  heavyChargeThreshold: number; // hold LMB seconds to trigger heavy attack
  comboWindow: number; // seconds after light attack recovery to chain next step
  stamina: StaminaConfig;
  lightCombo: AttackConfig[];
  heavyAttack: AttackConfig;
  defense: DefenseConfig;
  dodge: DodgeConfig;
  uiRatings: {
    hp: number; // 1..5
    speed: number;
    attack: number;
    defense: number;
    reach: number;
  };
  abilitiesList: string[];
  visual: ClassVisualConfig;
}

export const KNIGHT_CLASSES: Record<KnightClassId, KnightClassConfig> = {
  sword: {
    id: 'sword',
    codeLabel: 'КЛАСС A',
    name: 'Рыцарь с одним мечом',
    role: 'Универсальный боец',
    summary:
      'Сбалансированный мечник в стальных латах с коротким плащом. Надёжен в дуэли и в гуще схватки.',
    maxHp: 100,
    moveSpeed: 5.7,
    sprintSpeed: 8.1,
    turnSpeed: 10.5,
    armorReduction: 0.08,
    heavyChargeThreshold: 0.34,
    comboWindow: 0.55,
    stamina: {
      max: 100,
      regenPerSec: 24,
      regenDelay: 1.05,
      sprintCostPerSec: 15,
      lightAttackCost: 9,
    },
    lightCombo: [
      {
        id: 'sword_light_1',
        name: 'Быстрый рубящий удар',
        isHeavy: false,
        damage: 18,
        windupDuration: 0.19,
        activeDuration: 0.14,
        recoveryDuration: 0.24,
        range: 2.45,
        hitAngleDeg: 105,
        staminaCost: 9,
        knockback: 4.5,
        blockable: true,
        guardStaminaDamage: 18,
        interruptible: true,
        lungeSpeed: 3.4,
        maxTurnRateWindup: 2.6,
        stunDurationOnHit: 0.24,
        animStyle: 'slash_right',
      },
      {
        id: 'sword_light_2',
        name: 'Обратный взмах клинком',
        isHeavy: false,
        damage: 21,
        windupDuration: 0.17,
        activeDuration: 0.14,
        recoveryDuration: 0.28,
        range: 2.55,
        hitAngleDeg: 115,
        staminaCost: 10,
        knockback: 5.6,
        blockable: true,
        guardStaminaDamage: 20,
        interruptible: true,
        lungeSpeed: 3.8,
        maxTurnRateWindup: 2.6,
        stunDurationOnHit: 0.27,
        animStyle: 'slash_left',
      },
    ],
    heavyAttack: {
      id: 'sword_heavy',
      name: 'Заряженный рассекающий удар',
      isHeavy: true,
      damage: 36,
      windupDuration: 0.38,
      activeDuration: 0.17,
      recoveryDuration: 0.44,
      range: 2.9,
      hitAngleDeg: 95,
      staminaCost: 26,
      knockback: 9.2,
      blockable: true,
      guardStaminaDamage: 42,
      interruptible: true,
      lungeSpeed: 5.8,
      maxTurnRateWindup: 1.35,
      stunDurationOnHit: 0.45,
      animStyle: 'overhead_cleave',
    },
    defense: {
      mode: 'directional_block',
      name: 'Направленный блок мечом',
      description: 'Удерживайте ПКМ, чтобы отражать фронтальные удары ценой выносливости.',
      blockAngleDeg: 120,
      damageReduction: 0.85,
      entryStaminaCost: 4,
      holdStaminaPerSec: 6,
      blockedHitStaminaFactor: 0.9,
      activeWindow: Infinity,
      recoveryLockout: 0.12,
      parryStunDuration: 0,
      deflectPushback: 3.2,
    },
    dodge: {
      mode: 'roll',
      name: 'Перекат-уклонение',
      description: 'Манёвр уклонения с коротким окном неуязвимости.',
      staminaCost: 22,
      duration: 0.34,
      iframesDuration: 0.24,
      speed: 10.6,
      defaultBackward: false,
      shoveRadius: 0,
      shoveKnockback: 0,
      shoveDamage: 0,
    },
    uiRatings: {
      hp: 3,
      speed: 3,
      attack: 3,
      defense: 3,
      reach: 3,
    },
    abilitiesList: [
      'Быстрый рубящий удар (связка из 2 ударов)',
      'Заряженный тяжёлый удар сверху',
      'Направленный блок мечом (ПКМ)',
      'Классическое уклонение (Space)',
    ],
    visual: {
      primarySteel: 0x9aa9b8,
      secondaryArmor: 0x475361,
      clothColor: 0xc93838,
      plumeColor: 0xf2c14e,
      bodyScaleWidth: 1.04,
      bodyScaleHeight: 1.0,
      headScale: 1.16,
      capsuleRadius: 0.52,
    },
  },

  dual: {
    id: 'dual',
    codeLabel: 'КЛАСС B',
    name: 'Рыцарь с двумя мечами',
    role: 'Мобильный агрессор',
    summary:
      'Облегчённая броня и два острых клинка. Стремительно сближается, обрушивает серии атак и ловит врагов на парировании.',
    maxHp: 85,
    moveSpeed: 6.75,
    sprintSpeed: 9.4,
    turnSpeed: 13.0,
    armorReduction: 0.0,
    heavyChargeThreshold: 0.3,
    comboWindow: 0.62,
    stamina: {
      max: 115,
      regenPerSec: 28,
      regenDelay: 0.9,
      sprintCostPerSec: 13,
      lightAttackCost: 7,
    },
    lightCombo: [
      {
        id: 'dual_light_1',
        name: 'Серия: левый клинок',
        isHeavy: false,
        damage: 13,
        windupDuration: 0.13,
        activeDuration: 0.11,
        recoveryDuration: 0.16,
        range: 2.15,
        hitAngleDeg: 100,
        staminaCost: 7,
        knockback: 2.8,
        blockable: true,
        guardStaminaDamage: 12,
        interruptible: true,
        lungeSpeed: 4.1,
        maxTurnRateWindup: 3.4,
        stunDurationOnHit: 0.19,
        animStyle: 'dual_left',
      },
      {
        id: 'dual_light_2',
        name: 'Серия: правый клинок',
        isHeavy: false,
        damage: 14,
        windupDuration: 0.12,
        activeDuration: 0.11,
        recoveryDuration: 0.16,
        range: 2.2,
        hitAngleDeg: 105,
        staminaCost: 7,
        knockback: 3.0,
        blockable: true,
        guardStaminaDamage: 13,
        interruptible: true,
        lungeSpeed: 4.3,
        maxTurnRateWindup: 3.4,
        stunDurationOnHit: 0.2,
        animStyle: 'dual_right',
      },
      {
        id: 'dual_light_3',
        name: 'Завершающий перекрёстный срез',
        isHeavy: false,
        damage: 23,
        windupDuration: 0.16,
        activeDuration: 0.14,
        recoveryDuration: 0.28,
        range: 2.4,
        hitAngleDeg: 130,
        staminaCost: 11,
        knockback: 6.4,
        blockable: true,
        guardStaminaDamage: 24,
        interruptible: true,
        lungeSpeed: 5.2,
        maxTurnRateWindup: 2.8,
        stunDurationOnHit: 0.32,
        animStyle: 'dual_cross',
      },
    ],
    heavyAttack: {
      id: 'dual_heavy',
      name: 'Вихревой двойной выпад',
      isHeavy: true,
      damage: 33,
      windupDuration: 0.3,
      activeDuration: 0.18,
      recoveryDuration: 0.38,
      range: 2.65,
      hitAngleDeg: 145,
      staminaCost: 24,
      knockback: 7.5,
      blockable: true,
      guardStaminaDamage: 34,
      interruptible: true,
      lungeSpeed: 7.2,
      maxTurnRateWindup: 1.8,
      stunDurationOnHit: 0.38,
      animStyle: 'dual_finisher',
    },
    defense: {
      mode: 'timed_parry',
      name: 'Короткое парирование',
      description:
        'Точное окно 0.28с (ПКМ): полностью отражает удар и оглушает атакующего вблизи!',
      blockAngleDeg: 135,
      damageReduction: 1.0,
      entryStaminaCost: 14,
      holdStaminaPerSec: 0,
      blockedHitStaminaFactor: 0.2,
      activeWindow: 0.28,
      recoveryLockout: 0.48,
      parryStunDuration: 1.05,
      deflectPushback: 5.0,
    },
    dodge: {
      mode: 'quick_dash',
      name: 'Быстрый рывок',
      description: 'Молниеносный рывок на большую дистанцию с малым расходом сил.',
      staminaCost: 17,
      duration: 0.26,
      iframesDuration: 0.22,
      speed: 13.4,
      defaultBackward: false,
      shoveRadius: 0,
      shoveKnockback: 0,
      shoveDamage: 0,
    },
    uiRatings: {
      hp: 2,
      speed: 5,
      attack: 4,
      defense: 1,
      reach: 2,
    },
    abilitiesList: [
      'Быстрая серия из 3 ударов с перекрёстным финалом',
      'Заряженный вихревой выпад двумя клинками',
      'Короткое парирование с оглушением врага (ПКМ)',
      'Стремительный рывок (Space)',
    ],
    visual: {
      primarySteel: 0x8d9eab,
      secondaryArmor: 0x2f3640,
      clothColor: 0x2979c9,
      plumeColor: 0x57c7ff,
      bodyScaleWidth: 0.9,
      bodyScaleHeight: 0.98,
      headScale: 1.12,
      capsuleRadius: 0.47,
    },
  },

  spear: {
    id: 'spear',
    codeLabel: 'КЛАСС C',
    name: 'Рыцарь с копьём',
    role: 'Контроль дистанции',
    summary:
      'Мастер длинного древкового оружия. Держит врагов на острие пики, отбивает натиск и уходит отступающим шагом.',
    maxHp: 90,
    moveSpeed: 5.85,
    sprintSpeed: 8.35,
    turnSpeed: 10.2,
    armorReduction: 0.05,
    heavyChargeThreshold: 0.35,
    comboWindow: 0.56,
    stamina: {
      max: 105,
      regenPerSec: 25,
      regenDelay: 1.0,
      sprintCostPerSec: 14,
      lightAttackCost: 10,
    },
    lightCombo: [
      {
        id: 'spear_light_1',
        name: 'Быстрый выпад копьём',
        isHeavy: false,
        damage: 17,
        windupDuration: 0.18,
        activeDuration: 0.13,
        recoveryDuration: 0.25,
        range: 3.55,
        hitAngleDeg: 54,
        staminaCost: 10,
        knockback: 5.2,
        blockable: true,
        guardStaminaDamage: 18,
        interruptible: true,
        lungeSpeed: 2.8,
        maxTurnRateWindup: 2.1,
        stunDurationOnHit: 0.25,
        animStyle: 'spear_poke',
      },
      {
        id: 'spear_light_2',
        name: 'Дальний укол в корпус',
        isHeavy: false,
        damage: 20,
        windupDuration: 0.19,
        activeDuration: 0.13,
        recoveryDuration: 0.28,
        range: 3.75,
        hitAngleDeg: 50,
        staminaCost: 11,
        knockback: 6.4,
        blockable: true,
        guardStaminaDamage: 22,
        interruptible: true,
        lungeSpeed: 3.2,
        maxTurnRateWindup: 2.0,
        stunDurationOnHit: 0.28,
        animStyle: 'spear_poke',
      },
    ],
    heavyAttack: {
      id: 'spear_heavy',
      name: 'Заряженный пронзающий удар',
      isHeavy: true,
      damage: 35,
      windupDuration: 0.4,
      activeDuration: 0.16,
      recoveryDuration: 0.46,
      range: 4.35,
      hitAngleDeg: 46,
      staminaCost: 26,
      knockback: 10.4,
      blockable: true,
      guardStaminaDamage: 40,
      interruptible: true,
      lungeSpeed: 5.5,
      maxTurnRateWindup: 1.15,
      stunDurationOnHit: 0.44,
      animStyle: 'spear_impale',
    },
    defense: {
      mode: 'spear_deflect',
      name: 'Отбивающий приём древком',
      description:
        'Короткий взмах древком (ПКМ): отталкивает подошедших вплотную врагов и гасит удар.',
      blockAngleDeg: 130,
      damageReduction: 0.8,
      entryStaminaCost: 15,
      holdStaminaPerSec: 0,
      blockedHitStaminaFactor: 0.65,
      activeWindow: 0.42,
      recoveryLockout: 0.4,
      parryStunDuration: 0.35,
      deflectPushback: 8.8,
    },
    dodge: {
      mode: 'backstep',
      name: 'Отступающий шаг',
      description:
        'Резкий отскок назад (или в сторону движения) для мгновенного разрыва дистанции.',
      staminaCost: 19,
      duration: 0.3,
      iframesDuration: 0.22,
      speed: 11.8,
      defaultBackward: true,
      shoveRadius: 0,
      shoveKnockback: 0,
      shoveDamage: 0,
    },
    uiRatings: {
      hp: 3,
      speed: 3,
      attack: 3,
      defense: 2,
      reach: 5,
    },
    abilitiesList: [
      'Дальнобойный быстрый выпад копьём (до 3.7м)',
      'Заряженный пронзающий укол на 4.3м',
      'Отбивающий приём с отбрасыванием вблизи (ПКМ)',
      'Отступающий шаг для контроля дистанции (Space)',
    ],
    visual: {
      primarySteel: 0xa2adb8,
      secondaryArmor: 0x454d59,
      clothColor: 0x2f8f4e,
      plumeColor: 0xe8d26b,
      bodyScaleWidth: 0.96,
      bodyScaleHeight: 1.05,
      headScale: 1.14,
      capsuleRadius: 0.49,
    },
  },

  hammer: {
    id: 'hammer',
    codeLabel: 'КЛАСС D',
    name: 'Рыцарь со щитом и молотом',
    role: 'Тяжёлый защитный танк',
    summary:
      'Массивный латник с башенным щитом и сокрушительным боевым молотом. Медлителен, но держит удар и сносит блоки.',
    maxHp: 120,
    moveSpeed: 4.65,
    sprintSpeed: 6.75,
    turnSpeed: 8.6,
    armorReduction: 0.16,
    heavyChargeThreshold: 0.38,
    comboWindow: 0.64,
    stamina: {
      max: 100,
      regenPerSec: 22,
      regenDelay: 1.15,
      sprintCostPerSec: 17,
      lightAttackCost: 12,
    },
    lightCombo: [
      {
        id: 'hammer_light_1',
        name: 'Тяжёлый взмах молотом',
        isHeavy: false,
        damage: 24,
        windupDuration: 0.27,
        activeDuration: 0.15,
        recoveryDuration: 0.34,
        range: 2.35,
        hitAngleDeg: 112,
        staminaCost: 12,
        knockback: 7.4,
        blockable: true,
        guardStaminaDamage: 28,
        interruptible: true,
        lungeSpeed: 2.7,
        maxTurnRateWindup: 2.0,
        stunDurationOnHit: 0.34,
        animStyle: 'hammer_swing',
      },
      {
        id: 'hammer_light_2',
        name: 'Дробящий боковой удар',
        isHeavy: false,
        damage: 27,
        windupDuration: 0.28,
        activeDuration: 0.15,
        recoveryDuration: 0.38,
        range: 2.45,
        hitAngleDeg: 120,
        staminaCost: 13,
        knockback: 8.6,
        blockable: true,
        guardStaminaDamage: 32,
        interruptible: false, // hyperarmor on second swing!
        lungeSpeed: 3.1,
        maxTurnRateWindup: 1.8,
        stunDurationOnHit: 0.38,
        animStyle: 'slash_left',
      },
    ],
    heavyAttack: {
      id: 'hammer_heavy',
      name: 'Сокрушительный удар молотом',
      isHeavy: true,
      damage: 44,
      windupDuration: 0.48,
      activeDuration: 0.19,
      recoveryDuration: 0.54,
      range: 2.85,
      hitAngleDeg: 125,
      staminaCost: 30,
      knockback: 12.2,
      blockable: false, // Crushes right through normal blocks!
      guardStaminaDamage: 60,
      interruptible: false, // Uninterruptible hyperarmor!
      lungeSpeed: 4.4,
      maxTurnRateWindup: 0.95,
      stunDurationOnHit: 0.65,
      animStyle: 'hammer_slam',
    },
    defense: {
      mode: 'heavy_shield',
      name: 'Направленный блок щитом',
      description:
        'Мощный башенный щит (ПКМ): широкая дуга защиты 155° и минимальные потери выносливости.',
      blockAngleDeg: 155,
      damageReduction: 0.94,
      entryStaminaCost: 3,
      holdStaminaPerSec: 4,
      blockedHitStaminaFactor: 0.45,
      activeWindow: Infinity,
      recoveryLockout: 0.14,
      parryStunDuration: 0,
      deflectPushback: 4.4,
    },
    dodge: {
      mode: 'shield_shove',
      name: 'Защитный толчок щитом',
      description:
        'Короткий силовой шаг вперёд со щитом (Space): расталкивает врагов перед собой.',
      staminaCost: 22,
      duration: 0.28,
      iframesDuration: 0.16,
      speed: 8.8,
      defaultBackward: false,
      shoveRadius: 2.0,
      shoveKnockback: 9.5,
      shoveDamage: 8,
    },
    uiRatings: {
      hp: 5,
      speed: 2,
      attack: 5,
      defense: 5,
      reach: 2,
    },
    abilitiesList: [
      'Мощные удары молотом с высоким отбрасыванием',
      'Неблокируемый заряженный раскол земли (гиперброня)',
      'Широкий направленный блок башенным щитом (ПКМ)',
      'Защитный толчок щитом / силовой шаг (Space)',
    ],
    visual: {
      primarySteel: 0x7e8a97,
      secondaryArmor: 0x2d333b,
      clothColor: 0xd99b26,
      plumeColor: 0xe6532e,
      bodyScaleWidth: 1.24,
      bodyScaleHeight: 1.04,
      headScale: 1.2,
      capsuleRadius: 0.58,
    },
  },
};

export const CLASS_ORDER: KnightClassId[] = ['sword', 'dual', 'spear', 'hammer'];
