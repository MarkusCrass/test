import { KnightClassId } from './classes';

export type KnightRarity = 'free' | 'paid';

export interface KnightUnlockConfig {
  id: KnightClassId;
  price: number;
  rarity: KnightRarity;
}

export const KNIGHT_UNLOCK_COST = 300; // Все небазовые рыцари стоят одинаково

export const KNIGHT_UNLOCK_CONFIG: Record<KnightClassId, KnightUnlockConfig> = {
  sword: { id: 'sword', price: 0, rarity: 'free' },
  dual: { id: 'dual', price: 0, rarity: 'free' },
  spear: { id: 'spear', price: 0, rarity: 'free' },
  hammer: { id: 'hammer', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
  barbarian: { id: 'barbarian', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
  duelist: { id: 'duelist', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
  skeleton_knight: { id: 'skeleton_knight', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
  skeleton_reaper: { id: 'skeleton_reaper', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
  skeleton_berserker: { id: 'skeleton_berserker', price: KNIGHT_UNLOCK_COST, rarity: 'paid' },
};

export const RARITY_LABEL_RU: Record<KnightRarity, string> = {
  free: 'Уже имеется',
  paid: 'Купить за 300',
};

export const RARITY_COLOR: Record<KnightRarity, string> = {
  free: '#88c1ff',
  paid: '#fbbf24',
};

export interface MatchRewards {
  coins: number;
  breakdown: {
    victory: number;
  };
}

export const COIN_REWARDS = {
  victory: 30, // максимум 30 монет за победу
};

export function formatCoins(amount: number): string {
  return `${amount} монет`;
}
