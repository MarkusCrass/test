import { assetUrl } from '../config/assetUrls';
import { t, type Lang } from '../config/locales';
import { coreSkillText } from '../config/coreSkillLocales';
import { abilityText } from '../config/heroLocales';
import { KNIGHT_CLASSES, KnightClassId } from '../config/classes';

export type SkillSlotKey =
  | 'light'
  | 'heavy'
  | 'defense'
  | 'ability1'
  | 'ability2'
  | 'ability3'
  | 'dodge';

export interface SkillSlotDescriptor {
  slotKey: SkillSlotKey;
  hotkey: string;
  isSignature: boolean;
  iconFile: string;
  iconUrl: string;
  title: string;
  category: string;
  cooldownSec: number | null;
  staminaCost: number;
  badges: string[];
  description: string;
}

const DEFENSE_ICON_BY_CLASS: Record<KnightClassId, string> = {
  sword: 'sword_block.svg',
  dual: 'dual_parry.svg',
  spear: 'spear_deflect.svg',
  hammer: 'hammer_block.svg',
  barbarian: 'barbarian_block.svg',
  duelist: 'duelist_parry.svg',
  skeleton_knight: 'skeleton_knight_block.svg',
  skeleton_reaper: 'skeleton_reaper_parry.svg',
  skeleton_berserker: 'skeleton_berserker_block.svg',
};

const LIGHT_TITLES_BY_CLASS: Record<KnightClassId, string> = {
  sword: 'Рубящая связка',
  dual: 'Шквал двух клинков',
  spear: 'Выпады пикой',
  hammer: 'Дробящий молот',
  barbarian: 'Серия секиры',
  duelist: 'Фехтовальный каскад',
  skeleton_knight: 'Клинок склепа',
  skeleton_reaper: 'Серпы жнеца',
  skeleton_berserker: 'Рубка гладиатора',
};

const LIGHT_DESCS_BY_CLASS: Record<KnightClassId, string> = {
  sword:
    'Сбалансированная серия из трёх широких ударов двуручным мечом с шагом вперёд. Отлично подходит для прессинга и наказания за промах.',
  dual:
    'Молниеносная трёхударная комбинация парными клинками с минимальной задержкой и перекрёстным завершающим ударом.',
  spear:
    'Дальнобойные колющие выпады алебардой, позволяющие держать врагов на безопасной дистанции до того, как они подойдут вплотную.',
  hammer:
    'Тяжёлые размашистые удары боевым молотом с сильным отбрасыванием и высоким уроном по выносливости вражеского блока.',
  barbarian:
    'Свирепая трёхударная серия двуручной секирой с широким дуговым охватом и сокрушительным уроном по щитам.',
  duelist:
    'Высокоточная трёхударная связка шпагой с длинным шагом вперёд и мгновенным переходом в ответный выпад.',
  skeleton_knight:
    'Неумолимая серия ударов древним зазубренным клинком под прикрытием ростового щита стража склепа.',
  skeleton_reaper:
    'Сверхбыстрая трёхударная серия костяным топором и клинком для агрессивного сближения и добивания раненых целей.',
  skeleton_berserker:
    'Яростная гладиаторская связка топором и кулачным щитом со стремительным продвижением вперёд.',
};

const HEAVY_DESCS_BY_CLASS: Record<KnightClassId, string> = {
  sword:
    'Удерживайте ЛКМ для мощного рубящего удара сверху. Наносит высокий урон и легко проламывает ослабленный блок противника.',
  dual:
    'Удерживайте ЛКМ для стремительного вихревого выпада вперёд двумя клинками — мгновенно сокращает дистанцию.',
  spear:
    'Удерживайте ЛКМ для сокрушительного дальнего пронзающего выпада на максимальную дистанцию копья.',
  hammer:
    'Удерживайте ЛКМ для неблокируемого удара молотом в землю — сотрясает каменные плиты и пробивает любую защиту!',
  barbarian:
    'Удерживайте ЛКМ для неблокируемого кругового удара двуручной секирой с гипербронёй на замахе!',
  duelist:
    'Удерживайте ЛКМ для молниеносного дальнего королевского выпада остриём шпаги прямо сквозь брешь в защите.',
  skeleton_knight:
    'Удерживайте ЛКМ для тяжёлого приговора склепа с гипербронёй — сокрушает блок и отбрасывает врагов назад.',
  skeleton_reaper:
    'Удерживайте ЛКМ для стремительных ножниц смерти в прыжке с парными костяными клинками.',
  skeleton_berserker:
    'Удерживайте ЛКМ для сокрушительного прыжкового раскола черепа топором сверху вниз.',
};

export function getSkillIconUrl(iconFile: string): string {
  return assetUrl(`icons/skills/${iconFile}`);
}

/**
 * Builds the 7-slot square hotbar skill descriptors (with icons, stats, and hover tooltips)
 * for any of the 9 melee classes directly from centralized `KNIGHT_CLASSES` config:
 * [ЛКМ, ТЯЖ, ПКМ] + [1, 2, 3] + [Alt].
 */
export function buildClassSkillBar(
  classId: KnightClassId,
  lang: Lang = 'ru'
): SkillSlotDescriptor[] {
  const cfg = KNIGHT_CLASSES[classId];
  const comboDamages = cfg.lightCombo.map((c) => c.damage).join(' → ');
  const firstLight = cfg.lightCombo[0];
  const heavy = cfg.heavyAttack;
  const def = cfg.defense;
  const dodge = cfg.dodge;
  const [ab1, ab2, ab3] = cfg.abilities;

  const heavyBadges: string[] = [
    `Урон: ${heavy.damage}`,
    `Дальность: ${heavy.range.toFixed(1)} м`,
  ];
  if (!heavy.blockable) {
    heavyBadges.push('Пробивает блок');
  }
  if (!heavy.interruptible) {
    heavyBadges.push('Гиперброня');
  }

  const defBadges: string[] = [
    `Защита: -${Math.round(def.damageReduction * 100)}% урона`,
    `Сектор: ${def.blockAngleDeg}°`,
  ];
  if (def.parryStunDuration > 0) {
    defBadges.push(`Оглушение: ${def.parryStunDuration.toFixed(2)}с`);
  }
  if (def.deflectPushback > 0) {
    defBadges.push('Импульс отталкивания');
  }

  const formatAbilityBadges = (ab: typeof ab1): string[] => {
    const out: string[] = [];
    if (ab.multiHitTicks && ab.multiHitTicks > 1) {
      out.push(`Урон: ${ab.multiHitTicks}×${ab.attackProfile.damage}`);
    } else if (ab.spawnsProjectile && ab.projectileDamage) {
      out.push(`Бросок: ${ab.projectileDamage} ур.`);
      out.push(`Дальность: ${(ab.projectileRange ?? 15.5).toFixed(1)} м`);
    } else {
      out.push(`Урон: ${ab.attackProfile.damage}`);
      out.push(`Дальность: ${ab.attackProfile.range.toFixed(1)} м`);
    }
    if (ab.healAmount) {
      out.push(`Лечение: +${ab.healAmount} HP`);
    }
    if (ab.lifestealOnHit) {
      out.push(`Вампиризм: +${ab.lifestealOnHit} HP`);
    }
    if (!ab.attackProfile.blockable) {
      out.push('Пробивает блок');
    }
    if (ab.appliesFullStun || (ab.projectileStun && ab.projectileStun >= 0.5)) {
      const st = ab.projectileStun ?? ab.attackProfile.stunDurationOnHit;
      out.push(`Оглушение ${st.toFixed(2)}с`);
    } else if (!ab.attackProfile.interruptible) {
      out.push('Гиперброня');
    }
    return out;
  };

  const dodgeBadges: string[] = [];
  if (dodge.iframesDuration > 0) {
    dodgeBadges.push(`Неуязвимость: ${dodge.iframesDuration.toFixed(2)}с`);
  }
  if (dodge.shoveDamage > 0) {
    dodgeBadges.push(`Урон: ${dodge.shoveDamage}`);
    dodgeBadges.push('Сбивает замах');
  }

  const ab1File = `${ab1.id}.svg`;
  const ab2File = `${ab2.id}.svg`;
  const ab3File = `${ab3.id}.svg`;
  const lightFile = `${classId}_light.svg`;
  const heavyFile = `${classId}_heavy.svg`;
  const defFile = DEFENSE_ICON_BY_CLASS[classId];
  const dodgeFile = `${classId}_dodge.svg`;

  const slots: SkillSlotDescriptor[] = [
    {
      slotKey: 'light',
      hotkey: 'ЛКМ',
      isSignature: false,
      iconFile: lightFile,
      iconUrl: getSkillIconUrl(lightFile),
      title: LIGHT_TITLES_BY_CLASS[classId],
      category: `Серия из ${cfg.lightCombo.length} ударов · Нажатие ЛКМ`,
      cooldownSec: null,
      staminaCost: firstLight.staminaCost,
      badges: [
        `Урон: ${comboDamages}`,
        `Дальность: ${firstLight.range.toFixed(1)} м`,
      ],
      description: LIGHT_DESCS_BY_CLASS[classId],
    },
    {
      slotKey: 'heavy',
      hotkey: 'ТЯЖ',
      isSignature: false,
      iconFile: heavyFile,
      iconUrl: getSkillIconUrl(heavyFile),
      title: heavy.name,
      category: 'Силовой приём · Удержание ЛКМ',
      cooldownSec: null,
      staminaCost: heavy.staminaCost,
      badges: heavyBadges,
      description: HEAVY_DESCS_BY_CLASS[classId],
    },
    {
      slotKey: 'defense',
      hotkey: 'ПКМ',
      isSignature: false,
      iconFile: defFile,
      iconUrl: getSkillIconUrl(defFile),
      title: def.name,
      category: 'Защитная стойка · ПКМ',
      cooldownSec: null,
      staminaCost: def.entryStaminaCost,
      badges: defBadges,
      description: def.description,
    },
    {
      slotKey: 'ability1',
      hotkey: '1',
      isSignature: true,
      iconFile: ab1File,
      iconUrl: getSkillIconUrl(ab1File),
      title: ab1.name,
      category: 'Уникальный навык · Клавиша [1]',
      cooldownSec: ab1.cooldown,
      staminaCost: ab1.staminaCost,
      badges: formatAbilityBadges(ab1),
      description: ab1.description,
    },
    {
      slotKey: 'ability2',
      hotkey: '2',
      isSignature: true,
      iconFile: ab2File,
      iconUrl: getSkillIconUrl(ab2File),
      title: ab2.name,
      category: 'Уникальный навык · Клавиша [2]',
      cooldownSec: ab2.cooldown,
      staminaCost: ab2.staminaCost,
      badges: formatAbilityBadges(ab2),
      description: ab2.description,
    },
    {
      slotKey: 'ability3',
      hotkey: '3',
      isSignature: true,
      iconFile: ab3File,
      iconUrl: getSkillIconUrl(ab3File),
      title: ab3.name,
      category: 'Коронный навык · Клавиша [3]',
      cooldownSec: ab3.cooldown,
      staminaCost: ab3.staminaCost,
      badges: formatAbilityBadges(ab3),
      description: ab3.description,
    },
    {
      slotKey: 'dodge',
      hotkey: 'Alt',
      isSignature: false,
      iconFile: dodgeFile,
      iconUrl: getSkillIconUrl(dodgeFile),
      title: dodge.name,
      category: 'Тактический манёвр · Alt / C / Ctrl',
      cooldownSec: null,
      staminaCost: dodge.staminaCost,
      badges: dodgeBadges,
      description: dodge.description,
    },
  ];
  if (lang === 'ru') return slots;
  const tr = (key: string, params?: Record<string, string | number>) => t(key, lang, params);
  const damage = (value: string | number) => tr('skillDamage', { value });
  const range = (value: number) => tr('skillRange', { value: value.toFixed(1) });
  const abilityBadges = (ab: typeof ab1): string[] => {
    const value = ab.multiHitTicks && ab.multiHitTicks > 1
      ? `${ab.multiHitTicks}×${ab.attackProfile.damage}`
      : ab.spawnsProjectile && ab.projectileDamage ? ab.projectileDamage : ab.attackProfile.damage;
    const badges = [damage(value)];
    if (!(ab.multiHitTicks && ab.multiHitTicks > 1))
      badges.push(range(ab.spawnsProjectile && ab.projectileDamage ? (ab.projectileRange ?? 15.5) : ab.attackProfile.range));
    if (ab.healAmount) badges.push(tr('skillHeal', { value: ab.healAmount }));
    if (ab.lifestealOnHit) badges.push(tr('skillLeech', { value: ab.lifestealOnHit }));
    if (!ab.attackProfile.blockable) badges.push(tr('skillBreak'));
    if (ab.appliesFullStun || (ab.projectileStun && ab.projectileStun >= 0.5))
      badges.push(tr('skillStun', { value: (ab.projectileStun ?? ab.attackProfile.stunDurationOnHit).toFixed(2) }));
    else if (!ab.attackProfile.interruptible) badges.push(tr('skillArmor'));
    return badges;
  };
  slots[0] = { ...slots[0], hotkey: tr('leftMouse'), title: coreSkillText(classId, 'light', 'name', lang), category: tr('skillComboCat', { count: cfg.lightCombo.length }), description: coreSkillText(classId, 'light', 'description', lang), badges: [damage(comboDamages), range(firstLight.range)] };
  slots[1] = { ...slots[1], hotkey: tr('skillHeavy'), title: coreSkillText(classId, 'heavy', 'name', lang), category: tr('skillHeavyCat'), description: coreSkillText(classId, 'heavy', 'description', lang), badges: [damage(heavy.damage), range(heavy.range), ...(!heavy.blockable ? [tr('skillBreak')] : []), ...(!heavy.interruptible ? [tr('skillArmor')] : [])] };
  slots[2] = { ...slots[2], hotkey: tr('rightMouse'), title: coreSkillText(classId, 'defense', 'name', lang), category: tr('skillDefenseCat'), description: coreSkillText(classId, 'defense', 'description', lang), badges: [tr('skillGuard', { value: Math.round(def.damageReduction * 100) }), tr('skillAngle', { value: def.blockAngleDeg }), ...(def.parryStunDuration > 0 ? [tr('skillStun', { value: def.parryStunDuration.toFixed(2) })] : []), ...(def.deflectPushback > 0 ? [tr('skillPush')] : [])] };
  for (let i = 0; i < 3; i++) {
    const ab = cfg.abilities[i];
    slots[3 + i] = { ...slots[3 + i], title: abilityText(ab.id, 'name', lang, ab.name), description: abilityText(ab.id, 'description', lang, ab.description), category: tr('skillAbilityCat', { key: i + 1 }), badges: abilityBadges(ab) };
  }
  slots[6] = { ...slots[6], title: coreSkillText(classId, 'dodge', 'name', lang), category: tr('skillDodgeCat'), description: coreSkillText(classId, 'dodge', 'description', lang), badges: [...(dodge.iframesDuration > 0 ? [tr('skillInvuln', { value: dodge.iframesDuration.toFixed(2) })] : []), ...(dodge.shoveDamage > 0 ? [damage(dodge.shoveDamage), tr('skillInterrupt')] : [])] };
  return slots;
}
