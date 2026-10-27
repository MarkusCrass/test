import { KNIGHT_CLASSES, KnightClassId } from '../config/classes';

export type SkillSlotKey =
  | 'light'
  | 'heavy'
  | 'defense'
  | 'ability1'
  | 'ability2'
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
};

const LIGHT_TITLES_BY_CLASS: Record<KnightClassId, string> = {
  sword: 'Рубящая связка',
  dual: 'Шквал двух клинков',
  spear: 'Выпады пикой',
  hammer: 'Дробящий молот',
};

const LIGHT_DESCS_BY_CLASS: Record<KnightClassId, string> = {
  sword:
    'Сбалансированная серия из двух широких диагональных ударов мечом с шагом вперёд. Отлично подходит для прессинга и наказания за промах.',
  dual:
    'Молниеносная трёхударная комбинация парными клинками с минимальной задержкой и перекрёстным завершающим ударом.',
  spear:
    'Дальнобойные колющие выпады алебардой, позволяющие держать врагов на безопасной дистанции до того, как они подойдут вплотную.',
  hammer:
    'Тяжёлые размашистые удары боевым молотом с сильным отбрасыванием и высоким уроном по выносливости вражеского блока.',
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
};

function getBaseUrl(): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  const base = meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function getSkillIconUrl(iconFile: string): string {
  return `${getBaseUrl()}icons/skills/${iconFile}`;
}

/**
 * Builds the 6-slot square hotbar skill descriptors (with icons, stats, and hover tooltips)
 * for any knight class directly from centralized `KNIGHT_CLASSES` config.
 */
export function buildClassSkillBar(
  classId: KnightClassId
): SkillSlotDescriptor[] {
  const cfg = KNIGHT_CLASSES[classId];
  const comboDamages = cfg.lightCombo.map((c) => c.damage).join(' → ');
  const firstLight = cfg.lightCombo[0];
  const heavy = cfg.heavyAttack;
  const def = cfg.defense;
  const dodge = cfg.dodge;
  const [ab1, ab2] = cfg.abilities;

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
      out.push(`Кинжал: ${ab.projectileDamage} ур.`);
      out.push(`Дальность: ${(ab.projectileRange ?? 15.5).toFixed(1)} м`);
    } else {
      out.push(`Урон: ${ab.attackProfile.damage}`);
      out.push(`Дальность: ${ab.attackProfile.range.toFixed(1)} м`);
    }
    if (ab.healAmount) {
      out.push(`Лечение: +${ab.healAmount} HP`);
    }
    if (!ab.attackProfile.blockable) {
      out.push('Пробивает блок');
    }
    if (ab.appliesFullStun) {
      out.push('Оглушение 1.15с');
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
  const lightFile = `${classId}_light.svg`;
  const heavyFile = `${classId}_heavy.svg`;
  const defFile = DEFENSE_ICON_BY_CLASS[classId];
  const dodgeFile = `${classId}_dodge.svg`;

  return [
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
      category: 'Уникальная способность · Клавиша [1]',
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
      category: 'Уникальная способность · Клавиша [2]',
      cooldownSec: ab2.cooldown,
      staminaCost: ab2.staminaCost,
      badges: formatAbilityBadges(ab2),
      description: ab2.description,
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
}
