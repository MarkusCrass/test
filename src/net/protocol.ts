import { AttackPhase } from '../core/Fighter';
import { AbilityKind, KnightClassId } from '../config/classes';
import { CombatEvent } from '../core/CombatSystem';
import { FighterState } from '../core/Fighter';
import { KillFeedEntry } from '../core/MatchManager';

export const MAX_PLAYERS_PER_ROOM = 5;

export interface RoomPlayerInfo {
  clientId: string;
  fighterId: string;
  name: string;
  classId: KnightClassId;
  ready: boolean;
  isHost: boolean;
  pingMs: number;
}

export interface RoomLobbyState {
  roomCode: string;
  hostClientId: string;
  isPublic: boolean;
  fillBots: boolean;
  phase: 'lobby' | 'in_match';
  players: RoomPlayerInfo[];
}

export interface RoomSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  fillBots: boolean;
  phase: 'lobby' | 'in_match';
}

export interface ClientInputPacket {
  moveX: number;
  moveZ: number;
  aimYaw: number;
  sprint: boolean;
  attackHeld: boolean;
  blockHeld: boolean;
  jumpSeq: number;
  dodgeSeq: number;
  ability1Seq: number;
  ability2Seq: number;
}

export interface FighterNetSnapshot {
  id: string;
  displayName: string;
  classId: KnightClassId;
  isHuman: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  isGrounded: boolean;
  supportFloorY: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  state: FighterState;
  isSprinting: boolean;
  attackId: string | null;
  abilityId: AbilityKind | null;
  attackPhase: AttackPhase;
  attackPhaseTimer: number;
  swingInstanceId: number;
  activeComboStep: number;
  abilityCooldowns: [number, number];
  defenseLockoutTimer: number;
  isChargingHeavy: boolean;
  chargeTimer: number;
  blockElapsed: number;
  blockImpactTimer: number;
  hitFlashTimer: number;
  dodgeDirX: number;
  dodgeDirZ: number;
  dodgeElapsed: number;
  damageAuraTimer: number;
  hasteTimer: number;
  ironBastionTimer: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  blocksSucceeded: number;
  survivalTime: number;
  eliminatedOrder?: number;
}

export interface ProjectileNetSnapshot {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  traveled: number;
  maxRange: number;
}

export interface WorldSnapshot {
  serverTick: number;
  phase: 'Countdown' | 'InProgress' | 'MatchFinished';
  countdownTimer: number;
  matchTimeRemaining: number;
  matchElapsed: number;
  isFinalPhase: boolean;
  winnerId: string | null;
  finishReason: 'last_standing' | 'time_up' | 'draw' | null;
  fighters: FighterNetSnapshot[];
  projectiles: ProjectileNetSnapshot[];
  killFeed: KillFeedEntry[];
}

export type ClientMsg =
  | { type: 'list_rooms' }
  | {
      type: 'create_room';
      playerName: string;
      classId: KnightClassId;
      isPublic: boolean;
      fillBots: boolean;
    }
  | {
      type: 'join_room';
      roomCode: string;
      playerName: string;
      classId: KnightClassId;
    }
  | {
      type: 'quick_join';
      playerName: string;
      classId: KnightClassId;
    }
  | { type: 'leave_room' }
  | { type: 'select_class'; classId: KnightClassId }
  | { type: 'set_name'; playerName: string }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'set_room_options'; fillBots: boolean; isPublic: boolean }
  | { type: 'start_match' }
  | { type: 'rematch' }
  | { type: 'return_to_lobby' }
  | ({ type: 'input' } & ClientInputPacket)
  | { type: 'ping'; clientTime: number; lastPingMs?: number };

export type ServerMsg =
  | { type: 'welcome'; clientId: string; rooms: RoomSummary[] }
  | { type: 'rooms_list'; rooms: RoomSummary[] }
  | { type: 'room_joined'; room: RoomLobbyState; yourFighterId: string }
  | { type: 'room_updated'; room: RoomLobbyState }
  | { type: 'returned_to_lobby'; room: RoomLobbyState }
  | { type: 'room_left' }
  | { type: 'error'; message: string }
  | {
      type: 'match_started';
      matchGeneration: number;
      roomCode: string;
      yourFighterId: string;
      snapshot: WorldSnapshot;
    }
  | {
      type: 'snapshot';
      snapshot: WorldSnapshot;
      events: CombatEvent[];
      footsteps: string[];
      jumps: string[];
      dodges: string[];
      landings: Array<{ id: string; x: number; y: number; z: number }>;
      enteredFinalPhase: boolean;
    }
  | { type: 'pong'; clientTime: number; serverTime: number };
