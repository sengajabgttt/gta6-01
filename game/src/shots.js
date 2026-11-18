// The screenshot scenes behind ?shot=start|drive|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (walk to a car, get in, steer toward the mission marker),
// so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { CITY, STEP } from './config.js';
import { EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_WASTED } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_FAILED = 'failed';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BRIEF = 'brief';

const START_SECONDS = 3;
const DRIVE_SECONDS = 24;
const CHASE_SECONDS = 26;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** The nearest car to the player that can be driven (preferring `wantKind`). */
function nearestCar(state, wantKind = 'player') {
  let best = null;
  let bestScore = Infinity;
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    const score = car.kind === wantKind ? d * 0.1 : d;
    if (score < bestScore) {
      bestScore = score;
      best = car;
    }
  }
  return best;
}

/**
 * One step of input for the autopilot: walk to the nearest car and get in,
 * then drive toward (targetX, targetY). Returns the input object main.js
 * builds from real keys, so the autopilot drives exactly like a player.
 */
function autopilotInput(world, targetX, targetY, wantKind = 'player') {
  const p = world.state.player;
  const input = {
    moveX: 0, moveY: 0, up: false, down: false, left: false, right: false,
    sprint: false, handbrake: false, shoot: false, punch: false,
    enter: false, reload: false, horn: false, aimX: undefined, aimY: undefined,
  };
  if (!p.inCar) {
    const car = nearestCar(world.state, wantKind);
    if (!car) return input;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < 60) {
      input.enter = true;
      return input;
    }
    const dx = (car.x - p.x) / d;
    const dy = (car.y - p.y) / d;
    input.moveX = dx;
    input.moveY = dy;
    input.sprint = true;
    return input;
  }
  const car = p.inCar;
  const wp = world.driveWaypoint(car, targetX, targetY);
  const steerPoint = world.laneSteerTarget(car, wp);
  const want = Math.atan2(steerPoint.y - car.y, steerPoint.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 3, -1, 1);
  input.left = steer < -0.02;
  input.right = steer > 0.02;
  // Brake before a sharp turn instead of blasting past it; reverse out when
  // the target is behind the car; never handbrake while reversing. Slow down
  // behind a car ahead rather than rear-ending it.
  let blocked = false;
  for (const other of world.state.cars) {
    if (other === car || other.health <= 0) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 130) {
      const ahead = Math.atan2(other.y - car.y, other.x - car.x) - car.angle;
      const norm = ((ahead + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(norm) < 0.5) blocked = true;
    }
  }
  const nearWp = Math.hypot(wp.x - car.x, wp.y - car.y) < 130;
  const wantFast = Math.abs(diff) < 0.5 || (Math.abs(diff) < 1.0 && car.speed < 250);
  const needSlow = (Math.abs(diff) > 0.5 && car.speed > 250) || (nearWp && car.speed > 120) || (car.speed < 40 && Math.abs(diff) > 1.2);
  input.up = wantFast && !blocked && !needSlow;
  input.down = blocked || needSlow;
  input.handbrake = false;
  return input;
}

/** Run the world forward for `seconds`, steering at `target`, and stop early on a big event. */
function runForward(world, seconds, targetFn, wantKind = 'player') {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const target = targetFn(i);
    const events = world.step(STEP, autopilotInput(world, target.x, target.y, wantKind));
    if (events & (EVENT_BUSTED | EVENT_WASTED | EVENT_MISSION_DONE)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over the garage. drive: mission 1, driving to the pickup.
 * chase: a stolen car with the police on its tail. end: the debt cleared.
 */
export function stageShot(name, world) {
  world.reset(0);
  if (name === 'drive') {
    runForward(world, DRIVE_SECONDS, () => {
      const m = world.state.mission;
      return m ? m.target : { x: world.city.taxiPickup.x, y: world.city.taxiPickup.y };
    });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // Steal the nearest traffic car (a real crime: wanted 1, a cop spawns),
    // then keep driving so the police car is right behind.
    runForward(world, CHASE_SECONDS, (i) => {
      const p = world.state.player;
      if (p.inCar) {
        // Weave between two intersections so the chase stays in frame.
        const leg = Math.floor(i / 300) % 2 === 0;
        return leg ? { x: 3120, y: 2640 } : { x: 240, y: 240 };
      }
      const car = world.state.cars.find((c) => c.kind === 'traffic');
      return car ? { x: car.x, y: car.y } : { x: CITY.garage.x, y: CITY.garage.y };
    }, 'traffic');
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    // The story, finished: the debt cleared, the garage paid for, Jax driving
    // his own car down Ocean Drive with the beach on his right.
    const s = world.state;
    s.cash = 8200;
    s.missionIndex = 4;
    s.storyDone = true;
    s.mission = null;
    s.fare = { x: 3600, y: 720 };
    const car = s.cars.find((c) => c.kind === 'player');
    car.x = 1200;
    car.y = 2640;
    car.angle = 0;
    car.vx = 420;
    car.vy = 0;
    car.driver = 'player';
    s.player.inCar = car;
    s.player.x = car.x;
    s.player.y = car.y;
    s.player.angle = 0;
    world.say('Debt cleared. Solmar is yours now.', 6);
    return { screen: SCREEN_COMPLETE };
  }
  // start (and anything unknown): a few quiet seconds at the garage.
  for (let i = 0; i < START_SECONDS / STEP; i++) {
    world.step(STEP, {
      moveX: 0, moveY: 0, up: false, down: false, left: false, right: false,
      sprint: false, handbrake: false, shoot: false, punch: false,
      enter: false, reload: false, horn: false, aimX: undefined, aimY: undefined,
    });
  }
  return { screen: SCREEN_TITLE };
}
