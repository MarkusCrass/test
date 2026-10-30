import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { createEmptyIntent } from '../src/core/Fighter';
import { MatchManager } from '../src/core/MatchManager';
import { UIManager, UICallbacks } from '../src/ui/UIManager';

/**
 * Lightweight self-contained DOM test harness for exercising UIManager in Node Vitest.
 */
class MiniClassList {
  private readonly set = new Set<string>();
  constructor(initial = '') {
    initial
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => this.set.add(c));
  }
  add(...tokens: string[]): void {
    tokens.forEach((t) => t && this.set.add(t));
  }
  remove(...tokens: string[]): void {
    tokens.forEach((t) => this.set.delete(t));
  }
  toggle(token: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.set.has(token)) {
        this.set.delete(token);
        return false;
      }
      this.set.add(token);
      return true;
    }
    if (force) this.set.add(token);
    else this.set.delete(token);
    return force;
  }
  contains(token: string): boolean {
    return this.set.has(token);
  }
  toString(): string {
    return [...this.set].join(' ');
  }
}

class MiniElement {
  public tagName: string;
  public id = '';
  public classList = new MiniClassList();
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public children: MiniElement[] = [];
  public parentElement: MiniElement | null = null;
  public value = '';
  public checked = false;
  public disabled = false;
  public src = '';
  private _text = '';
  private _rawHtml = '';
  private listeners = new Map<string, Array<(ev: unknown) => void>>();

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get className(): string {
    return this.classList.toString();
  }
  set className(val: string) {
    this.classList = new MiniClassList(val);
  }

  get firstElementChild(): MiniElement | null {
    return this.children[0] ?? null;
  }

  get textContent(): string {
    if (this.children.length === 0) return this._text;
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(val: string) {
    this.children = [];
    this._rawHtml = '';
    this._text = String(val);
  }

  get innerHTML(): string {
    return this._rawHtml;
  }
  set innerHTML(html: string) {
    this._rawHtml = html;
    this._text = '';
    this.children = parseHtmlFragment(html, this);
  }

  appendChild(child: MiniElement): MiniElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  click(): void {
    this.dispatchEvent('click', {
      target: this,
      button: 0,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  }

  dispatchEvent(type: string, ev: unknown = { target: this }): void {
    for (const cb of this.listeners.get(type) ?? []) {
      cb(ev);
    }
  }

  matches(selector: string): boolean {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.'))
      return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector: string): MiniElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const out: MiniElement[] = [];
    const walk = (node: MiniElement) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

const VOID_TAGS = new Set([
  'img',
  'input',
  'br',
  'hr',
  'meta',
  'link',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'stop',
]);

function parseHtmlFragment(
  html: string,
  parent: MiniElement
): MiniElement[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  const stack: MiniElement[] = [parent];
  const topChildren: MiniElement[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(clean)) !== null) {
    const [full, rawTag, rawAttrs, textChunk] = match;
    if (textChunk !== undefined) {
      const top = stack[stack.length - 1];
      if (top && top !== parent && textChunk.trim().length > 0) {
        const txtNode = new MiniElement('#text');
        txtNode.textContent = textChunk;
        top.appendChild(txtNode);
      }
      continue;
    }

    const isClose = full.startsWith('</');
    const tagLower = rawTag.toLowerCase();
    if (isClose) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const el = new MiniElement(tagLower);
    const attrRegex = /([a-zA-Z0-9-:]+)(?:="([^"]*)")?/g;
    let am: RegExpExecArray | null;
    while ((am = attrRegex.exec(rawAttrs)) !== null) {
      const key = am[1];
      const val = am[2] ?? '';
      if (key === 'id') el.id = val;
      else if (key === 'class') el.className = val;
      else if (key === 'value') el.value = val;
      else if (key === 'src') el.src = val;
      else if (key === 'checked') el.checked = true;
      else if (key === 'disabled') el.disabled = true;
      else if (key.startsWith('data-')) {
        const camel = key
          .slice(5)
          .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        el.dataset[camel] = val;
      }
    }

    const currentParent = stack[stack.length - 1];
    if (currentParent === parent) {
      el.parentElement = parent;
      topChildren.push(el);
    } else {
      currentParent.appendChild(el);
    }

    const selfClosing = rawAttrs.trim().endsWith('/') || VOID_TAGS.has(tagLower);
    if (!selfClosing) {
      stack.push(el);
    }
  }

  return topChildren;
}

describe('Modern Spatial Glass & Bento Hero Hub UI', () => {
  it('provides persistent top segmented navigation, Bento glass cards, and iOS pill switches without legacy clutter', () => {
    const uiSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/ui/UIManager.ts'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/style.css'),
      'utf8'
    );

    expect(uiSrc).not.toContain('stone-panel');
    expect(uiSrc).not.toContain('royal-window');
    expect(cssSrc).not.toContain('clip-path');

    expect(uiSrc).toContain('hub-top-dock');
    expect(uiSrc).toContain('hub-seg-nav');
    expect(uiSrc).toContain('hub-hero-strip');
    expect(uiSrc).toContain('hub-play-cta');
    expect(cssSrc).toContain('ios-switch');
  });

  it('supports 1-click hero & mode switching right on Main Hub, Controls modal, 5-player party lobby, and HUD lifecycle', () => {
    (globalThis as Record<string, unknown>).document = {
      createElement: (tag: string) => new MiniElement(tag),
      body: new MiniElement('body'),
      execCommand: () => true,
    };

    const root = new MiniElement('div') as unknown as HTMLElement;
    const callbacks: UICallbacks = {
      onOpenSelection: vi.fn(),
      onOpenMultiplayer: vi.fn(),
      onStartMatch: vi.fn(),
      onRestartMatch: vi.fn(),
      onReturnMainMenu: vi.fn(),
      onResumeGame: vi.fn(),
      onCycleSpectator: vi.fn(),
      onSettingsChanged: vi.fn(),
      onSelectPreviewClass: vi.fn(),
      onTriggerSkillSlot: vi.fn(),
      onMpQuickJoin: vi.fn(),
      onMpCreateRoom: vi.fn(),
      onMpJoinRoom: vi.fn(),
      onMpRefreshRooms: vi.fn(),
      onMpLeaveRoom: vi.fn(),
      onMpSelectClass: vi.fn(),
      onMpSetName: vi.fn(),
      onMpToggleReady: vi.fn(),
      onMpRoomOptions: vi.fn(),
      onMpStartMatch: vi.fn(),
      onMpReturnToLobby: vi.fn(),
    };

    const ui = new UIManager(root, { ...DEFAULT_SETTINGS }, callbacks);
    const miniRoot = root as unknown as MiniElement;

    // 1. Quick Hero Strip right on Main Hub switches across all 9 melee heroes in 1 click!
    const quickChips = miniRoot
      .querySelector('#hub-hero-strip')!
      .querySelectorAll('.hub-hero-chip');
    expect(quickChips.length).toBe(9);
    quickChips[4].click(); // Barbarian
    expect(ui.getSelectedClass()).toBe('barbarian');
    expect(callbacks.onSelectPreviewClass).toHaveBeenCalledWith(
      'barbarian',
      true
    );
    quickChips[1].click(); // Dual swords
    expect(ui.getSelectedClass()).toBe('dual');
    expect(callbacks.onSelectPreviewClass).toHaveBeenCalledWith('dual', true);

    // 2. Selecting Duel card on Main Hub + clicking big Play CTA starts duel with selected hero!
    miniRoot.querySelector('#hub-mode-duel')!.click();
    miniRoot.querySelector('#btn-menu-quick')!.click();
    expect(callbacks.onStartMatch).toHaveBeenCalledWith('dual', 'duel_debug');

    // 3. Controls cheat-sheet modal opens and closes cleanly
    miniRoot.querySelector('#btn-open-controls')!.click();
    expect(
      miniRoot.querySelector('#modal-controls')!.classList.contains('hidden')
    ).toBe(false);
    miniRoot.querySelector('#btn-controls-close')!.click();
    expect(
      miniRoot.querySelector('#modal-controls')!.classList.contains('hidden')
    ).toBe(true);

    // 4. 5-slot Party Waiting Room renders all 5 cards
    ui.updateMultiplayerRoom(
      {
        roomCode: 'K9X2',
        hostClientId: 'c1',
        phase: 'lobby',
        fillBots: true,
        isPublic: true,
        players: [
          {
            clientId: 'c1',
            fighterId: 'p1',
            name: 'Сэр Роланд',
            classId: 'sword',
            ready: true,
            isHost: true,
            pingMs: 14,
          },
          {
            clientId: 'c2',
            fighterId: 'p2',
            name: 'Леди Лира',
            classId: 'dual',
            ready: false,
            isHost: false,
            pingMs: 28,
          },
        ],
      },
      'c1'
    );
    expect(miniRoot.querySelectorAll('.mp-slot-card').length).toBe(5);
    expect(miniRoot.querySelector('#mp-room-code-text')!.textContent).toBe(
      'K9X2'
    );

    // 5. Match lifecycle hides Hub Top Dock during combat and shows HUD, Pause & Results
    const match = new MatchManager();
    ui.update(match, [], false);
    expect(
      miniRoot.querySelector('#hub-top-dock')!.classList.contains('hidden')
    ).toBe(false);

    match.startMatch('hammer', 'ffa5');
    ui.update(match, [], true);
    expect(
      miniRoot.querySelector('#hub-top-dock')!.classList.contains('hidden')
    ).toBe(true);
    expect(
      miniRoot.querySelector('#screen-hud')!.classList.contains('hidden')
    ).toBe(false);
    // Default elevated MMORPG crosshair sits higher up at top=34.00%
    expect(miniRoot.querySelector('#hud-reticle')!.style.top).toBe('34.00%');
    expect(miniRoot.querySelector('#hud-reticle')!.style.left).toBe('50.00%');

    // Screen-wide Free-Cursor MMORPG crosshair moves anywhere & highlights locked enemy
    ui.update(match, [], false, {
      normX: 0.78,
      normY: 0.22,
      freeCursorAim: true,
      freeLookActive: false,
      targetName: 'Сэр Мордред',
      targetHpRatio: 0.64,
    });
    expect(miniRoot.querySelector('#hud-reticle')!.style.left).toBe('78.00%');
    expect(miniRoot.querySelector('#hud-reticle')!.style.top).toBe('22.00%');
    expect(
      miniRoot.querySelector('#hud-reticle-ring')!.classList.contains('locked-enemy')
    ).toBe(true);
    expect(miniRoot.querySelector('#hud-reticle-target')!.textContent).toContain(
      'Сэр Мордред'
    );

    match.paused = true;
    ui.update(match, [], false);
    expect(
      miniRoot.querySelector('#modal-pause')!.classList.contains('hidden')
    ).toBe(false);

    match.paused = false;
    match.update(4.0, createEmptyIntent());
    for (const f of match.fighters) {
      if (!f.isHuman) {
        f.hp = 0;
        f.state = 'Dead';
      }
    }
    match.update(0.1, createEmptyIntent());
    ui.update(match, [], false);
    expect(match.state).toBe('MatchFinished');
    expect(
      miniRoot.querySelector('#modal-results')!.classList.contains('hidden')
    ).toBe(false);
  });
});
