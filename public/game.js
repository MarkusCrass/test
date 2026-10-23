'use strict';

const CLASSES = {
  guardian: { name: 'АРГОНАВТ', role: 'Защитник', ability: 'ЭГИДА', description: 'Даёт союзникам рядом объёмный щит на 4 секунды. Щит снижает получаемый урон на 55%.', hp: 190, speed: 250, damage: 29, cooldown: 9, color: '#f1b45b', icon: 'Λ', attack: 'УДАР МЕЧОМ', ultimate: 'СТЕНА АРГО' },
  ranger: { name: 'СЛЕДОПЫТ', role: 'Стрелок', ability: 'СЕМЬ СТРЕЛ', description: 'Выпускает веер из семи стрел. Эффективно на средней дистанции.', hp: 125, speed: 290, damage: 19, cooldown: 7, color: '#6fd7ae', icon: '➶', attack: 'ВЫСТРЕЛ', ultimate: 'ЛИВЕНЬ СТРЕЛ' },
  oracle: { name: 'ОРАКУЛ', role: 'Целитель', ability: 'БАЛЬЗАМ', description: 'Восстанавливает до 46 здоровья всем союзникам в радиусе действия.', hp: 140, speed: 265, damage: 16, cooldown: 10, color: '#8ab8ff', icon: '✦', attack: 'СВЕТЛАЯ СТРЕЛА', ultimate: 'ПЕРЕРОЖДЕНИЕ' }
};

const BOSSES = {
  minotaur: { name: 'МИНОТАВР', epithet: 'Хозяин лабиринта', location: 'Крит, Греция', region: 'Эгейское море · 35.24° N, 25.13° E', threat: 'III', color: '#df704b', image: '/assets/minotaur.jpg', lore: 'Лабиринт раскололся изнутри. Тот, кого считали мифом, вышел под открытое небо.', tip: 'Не стойте на линии рывка. Уходите в сторону, а не назад.' },
  anubis: { name: 'АНУБИС', epithet: 'Весы последнего суда', location: 'Гиза, Египет', region: 'Долина царей · 29.98° N, 31.13° E', threat: 'IV', color: '#d5ae55', image: '/assets/anubis.jpg', lore: 'Пески Гизы шепчут имена живых. Хранитель весов начал суд без приговорённых.', tip: 'Разбегайтесь при печатях суда. Во время бури держитесь у самого босса или за краем кольца.' },
  fenrir: { name: 'ФЕНРИР', epithet: 'Пожиратель солнца', location: 'Ютунхеймен, Норвегия', region: 'Скандинавские горы · 61.63° N, 8.31° E', threat: 'V', color: '#69a9d6', image: '/assets/fenrir.jpg', lore: 'Цепь Глейпнир найдена оборванной. В норвежских горах снова слышен древний вой.', tip: 'Сохраняйте рывок для прыжка. В последней фазе не группируйтесь.' }
};

const $ = (id) => document.getElementById(id);
const storage = {
  getItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { window.localStorage.setItem(key, value); } catch { /* Preview iframes may disable storage. */ } }
};
const canvas = $('gameCanvas');
const screens = { main: $('mainScreen'), lobby: $('lobbyScreen'), game: $('gameScreen') };
const input = { up: false, down: false, left: false, right: false, attack: false, ability: false, dash: false, sprint: false, ultimate: false, interact: false };
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let cameraDragging = false;
let cameraDragX = 0;
let cameraDragY = 0;

let socket;
let preferHttpTransport = new URLSearchParams(location.search).get('transport') === 'http';
let clientId = null;
let connected = false;
let reconnectTimer = null;
let room = null;
let currentScreen = 'main';
let selectedClass = storage.getItem('myths-class') || 'ranger';
let selectedBoss = 'minotaur';
let autoStart = false;
let latestGame = null;
let lastFrame = performance.now();
let lastInputSent = 0;
let endShown = false;
let toastTimer;
let announcementTimer;
let aim = { x: 800, y: 450 };
let renderer3D = null;
let rendererPromise = null;
let rendererLoadTimer = null;
let soundEnabled = storage.getItem('myths-sound') !== 'off';
let audioContext = null;
const soundTimes = {};

const playerNameInput = $('playerName');
playerNameInput.value = storage.getItem('myths-name') || `Странник ${Math.floor(10 + Math.random() * 90)}`;
$('joinCode').value = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const inviteCode = $('joinCode').value.length === 5 ? $('joinCode').value : null;
let pendingInvite = inviteCode;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function roman(value) { return ['I', 'II', 'III'][value - 1] || String(value); }
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function showRendererLoading() {
  if (currentScreen !== 'game') return;
  $('rendererStatus').hidden = false;
  $('rendererStatusActions').hidden = true;
  $('rendererSpinner').classList.remove('error');
  $('rendererStatusTitle').textContent = 'ЗАГРУЗКА 3D-МИРА';
  $('rendererStatusText').textContent = 'Подготавливаем модели, освещение и арену. Первый запуск может занять несколько секунд.';
}
function showRendererError(message) {
  clearTimeout(rendererLoadTimer);
  if (currentScreen !== 'game') return;
  $('gameScreen').classList.remove('renderer-loading');
  $('rendererStatus').hidden = false;
  $('rendererStatusActions').hidden = false;
  $('rendererSpinner').classList.add('error');
  $('rendererStatusTitle').textContent = '3D НЕ ЗАПУСТИЛОСЬ';
  $('rendererStatusText').textContent = message;
}
function hideRendererStatus() {
  clearTimeout(rendererLoadTimer);
  $('rendererStatus').hidden = true;
}
function ensureRenderer() {
  if (renderer3D) {
    hideRendererStatus();
    return Promise.resolve(renderer3D);
  }
  showRendererLoading();
  if (!rendererPromise) {
    $('gameScreen').classList.add('renderer-loading');
    clearTimeout(rendererLoadTimer);
    rendererLoadTimer = setTimeout(() => {
      showRendererError('Загрузка занимает слишком много времени. Проверьте соединение или перезапустите бой в облегчённом 3D-режиме.');
    }, 15000);
    rendererPromise = Promise.resolve()
      .then(() => {
        if (!globalThis.Myths3D?.GameRenderer) throw new Error('3D bundle is not available');
        const { GameRenderer } = globalThis.Myths3D;
        const quality = storage.getItem('myths-quality');
        const weakDevice = innerWidth < 760 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        const lowQuality = quality === 'low' || (!quality && weakDevice);
        renderer3D = new GameRenderer(canvas, { lowQuality });
        renderer3D.resize(innerWidth, innerHeight);
        $('gameScreen').classList.remove('renderer-loading');
        hideRendererStatus();
        return renderer3D;
      })
      .catch((error) => {
        console.error('3D renderer initialization failed:', error);
        rendererPromise = null;
        const webglError = /webgl|context|gpu/i.test(error?.message || '');
        showRendererError(webglError
          ? 'Браузер не смог создать графический контекст WebGL2. Включите аппаратное ускорение или попробуйте облегчённый режим в другом браузере.'
          : 'Не удалось загрузить 3D-движок. Проверьте соединение и нажмите «Повторить».');
        return null;
      });
  }
  return rendererPromise;
}

function showToast(message, duration = 3000) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}
function setConnection(status, text) {
  const element = $('connectionStatus');
  element.className = `connection ${status}`;
  element.querySelector('span').textContent = text;
}
function showScreen(name) {
  currentScreen = name;
  Object.entries(screens).forEach(([key, element]) => { element.hidden = key !== name; });
  document.body.classList.toggle('playing', name === 'game');
  if (name !== 'game') $('rendererStatus').hidden = true;
  if (name === 'game') {
    ensureRenderer().then((renderer) => renderer?.resize(innerWidth, innerHeight));
    clearInput();
  }
}
function showMain() {
  room = null;
  latestGame = null;
  autoStart = false;
  endShown = false;
  $('endScreen').hidden = true;
  $('bossIntro').hidden = true;
  clearInput();
  showScreen('main');
  history.replaceState({}, '', location.pathname);
}
class HttpSocket extends EventTarget {
  constructor() {
    super();
    this.isHttp = true;
    this.readyState = WebSocket.CONNECTING;
    this.clientId = null;
    this.sequence = 0;
    this.abortController = new AbortController();
    this.openConnection();
  }

  async openConnection() {
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
        signal: this.abortController.signal
      });
      if (!response.ok) throw new Error('HTTP connect failed');
      const data = await response.json();
      if (this.readyState === WebSocket.CLOSED) return;
      this.clientId = data.id;
      this.readyState = WebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
      this.poll();
    } catch {
      this.fail();
    }
  }

  async poll() {
    while (this.readyState === WebSocket.OPEN) {
      try {
        const response = await fetch(`/api/poll?id=${encodeURIComponent(this.clientId)}`, {
          cache: 'no-store',
          signal: this.abortController.signal
        });
        if (!response.ok) throw new Error('HTTP poll failed');
        const payload = await response.json();
        if (this.readyState !== WebSocket.OPEN) break;
        for (const message of payload.messages || []) {
          this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
        }
      } catch {
        if (this.readyState === WebSocket.OPEN) this.fail();
        break;
      }
    }
  }

  send(raw) {
    if (this.readyState !== WebSocket.OPEN) throw new Error('Transport is not open');
    const message = JSON.parse(raw);
    const sequence = ++this.sequence;
    fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.clientId, message, sequence }),
      signal: this.abortController.signal
    }).then((response) => {
      if (!response.ok) throw new Error('HTTP send failed');
    }).catch(() => this.fail());
  }

  close() {
    if (this.readyState === WebSocket.CLOSED) return;
    const id = this.clientId;
    this.readyState = WebSocket.CLOSED;
    this.abortController.abort();
    if (id) {
      fetch('/api/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        keepalive: true
      }).catch(() => {});
    }
    this.dispatchEvent(new Event('close'));
  }

  fail() {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.abortController.abort();
    this.dispatchEvent(new Event('close'));
  }
}

function send(type, data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast('Нет связи с сервером. Попробуйте через секунду.');
    return false;
  }
  socket.send(JSON.stringify({ type, ...data }));
  return true;
}

function connect() {
  clearTimeout(reconnectTimer);
  setConnection('', 'ПОДКЛЮЧЕНИЕ');
  const useHttp = preferHttpTransport;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const current = useHttp ? new HttpSocket() : new WebSocket(`${protocol}//${location.host}/ws`);
  socket = current;
  const connectionTimeout = setTimeout(() => {
    if (current.readyState === WebSocket.CONNECTING) current.close();
  }, 3000);

  current.addEventListener('open', () => {
    if (socket !== current) return;
    clearTimeout(connectionTimeout);
    connected = true;
    setConnection('online', 'БОЕВАЯ СЕТЬ · ONLINE');
    if (pendingInvite) {
      const code = pendingInvite;
      pendingInvite = null;
      send('join', { code, name: playerNameInput.value, classId: selectedClass });
    }
  });
  current.addEventListener('message', (event) => {
    if (socket !== current) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    handleMessage(message);
  });
  current.addEventListener('close', () => {
    if (socket !== current) return;
    clearTimeout(connectionTimeout);
    connected = false;
    const switchingToHttp = !useHttp && !preferHttpTransport;
    if (switchingToHttp) preferHttpTransport = true;
    setConnection(switchingToHttp ? '' : 'offline', switchingToHttp ? 'HTTP-РЕЗЕРВ' : 'СВЯЗЬ ПОТЕРЯНА');
    if (currentScreen !== 'main') {
      showToast('Связь с боевой сетью потеряна. Возвращаем в штаб…', 3500);
      setTimeout(showMain, 1200);
    }
    reconnectTimer = setTimeout(connect, switchingToHttp ? 150 : 2200);
  });
}

function handleMessage(message) {
  if (message.type === 'hello') {
    clientId = message.id;
    return;
  }
  if (message.type === 'error') {
    autoStart = false;
    showToast(message.message || 'Не удалось выполнить действие.');
    return;
  }
  if (message.type === 'room') {
    room = message.room;
    const me = room.players.find((player) => player.id === clientId);
    if (me) selectedClass = me.classId;
    selectedBoss = room.bossId;
    renderRoom();
    if (room.state === 'lobby') {
      if (currentScreen === 'game') {
        latestGame = null;
        endShown = false;
        $('endScreen').hidden = true;
      }
      showScreen('lobby');
      if (autoStart && room.hostId === clientId) {
        autoStart = false;
        send('start');
      }
    }
    return;
  }
  if (message.type === 'started') {
    latestGame = null;
    endShown = false;
    $('endScreen').hidden = true;
    $('gameRoomCode').textContent = message.code;
    setupBossHud(message.bossId);
    showScreen('game');
    showBossIntro(message.bossId);
    initAudio();
    playSound('phase');
    return;
  }
  if (message.type === 'state') {
    latestGame = message.game;
    if (currentScreen !== 'game') {
      setupBossHud(message.game.bossId);
      showScreen('game');
    }
    processEvents(message.game.events || []);
    updateHud();
    if (message.game.result && !endShown) showEndScreen(message.game.result);
    return;
  }
  if (message.type === 'left') showMain();
}

function createRoom(training = false) {
  initAudio();
  storage.setItem('myths-name', playerNameInput.value.trim());
  storage.setItem('myths-class', selectedClass);
  autoStart = training;
  if (!send('create', { name: playerNameInput.value, classId: selectedClass, bossId: selectedBoss })) autoStart = false;
}
function joinRoom() {
  const code = $('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) {
    showToast('Код комнаты состоит из пяти букв или цифр.');
    return;
  }
  initAudio();
  storage.setItem('myths-name', playerNameInput.value.trim());
  send('join', { code, name: playerNameInput.value, classId: selectedClass });
}

function renderRoom() {
  if (!room) return;
  const isHost = room.hostId === clientId;
  const me = room.players.find((player) => player.id === clientId);
  $('roomCode').textContent = room.code;
  $('gameRoomCode').textContent = room.code;
  $('squadCount').textContent = `${room.players.length} / 5`;
  $('lobbyBackdrop').style.backgroundImage = `url('${BOSSES[room.bossId].image}')`;
  document.querySelectorAll('.boss-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.boss === room.bossId);
    card.disabled = !isHost;
  });
  updateDossier(room.bossId);

  const slots = [];
  for (let index = 0; index < 5; index += 1) {
    const player = room.players[index];
    if (player) {
      const classConfig = CLASSES[player.classId];
      const displayName = player.id === clientId ? `${player.name} · ВЫ` : player.name;
      slots.push(`<div class="player-slot filled" style="color:${classConfig.color}" title="${escapeHtml(classConfig.name)}">
        ${player.id === room.hostId ? '<span class="leader-star">★ ЛИДЕР</span>' : ''}
        <span class="avatar">${classConfig.icon}</span><span class="player-name">${escapeHtml(displayName)}</span></div>`);
    } else slots.push('<div class="player-slot empty"><span>+</span><small>СВОБОДНО</small></div>');
  }
  $('playerSlots').innerHTML = slots.join('');
  document.querySelectorAll('.class-card').forEach((card) => card.classList.toggle('selected', card.dataset.class === selectedClass));
  updateClassDetail(selectedClass);

  const startButton = $('startButton');
  startButton.disabled = !isHost;
  startButton.querySelector('span').textContent = isHost ? (room.players.length === 1 ? 'НАЧАТЬ ТРЕНИРОВКУ' : 'НАЧАТЬ ОХОТУ') : 'ЖДЁМ ЛИДЕРА';
  $('launchStatus').textContent = isHost ? 'ВЫ ЛИДЕР ОТРЯДА' : 'ЛИДЕР ВЫБИРАЕТ ОПЕРАЦИЮ';
  $('launchHint').textContent = isHost ? (room.players.length === 1 ? 'Можно тренироваться или дождаться союзников' : `Отряд готов · ${room.players.length} бойца на связи`) : 'Вы можете сменить класс до начала боя';
  if (me) selectedClass = me.classId;
}
function updateDossier(bossId) {
  const boss = BOSSES[bossId];
  $('dossierRegion').textContent = boss.region;
  $('dossierThreat').textContent = boss.threat;
  $('dossierName').textContent = boss.name;
  $('dossierLore').textContent = boss.lore;
  $('dossierTip').textContent = boss.tip;
}
function updateClassDetail(classId) {
  const classConfig = CLASSES[classId];
  $('classAbilityName').textContent = classConfig.ability;
  $('classAbilityDescription').textContent = classConfig.description;
  $('classUltimateName').textContent = classConfig.ultimate;
  $('classHp').textContent = classConfig.hp;
  $('classSpeed').textContent = classConfig.speed;
  $('classDamage').textContent = classConfig.damage;
}
function setupBossHud(bossId) {
  const boss = BOSSES[bossId];
  $('gameBossLocation').textContent = boss.location.toUpperCase();
  $('gameBossName').textContent = boss.name;
  $('gameRoomCode').textContent = room?.code || $('gameRoomCode').textContent;
  const me = latestGame?.players.find((player) => player.id === clientId);
  const classId = me?.classId || selectedClass;
  $('hudAbilityName').textContent = CLASSES[classId].ability;
  $('hudUltimateName').textContent = CLASSES[classId].ultimate;
  $('basicAttackName').textContent = CLASSES[classId].attack;
}
function showBossIntro(bossId) {
  const boss = BOSSES[bossId];
  $('introLocation').textContent = boss.location.toUpperCase();
  $('introName').textContent = boss.name;
  $('introEpithet').textContent = boss.epithet;
  const intro = $('bossIntro');
  intro.hidden = false;
  intro.style.animation = 'none';
  void intro.offsetWidth;
  intro.style.animation = '';
  setTimeout(() => { intro.hidden = true; }, 3150);
}

function updateHud() {
  const game = latestGame;
  if (!game) return;
  const boss = game.boss;
  $('gameBossHealth').style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
  $('gameBossHpText').textContent = `${Math.max(0, boss.hp).toLocaleString('ru-RU')} / ${boss.maxHp.toLocaleString('ru-RU')}`;
  const stunned = boss.stunTime > 0;
  $('gameBossPhase').textContent = stunned ? 'ОГЛУШЁН' : `ФАЗА ${roman(boss.phase)}`;
  $('gameBossStagger').style.width = `${stunned ? 100 : clamp(boss.stagger || 0, 0, 100)}%`;
  $('gameBossStatus').textContent = stunned ? `${boss.stunTime.toFixed(1)} c · УРОН +25%` : 'ФОКУС УРОНА';
  document.querySelector('.boss-stagger-row').classList.toggle('stunned', stunned);
  $('gameTimer').textContent = formatTime(game.time);
  $('squadHud').innerHTML = game.players.map((player) => {
    const classConfig = CLASSES[player.classId];
    const status = player.dead ? 'ПОГИБ' : player.downed ? `${Math.ceil(player.bleedout)} c` : `${player.hp}`;
    return `<div class="squad-member ${player.downed ? 'downed' : ''} ${player.dead ? 'dead' : ''}" style="--player-color:${classConfig.color}">
      <div class="squad-avatar"><span>${classConfig.icon}</span></div>
      <div class="squad-info"><div><span>${escapeHtml(player.name)}${player.id === clientId ? ' · ВЫ' : ''}</span><span>${status}</span></div>
      <div class="squad-health"><i style="width:${clamp(player.hp / player.maxHp, 0, 1) * 100}%"></i></div></div></div>`;
  }).join('');

  const me = game.players.find((player) => player.id === clientId);
  if (!me) return;
  const classConfig = CLASSES[me.classId];
  $('hudAbilityName').textContent = classConfig.ability;
  $('hudUltimateName').textContent = classConfig.ultimate;
  $('basicAttackName').textContent = classConfig.attack;
  $('staminaFill').style.width = `${clamp(me.stamina / me.maxStamina, 0, 1) * 100}%`;
  $('staminaFill').style.background = me.sprinting ? '#e8c069' : '#78c6a5';
  $('staminaText').textContent = Math.ceil(me.stamina);
  const ultimateReady = me.ultimate >= 100;
  $('ultimateSlot').classList.toggle('ready', ultimateReady);
  $('ultimateCharge').style.transform = `scaleY(${1 - clamp(me.ultimate / 100, 0, 1)})`;
  $('ultimateChargeText').textContent = ultimateReady ? 'ГОТОВО · НАЖМИ R' : `Заряд ${Math.floor(me.ultimate)}%`;
  $('cameraMode').textContent = renderer3D?.lockOn === false ? '[ВЫКЛ]' : '[ВКЛ]';
  updateCooldown('ability', me.abilityCooldown, classConfig.cooldown);
  updateCooldown('dash', me.dashCooldown, 2.35);

  const hint = $('interactionHint');
  if (me.downed && !me.dead) {
    hint.hidden = false;
    hint.textContent = `ВЫ ПАЛИ · до потери сознания ${Math.ceil(me.bleedout)} c`;
  } else if (!me.dead) {
    const downed = game.players.filter((player) => player.downed && !player.dead);
    const nearby = downed.find((player) => Math.hypot(player.x - me.x, player.y - me.y) <= 110);
    if (nearby) {
      hint.hidden = false;
      hint.textContent = `[E] ВОСКРЕШЕНИЕ ${nearby.name.toUpperCase()} · ${Math.round(nearby.reviveProgress / 2.2 * 100)}%`;
    } else if (downed.length) {
      hint.hidden = false;
      hint.textContent = `ПОДОЙДИТЕ К ${downed[0].name.toUpperCase()}, ЧТОБЫ ВОСКРЕСИТЬ`;
    } else hint.hidden = true;
  } else hint.hidden = true;
}
function updateCooldown(prefix, value, maximum) {
  const slot = prefix === 'ability' ? $('abilitySlot') : $('dashSlot');
  const sweep = prefix === 'ability' ? $('abilityCooldown') : $('dashCooldown');
  const text = prefix === 'ability' ? $('abilityCooldownText') : $('dashCooldownText');
  sweep.style.transform = `scaleY(${clamp(value / maximum, 0, 1)})`;
  slot.classList.toggle('on-cooldown', value > 0.05);
  text.textContent = value > 0.05 ? `${value.toFixed(1)} c` : 'Готов';
}
function showEndScreen(result) {
  endShown = true;
  clearInput();
  const victory = result.outcome === 'victory';
  $('endTitle').textContent = victory ? 'МИФ ОКОНЧЕН' : 'ОТРЯД ПАЛ';
  $('endSubtitle').textContent = victory ? 'Ещё одна легенда стала историей. Земля держится.' : 'Миф оказался сильнее. Перегруппируйтесь и попробуйте снова.';
  $('endSigil').textContent = victory ? 'Λ' : '×';
  $('endSigil').style.borderColor = victory ? '#e57a45' : '#a8473d';
  $('endSigil').style.color = victory ? '#e57a45' : '#d65b4f';
  $('endTime').textContent = formatTime(result.duration);
  const me = latestGame.players.find((player) => player.id === clientId);
  $('endDamage').textContent = (me?.damageDone || 0).toLocaleString('ru-RU');
  $('endRevives').textContent = me?.revives || 0;
  const isHost = room?.hostId === clientId;
  $('restartButton').disabled = !isHost;
  $('restartButton').innerHTML = isHost ? 'ВЕРНУТЬСЯ В ЛОББИ <b>→</b>' : 'ЖДЁМ ЛИДЕРА';
  $('endScreen').hidden = false;
  playSound(victory ? 'victory' : 'defeat');
}
function announce(text) {
  clearTimeout(announcementTimer);
  const element = $('announcement');
  element.textContent = text;
  element.hidden = false;
  element.style.animation = 'none';
  void element.offsetWidth;
  element.style.animation = '';
  announcementTimer = setTimeout(() => { element.hidden = true; }, 2250);
}
function clearInput() {
  Object.keys(input).forEach((key) => { input[key] = false; });
  cameraDragging = false;
}

function processEvents(events) {
  for (const event of events) {
    if (renderer3D && latestGame) renderer3D.handleEvent(event, latestGame);
    if (event.kind === 'playerHit' && event.playerId === clientId) {
      if (renderer3D) renderer3D.shake = Math.max(renderer3D.shake, 0.32);
      $('damageFlash').classList.add('active');
      setTimeout(() => $('damageFlash').classList.remove('active'), 90);
      playSound('hurt');
    } else if (event.kind === 'bossHit') playSound('hit');
    else if (event.kind === 'heal') playSound('heal');
    else if (event.kind === 'impact') playSound('impact');
    else if (event.kind === 'stagger') {
      announce('БОСС ОГЛУШЁН · УРОН +25%');
      playSound('phase');
    } else if (event.kind === 'ultimate') {
      const player = latestGame?.players.find((item) => item.id === event.playerId);
      announce(`${player?.name || 'БОЕЦ'} · ${CLASSES[event.classId]?.ultimate || 'УЛЬТИМЕЙТ'}`);
      playSound('victory');
    } else if (event.kind === 'phase') {
      announce(`ФАЗА ${roman(event.phase)} · ЯРОСТЬ ПРОСЫПАЕТСЯ`);
      playSound('phase');
    } else if (event.kind === 'playerDown') {
      const player = latestGame?.players.find((item) => item.id === event.playerId);
      announce(`${player?.name || 'БОЕЦ'} ПАЛ · НУЖНО ВОСКРЕШЕНИЕ`);
      playSound('down');
    } else if (event.kind === 'revive') {
      const player = latestGame?.players.find((item) => item.id === event.playerId);
      announce(`${player?.name || 'БОЕЦ'} ВОЗВРАЩАЕТСЯ В БОЙ`);
      playSound('heal');
    } else if (event.kind === 'shield') playSound('shield');
    else if (event.kind === 'bossAttack') playSound('warning');
    else if (event.kind === 'shot') playSound('shot');
    else if (event.kind === 'playerLeft') showToast('Один из бойцов покинул отряд.');
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  if (currentScreen === 'game' && latestGame) {
    if (renderer3D) {
      try {
        renderer3D.render(latestGame, { clientId, aim, dt, endShown });
        aim = renderer3D.screenToWorld(mouse.x, mouse.y, latestGame);
      } catch (error) {
        console.error('3D render failed:', error);
        renderer3D = null;
        rendererPromise = null;
        showRendererError('Графический движок остановился во время отрисовки. Перезагрузите страницу или попробуйте облегчённый 3D-режим.');
      }
    } else aim = { x: latestGame.boss.x, y: latestGame.boss.y };

    const inputInterval = socket?.isHttp ? 90 : 33;
    if (connected && !endShown && now - lastInputSent > inputInterval) {
      lastInputSent = now;
      const move = renderer3D ? renderer3D.getMoveVector(input) : { x: 0, y: 0 };
      send('input', { input: { ...input, moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y } });
    }
  }
  requestAnimationFrame(frame);
}

function initAudio() {
  if (!soundEnabled) return;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  if (audioContext?.state === 'suspended') audioContext.resume();
}
function playSound(kind) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const throttle = kind === 'shot' ? 0.065 : kind === 'hit' ? 0.045 : 0.1;
  if (now - (soundTimes[kind] || 0) < throttle) return;
  soundTimes[kind] = now;
  const settings = {
    shot: [180, 75, 0.055, 'square', 0.018], hit: [105, 55, 0.07, 'sawtooth', 0.022],
    hurt: [95, 42, 0.16, 'sawtooth', 0.045], warning: [75, 48, 0.24, 'sawtooth', 0.025],
    impact: [65, 28, 0.28, 'square', 0.04], heal: [390, 660, 0.28, 'sine', 0.035],
    shield: [210, 420, 0.35, 'sine', 0.035], phase: [82, 155, 0.6, 'sawtooth', 0.04],
    down: [170, 55, 0.55, 'sawtooth', 0.04], victory: [260, 620, 0.85, 'sine', 0.05],
    defeat: [130, 38, 0.9, 'sawtooth', 0.04]
  }[kind] || [150, 80, 0.1, 'sine', 0.02];
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, settings[1]), now + settings[2]);
  gain.gain.setValueAtTime(settings[4], now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[2] + 0.02);
}

$('createButton').addEventListener('click', () => createRoom(false));
$('quickStartButton').addEventListener('click', () => createRoom(true));
$('joinButton').addEventListener('click', joinRoom);
$('joinCode').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
$('joinCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
playerNameInput.addEventListener('change', () => storage.setItem('myths-name', playerNameInput.value.trim()));
$('copyCodeButton').addEventListener('click', async () => {
  if (!room) return;
  const link = `${location.origin}/?room=${room.code}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast(`Ссылка-приглашение скопирована · код ${room.code}`);
  } catch { showToast(`Код отряда: ${room.code}`); }
});
document.querySelectorAll('.boss-card').forEach((card) => {
  card.addEventListener('click', () => {
    if (!room || room.hostId !== clientId) return;
    selectedBoss = card.dataset.boss;
    send('lobbyUpdate', { bossId: selectedBoss });
  });
});
document.querySelectorAll('.class-card').forEach((card) => {
  card.addEventListener('click', () => {
    selectedClass = card.dataset.class;
    storage.setItem('myths-class', selectedClass);
    updateClassDetail(selectedClass);
    document.querySelectorAll('.class-card').forEach((item) => item.classList.toggle('selected', item === card));
    send('lobbyUpdate', { classId: selectedClass });
  });
});
$('startButton').addEventListener('click', () => send('start'));
$('leaveLobbyButton').addEventListener('click', () => { if (send('leave')) showMain(); });
$('leaveGameButton').addEventListener('click', () => { if (send('leave')) showMain(); });
$('restartButton').addEventListener('click', () => send('restart'));
$('brandButton').addEventListener('click', () => {
  if (currentScreen === 'lobby') { if (send('leave')) showMain(); }
  else if (currentScreen === 'main') showMain();
});
function setHelp(open) {
  $('helpModal').hidden = !open;
  if (open) clearInput();
}
$('helpButton').addEventListener('click', () => setHelp(true));
$('closeHelpButton').addEventListener('click', () => setHelp(false));
$('understoodButton').addEventListener('click', () => setHelp(false));
$('helpModal').addEventListener('click', (event) => { if (event.target === $('helpModal')) setHelp(false); });
$('soundButton').textContent = `ЗВУК: ${soundEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
$('soundButton').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  storage.setItem('myths-sound', soundEnabled ? 'on' : 'off');
  $('soundButton').textContent = `ЗВУК: ${soundEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  if (soundEnabled) { initAudio(); playSound('heal'); }
});

const keyMap = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'dash', KeyQ: 'ability', KeyE: 'interact', KeyR: 'ultimate', ShiftLeft: 'sprint', ShiftRight: 'sprint'
};
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') { setHelp($('helpModal').hidden); return; }
  if (event.code === 'Tab' && currentScreen === 'game') {
    event.preventDefault();
    if (renderer3D) {
      const locked = renderer3D.toggleLock();
      showToast(locked ? 'Фиксация камеры на боссе включена' : 'Свободная камера · вращайте ПКМ');
    }
    return;
  }
  if (event.target instanceof HTMLInputElement || currentScreen !== 'game') return;
  const action = keyMap[event.code];
  if (action) { event.preventDefault(); input[action] = true; }
});
window.addEventListener('keyup', (event) => {
  const action = keyMap[event.code];
  if (action) {
    if (currentScreen === 'game') event.preventDefault();
    input[action] = false;
  }
});
window.addEventListener('blur', clearInput);
window.addEventListener('mousemove', (event) => {
  if (cameraDragging && renderer3D) renderer3D.orbit(event.clientX - cameraDragX, event.clientY - cameraDragY);
  cameraDragX = event.clientX;
  cameraDragY = event.clientY;
  mouse.x = event.clientX;
  mouse.y = event.clientY;
});
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0 && !endShown) { input.attack = true; initAudio(); }
  if (event.button === 2 && !endShown) {
    cameraDragging = true;
    cameraDragX = event.clientX;
    cameraDragY = event.clientY;
  }
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) input.attack = false;
  if (event.button === 2) cameraDragging = false;
});
canvas.addEventListener('wheel', (event) => {
  if (currentScreen !== 'game') return;
  event.preventDefault();
  renderer3D?.zoomCamera(event.deltaY);
}, { passive: false });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  renderer3D = null;
  rendererPromise = null;
  showRendererError('Браузер потерял графический контекст WebGL. Обычно это происходит из-за нехватки видеопамяти. Нажмите «Повторить» или включите облегчённый режим.');
});
$('retryRendererButton').addEventListener('click', () => location.reload());
$('lowQualityButton').addEventListener('click', () => {
  storage.setItem('myths-quality', 'low');
  location.reload();
});
$('rendererMainButton').addEventListener('click', () => { if (send('leave')) showMain(); });
window.addEventListener('resize', () => renderer3D?.resize(innerWidth, innerHeight));
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
window.addEventListener('pagehide', () => { if (socket?.isHttp) socket.close(); });

if (!CLASSES[selectedClass]) selectedClass = 'ranger';
if (inviteCode) showToast(`Приглашение в отряд ${inviteCode}. Подключаемся…`, 3500);
connect();
requestAnimationFrame(frame);
