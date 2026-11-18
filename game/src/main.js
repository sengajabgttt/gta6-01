// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between screens: title, brief, play,
// paused, complete (story finished), failed, busted and wasted.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, CAR, MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED,
  EVENT_CRASH,
  EVENT_ENEMY_DOWN,
  EVENT_HIT,
  EVENT_HORN,
  EVENT_MISSION_DONE,
  EVENT_MISSION_FAIL,
  EVENT_PICKUP,
  EVENT_SHOT,
  EVENT_WANTED_DOWN,
  EVENT_WANTED_UP,
  EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { drawHud, drawWorld, cameraFor } from './render.js';
import {
  SCREEN_BRIEF,
  SCREEN_BUSTED,
  SCREEN_COMPLETE,
  SCREEN_FAILED,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
  stageShot,
} from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const EMPTY_INPUT = {
  moveX: 0, moveY: 0, up: false, down: false, left: false, right: false,
  sprint: false, handbrake: false, shoot: false, punch: false,
  enter: false, reload: false, horn: false, aimX: undefined, aimY: undefined,
};

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');
const world = createWorld(createRandom(seed));
const audio = createAudio();

const view = { width: 1280, height: 720, dpr: 1 };

function resize() {
  const ratio = window.devicePixelRatio || 1;
  view.dpr = ratio;
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  canvas.width = Math.round(view.width * ratio);
  canvas.height = Math.round(view.height * ratio);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
}

window.addEventListener('resize', resize);
resize();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const s = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: s.cash,
      missionIndex: s.missionIndex,
      storyDone: s.storyDone,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}

function drawPanel(title, lines, prompt) {
  const width = 640;
  const lineH = 30;
  const height = 120 + lines.length * lineH + 70;
  const x = (view.width - width) / 2;
  const y = (view.height - height) / 2;
  ctx.fillStyle = 'rgba(8,12,18,0.88)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,63,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, view.width / 2, y + 66);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '18px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, view.width / 2, y + 118 + i * lineH);
  });
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(prompt, view.width / 2, y + height - 30);
}

function drawFrame(screen) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, view.width, view.height);
  const time = performance.now() / 1000;
  drawWorld(ctx, world, view, time);
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
    drawHud(ctx, world, view);
  }
  if (screen === SCREEN_TITLE) {
    const save = readSave();
    const lines = [
      'Solmar, a sun-soaked city by the sea. Jax Moreno owes $8,000',
      'to a fixer named Sal — and Sal collects. Drive, steal, fight,',
      'and pay it back, one job at a time.',
      '',
      'WASD move · Shift sprint · Mouse aim · Click shoot · F punch',
      'E enter / exit car · R reload · Space handbrake · P pause · M mute',
    ];
    if (save) {
      lines.push('');
      lines.push(`Saved game: $${save.cash.toLocaleString('en-US')} — ${save.storyDone ? 'debt cleared, free roam' : `mission ${save.missionIndex + 1} of 4`}`);
      drawPanel('SOLMAR', lines, 'Space: continue  ·  N: new game');
    } else {
      drawPanel('SOLMAR', lines, 'Press Space or click to start');
    }
  } else if (screen === SCREEN_BRIEF) {
    const m = world.state.mission;
    if (m) {
      const def = MISSIONS[m.index];
      const lines = [
        def.brief,
        '',
        `Reward: $${def.reward}` + (def.timeLimit > 0 ? `   ·   Time limit: ${def.timeLimit}s` : ''),
        '',
        'Follow the yellow marker. Stay out of the morgue — and out of jail.',
      ];
      drawPanel(`${m.index + 1}. ${def.name}`, lines, 'Press Space to start the job');
    }
  } else if (screen === SCREEN_PAUSED) {
    drawPanel('Paused', ['The city will wait for you.'], 'Press P to resume');
  } else if (screen === SCREEN_COMPLETE) {
    drawPanel('DEBT CLEARED', [
      'Jax paid Sal back — all $8,000 of it.',
      'The garage is his again, and so is Solmar.',
      '',
      `Cash: $${world.state.cash.toLocaleString('en-US')}`,
      'Keep driving: fares pay $120 a ride.',
    ], 'Press Space to keep playing');
  } else if (screen === SCREEN_FAILED) {
    drawPanel('JOB FAILED', [world.state.message || 'The job fell through.'], 'Press Space to try again');
  } else if (screen === SCREEN_BUSTED) {
    drawPanel('BUSTED', ['The Solmar City Police Department has you.', 'Sal is not pleased.'], 'Press Space to try again');
  } else if (screen === SCREEN_WASTED) {
    drawPanel('WASTED', ['Jax woke up in the clinic, lighter by $200.', 'Sal is not pleased.'], 'Press Space to try again');
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    drawFrame(scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let save = readSave();
  if (save) {
    world.reset(save.missionIndex, save.cash);
  }

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // No storage: start fresh in memory only.
    }
    world.reset(0, 0);
    screen = SCREEN_BRIEF;
    announce('SOLMAR. Mission 1: First Fare.');
  }

  function continueGame() {
    const s = readSave();
    if (s) world.reset(s.missionIndex, s.cash);
    else world.reset(0, 0);
    screen = world.state.mission ? SCREEN_BRIEF : SCREEN_PLAY;
    announce(world.state.mission ? `Continuing: mission ${world.state.missionIndex + 1}.` : 'Continuing in free roam.');
  }

  function retryJob() {
    world.retryMission();
    screen = SCREEN_BRIEF;
    announce('Retrying the job.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.setMuted(!audio.isMuted());
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        if (save) continueGame();
        else startNewGame();
      }
    } else if (screen === SCREEN_BRIEF) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam.');
      }
    } else if (screen === SCREEN_FAILED || screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) retryJob();
    }
  }

  // N on the title screen starts a brand-new game instead of continuing.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_TITLE && event.code === 'KeyN' && !event.repeat) {
      audio.unlock();
      startNewGame();
    }
  });

  function buildInput(actions) {
    const mv = input.move();
    const mouse = input.mouse();
    const cam = cameraFor(world.state.player, view);
    return {
      moveX: mv.x,
      moveY: mv.y,
      up: mv.up,
      down: mv.down,
      left: mv.left,
      right: mv.right,
      sprint: mv.sprint,
      handbrake: mv.handbrake,
      shoot: input.shooting(),
      punch: !!(actions & ACTION_PUNCH),
      enter: !!(actions & ACTION_ENTER),
      reload: !!(actions & ACTION_RELOAD),
      horn: input.shooting(),
      aimX: mouse.x + cam.x,
      aimY: mouse.y + cam.y,
    };
  }

  function handleEvents(events) {
    const s = world.state;
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_ENEMY_DOWN) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_HIT) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HORN) audio.horn();
    if (events & EVENT_WANTED_UP) announce('The police are after you!');
    if (events & EVENT_WANTED_DOWN) announce('The heat is dying down.');
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      writeSave();
      if (s.cash > best) {
        best = s.cash;
        saveBest(best);
      }
      if (s.storyDone) {
        screen = SCREEN_COMPLETE;
        announce('Debt cleared! Solmar is yours.');
      } else {
        screen = SCREEN_BRIEF;
        announce('Job done. Next mission.');
      }
    }
    if (events & EVENT_MISSION_FAIL) {
      audio.missionFail();
      screen = SCREEN_FAILED;
      announce('Job failed.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      if (s.mission) {
        world.failMission('Busted on the job. Sal is not pleased.');
        screen = SCREEN_BUSTED;
      } else {
        s.cash = Math.max(0, s.cash - 150);
        world.clearWanted();
        world.resetPlayerToGarage();
        writeSave();
        announce('Busted. $150 fine.');
      }
    }
    if (events & EVENT_WASTED) {
      audio.missionFail();
      if (s.mission) {
        world.failMission('Wasted on the job. Sal is not pleased.');
        screen = SCREEN_WASTED;
      } else {
        s.cash = Math.max(0, s.cash - 200);
        world.clearWanted();
        world.resetPlayerToGarage();
        writeSave();
        announce('Wasted. $200 hospital bill.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, EMPTY_INPUT, { ambient: true });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, buildInput(actions));
    audio.setSiren(world.state.wanted > 0);
    const p = world.state.player;
    audio.setEngine(p.inCar ? p.inCar.speed : 0, CAR.maxSpeed);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    let firstStep = true;
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      // One-shot presses (enter, punch, reload) fire on the first step only,
      // so a catch-up frame never enters and exits a car in the same frame.
      step(firstStep ? actions : 0);
      firstStep = false;
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    drawFrame(screen);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('SOLMAR. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
