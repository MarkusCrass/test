// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import {
  advanceSoloBotProgress,
  DEFAULT_SOLO_BOT_PROGRESS,
  loadSoloBotProgress,
  recordSoloBotOutcome,
  type SoloAssistTier,
} from '../src/config/soloBotProgress';
import { BotController } from '../src/core/BotAI';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { MatchManager } from '../src/core/MatchManager';
import { AuthoritativeMatchSim, ClientNetWorldSync } from '../src/net/MultiplayerRoomSim';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

function makeUi(): UIManager {
  const callbacks = new Proxy({}, { get: () => vi.fn() }) as UICallbacks;
  return new UIManager(document.querySelector<HTMLElement>('#root')!, DEFAULT_SETTINGS, callbacks);
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});

describe('adaptive difficulty for solo bot matches', () => {
  it('has four bounded levels: the second loss helps, later losses help more, each victory removes one level', () => {
    let progress = { ...DEFAULT_SOLO_BOT_PROGRESS };
    for (const [place, expected] of [
      [5, { lossStreak: 1, assistTier: 0 }],
      [4, { lossStreak: 2, assistTier: 1 }],
      [3, { lossStreak: 3, assistTier: 2 }],
      [2, { lossStreak: 4, assistTier: 3 }],
      [5, { lossStreak: 4, assistTier: 3 }],
      [1, { lossStreak: 0, assistTier: 2 }],
      [1, { lossStreak: 0, assistTier: 1 }],
      [1, { lossStreak: 0, assistTier: 0 }],
      [1, { lossStreak: 0, assistTier: 0 }],
    ] as const) {
      progress = advanceSoloBotProgress(progress, place);
      expect(progress).toEqual(expected);
    }
  });

  it('persists locally per account, tolerates damaged data and blocked writes without changing the cloud profile', () => {
    expect(loadSoloBotProgress()).toEqual(DEFAULT_SOLO_BOT_PROGRESS);
    recordSoloBotOutcome(4);
    expect(recordSoloBotOutcome(5).assistTier).toBe(1);
    expect(loadSoloBotProgress().lossStreak).toBe(2);
    expect(localStorage.getItem('kls_player_profile_v1')).toBeNull();

    localStorage.setItem('kls_cloud_profile_owner_v1', 'new-account');
    expect(loadSoloBotProgress()).toEqual(DEFAULT_SOLO_BOT_PROGRESS);
    recordSoloBotOutcome(5);
    expect(loadSoloBotProgress().lossStreak).toBe(1);
    localStorage.setItem('kls_cloud_profile_owner_v1', 'original-account');
    expect(loadSoloBotProgress()).toEqual(DEFAULT_SOLO_BOT_PROGRESS);
    localStorage.removeItem('kls_cloud_profile_owner_v1');
    expect(loadSoloBotProgress().assistTier).toBe(1);

    localStorage.setItem('kls_solo_bot_progress_v1', '{"assistTier":999,"lossStreak":-1}');
    expect(loadSoloBotProgress()).toEqual(DEFAULT_SOLO_BOT_PROGRESS);
    localStorage.setItem('kls_solo_bot_progress_v1', '{broken json');
    expect(loadSoloBotProgress()).toEqual(DEFAULT_SOLO_BOT_PROGRESS);
    localStorage.removeItem('kls_solo_bot_progress_v1');
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    try {
      expect(recordSoloBotOutcome(5).lossStreak).toBe(1);
      expect(loadSoloBotProgress().lossStreak).toBe(1);
    } finally {
      blocked.mockRestore();
    }
    recordSoloBotOutcome(1); // storage works again; no volatile state leaks into the next test
  });

  it('counts a knockout before the player exits spectator mode, never twice, and applies help next solo round', () => {
    const ui = makeUi();
    const match = new MatchManager(undefined, seededRng(17));
    const knockout = () => {
      match.getPlayer()!.takeRawDamage(1000, 'bot_1');
      match.state = 'PlayerEliminated';
      ui.update(match, [], false);
    };

    match.startMatch('sword', 'ffa5');
    knockout();
    expect(match.getMatchRewards().place).toBe(5);
    expect(loadSoloBotProgress()).toEqual({ lossStreak: 1, assistTier: 0 });
    ui.update(match, [], false);
    match.state = 'MatchFinished';
    match.winnerId = 'bot_1';
    ui.update(match, [], false);
    expect(loadSoloBotProgress().lossStreak).toBe(1);

    match.startMatch('sword', 'ffa5', loadSoloBotProgress().assistTier);
    knockout();
    expect(loadSoloBotProgress()).toEqual({ lossStreak: 2, assistTier: 1 });
    match.startMatch('sword', 'ffa5', loadSoloBotProgress().assistTier);
    expect([...match.bots.values()].map(bot => bot.soloAssistTier)).toEqual([1, 1, 1, 1]);

    // Actual knockouts still determine placement and rewards, not the assistance level.
    match.fighters.find(f => f.id === 'bot_1')!.takeRawDamage(1000, 'player');
    match.fighters.find(f => f.id === 'bot_2')!.takeRawDamage(1000, 'player');
    knockout();
    expect(match.getMatchRewards()).toEqual({ coins: 10, breakdown: { place: 3 }, place: 3 });
    expect(loadSoloBotProgress().assistTier).toBe(2);
  });

  it('does not record online results and all server-created bots retain their unassisted behavior', () => {
    recordSoloBotOutcome(5);
    recordSoloBotOutcome(5);
    const before = loadSoloBotProgress();
    const ui = makeUi();
    const onlineMatch = new MatchManager(undefined, seededRng(19));
    onlineMatch.startMatch('sword', 'ffa5', 3);
    onlineMatch.isOnlineMatch = true;
    onlineMatch.getPlayer()!.takeRawDamage(1000, 'bot_1');
    onlineMatch.state = 'PlayerEliminated';
    ui.update(onlineMatch, [], false);
    onlineMatch.state = 'MatchFinished';
    onlineMatch.winnerId = 'bot_1';
    ui.update(onlineMatch, [], false);
    expect(loadSoloBotProgress()).toEqual(before);

    const sim = new AuthoritativeMatchSim(ARENA_CONFIG, seededRng(23));
    sim.start([{ fighterId: 'human_a', name: 'Human', classId: 'sword' }], true);
    expect(sim.bots.size).toBe(4);
    expect([...sim.bots.values()].every(bot => bot.soloAssistTier === 0)).toBe(true);

    const clientMatch = new MatchManager(undefined, seededRng(24));
    clientMatch.startMatch('sword', 'ffa5', 3);
    new ClientNetWorldSync().initMatchFromSnapshot(clientMatch, 'human_a', 1, sim.buildSnapshot(0));
    expect(clientMatch.isOnlineMatch).toBe(true);
    expect(clientMatch.soloAssistTier).toBe(0);
    expect(clientMatch.bots.size).toBe(0);
  });

  it('prefers bot-on-bot fights in assisted FFA, but fights the player in the final duel', () => {
    const targetFor = (tier: SoloAssistTier) => {
      const botFighter = new Fighter({ id: 'bot_self', displayName: 'Bot', isHuman: false, classId: 'sword', x: 0, z: 0, yaw: 0 });
      const player = new Fighter({ id: 'player', displayName: 'Player', isHuman: true, classId: 'dual', x: 0, z: 2, yaw: Math.PI });
      const otherBot = new Fighter({ id: 'bot_other', displayName: 'Other', isHuman: false, classId: 'spear', x: 0, z: 10, yaw: Math.PI });
      const bot = new BotController(botFighter, seededRng(21), tier);
      bot.update(0.05, [botFighter, player, otherBot], new Map(), ARENA_CONFIG, true);
      return { bot, botFighter, player, otherBot };
    };
    expect(targetFor(0).bot.targetId).toBe('player');
    const assisted = targetFor(3);
    expect(assisted.bot.targetId).toBe('bot_other');
    assisted.otherBot.takeRawDamage(1000, 'bot_self');
    assisted.bot.update(0.05, [assisted.botFighter, assisted.player, assisted.otherBot], new Map(), ARENA_CONFIG, true);
    expect(assisted.bot.targetId).toBe('player');
  });

  it('hesitates against the player but not against a different bot; no health or damage is changed', () => {
    const offensiveDecisions = (tier: SoloAssistTier, humanOpponent: boolean) => {
      const botFighter = new Fighter({ id: 'attacker', displayName: 'Bot', isHuman: false, classId: 'sword', x: 0, z: 0, yaw: 0 });
      const opponent = new Fighter({ id: 'opponent', displayName: 'Target', isHuman: humanOpponent, classId: 'dual', x: 0, z: 2.4, yaw: Math.PI });
      const bot = new BotController(botFighter, seededRng(220), tier);
      let attacks = 0;
      for (let i = 0; i < 400; i++) {
        const intent = bot.update(0.05, [botFighter, opponent], new Map(), ARENA_CONFIG, true);
        attacks += Number(intent.lightAttackTap || intent.heavyAttackRequest || intent.ability1Pressed || intent.ability2Pressed || intent.ability3Pressed);
        botFighter.update(0.05, intent, ARENA_CONFIG, true);
        opponent.update(0.05, createEmptyIntent(opponent.yaw), ARENA_CONFIG, true);
      }
      return { attacks, botHp: botFighter.hp, opponentHp: opponent.hp };
    };
    const normal = offensiveDecisions(0, true);
    const assisted = offensiveDecisions(3, true);
    expect(assisted.attacks).toBeLessThan(normal.attacks);
    expect(assisted.botHp).toBe(normal.botHp);
    expect(assisted.opponentHp).toBe(normal.opponentHp);
    expect(offensiveDecisions(3, false)).toEqual(offensiveDecisions(0, false));
  });
});
