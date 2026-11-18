// SOLMAR's rules and state, with no drawing and no browser in it: the player on
// foot and in cars, traffic, pedestrians, police and the wanted level, combat,
// pickups, the four story missions and free roam. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound,
// announcements) without the world knowing about screens.
import { CAR, CITY, ECONOMY, GUN, MISSIONS, PALETTE, PED, PED_COUNT, PLAYER, POLICE, TRAFFIC_COUNT, WANTED_MAX, WORLD } from './config.js';
import { createCity } from './city.js';
import { randomInt, randomPick, randomRange } from './random.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_CRASH = 8;
export const EVENT_WANTED_UP = 16;
export const EVENT_WANTED_DOWN = 32;
export const EVENT_MISSION_DONE = 64;
export const EVENT_MISSION_FAIL = 128;
export const EVENT_BUSTED = 256;
export const EVENT_WASTED = 512;
export const EVENT_ENEMY_DOWN = 1024;
export const EVENT_HORN = 2048;

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    time: 0,
    cash: ECONOMY.startCash,
    wanted: 0,
    lastSeen: 0,
    decayTimer: 0,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    van: null,
    pickups: [],
    particles: [],
    mission: null,
    missionIndex: 0,
    storyDone: false,
    fare: null,
    message: '',
    messageTimer: 0,
    stats: { shots: 0, hits: 0, carsStolen: 0, pedsHit: 0, copsLost: 0 },
  };

  // ------------------------------------------------------------ helpers

  function say(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  /** True when the segment is blocked by a building (sampled every 24 units). */
  function segmentBlocked(x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / 24));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (city.buildingAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
    }
    return false;
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + random() * 0.4, max: 0.8, color, size: 2 + random() * 3 });
    }
    if (state.particles.length > 240) state.particles.splice(0, state.particles.length - 240);
  }

  function addWanted(n, why) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED_MAX);
    if (state.wanted > before) {
      state.lastSeen = 0;
      state.decayTimer = 0;
      spawnCops();
      return EVENT_WANTED_UP;
    }
    return 0;
  }

  // ------------------------------------------------------------ entities

  function makePlayerCar() {
    const car = {
      kind: 'player', x: CITY.garage.x + 90, y: CITY.garage.y + 20, angle: 0,
      vx: 0, vy: 0, speed: 0, health: CAR.health, color: PALETTE.playerCar,
      driver: 'none', target: null, honk: 0,
    };
    state.cars.push(car);
    return car;
  }

  function makeTrafficCar() {
    const p = city.randomRoadPoint(random, true);
    const car = {
      kind: 'traffic', x: p.x + randomRange(random, -20, 20), y: p.y + randomRange(random, -20, 20),
      angle: random() * TAU, vx: 0, vy: 0, speed: 0,
      health: CAR.health, color: randomPick(random, PALETTE.trafficCar),
      driver: 'npc', target: city.randomRoadPoint(random, true), honk: 0,
      stuck: 0, reverse: 0, age: 0,
    };
    state.cars.push(car);
    return car;
  }

  function makePed() {
    const p = city.randomRoadPoint(random, true);
    const ped = {
      x: p.x + randomRange(random, -60, 60), y: p.y + randomRange(random, -60, 60),
      angle: random() * TAU, speed: 0, state: 'walk', target: city.randomRoadPoint(random, true),
      color: randomPick(random, PALETTE.ped), fleeTimer: 0, down: 0, downTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function makeCop() {
    // Spawn on a road 450-650 units from the player, in a police car.
    for (let tries = 0; tries < 12; tries++) {
      const a = random() * TAU;
      const d = 450 + random() * 200;
      const x = state.player.x + Math.cos(a) * d;
      const y = state.player.y + Math.sin(a) * d;
      if (x < 60 || y < 60 || x > WORLD.width - 60 || y > WORLD.height - 60) continue;
      const p = city.nearestRoadPoint(x, y);
      const car = {
        kind: 'police', x: p.x, y: p.y, angle: random() * TAU, vx: 0, vy: 0, speed: 0,
        health: CAR.health, color: PALETTE.policeCar, driver: 'cop', target: null, honk: 0,
      };
      state.cars.push(car);
      const cop = { x: p.x, y: p.y, angle: 0, speed: 0, inCar: true, car, bustTimer: 0, shootCd: 0, health: 100 };
      state.cops.push(cop);
      return cop;
    }
    return null;
  }

  function spawnCops() {
    const want = POLICE.countByStars[state.wanted] ?? 0;
    while (state.cops.length < want) if (!makeCop()) break;
  }

  function removeCop(cop) {
    const ci = state.cops.indexOf(cop);
    if (ci >= 0) state.cops.splice(ci, 1);
    if (cop.car) {
      const ki = state.cars.indexOf(cop.car);
      if (ki >= 0) state.cars.splice(ki, 1);
    }
  }

  function makePickup(x, y, kind, amount) {
    state.pickups.push({ x, y, kind, amount, active: true, respawn: 0 });
  }

  function setupPickups() {
    makePickup(CITY.garage.x - 60, CITY.garage.y + 90, 'health', 40);
    makePickup(CITY.park.x + CITY.park.w / 2, CITY.park.y + CITY.park.h / 2, 'health', 40);
    makePickup(CITY.pier.x + 40, CITY.pier.y - 60, 'ammo', 12);
    makePickup(CITY.garage.x + 150, CITY.garage.y + 90, 'ammo', 12);
  }

  // ------------------------------------------------------------ missions

  function missionTarget(mission) {
    return mission.target;
  }

  function startMission(index) {
    const def = MISSIONS[index];
    // Between jobs the heat dies down: a new mission always starts clean.
    clearWanted();
    // And the garage fixes up your ride: if you are in it, it is repaired;
    // otherwise it is back at the garage, fixed up, for the next job.
    const own = state.cars.find((c) => c.kind === 'player');
    if (own) {
      if (state.player.inCar === own) {
        own.health = CAR.health;
      } else {
        own.x = CITY.garage.x + 90;
        own.y = CITY.garage.y + 20;
        own.angle = 0;
        own.vx = 0;
        own.vy = 0;
        own.speed = 0;
        own.health = CAR.health;
        own.driver = 'npc';
      }
    }
    const mission = {
      index, def, stage: 0, timer: def.timeLimit, text: def.brief,
      target: null, targetLabel: '',
    };
    if (index === 0) {
      mission.target = { x: city.taxiPickup.x, y: city.taxiPickup.y };
      mission.targetLabel = 'Pick up the package';
    } else if (index === 1) {
      mission.target = { x: city.stealCarSpot.x, y: city.stealCarSpot.y };
      mission.targetLabel = 'Steal the Comet GT by the pier';
    } else if (index === 2) {
      mission.target = { x: CITY.pier.x + CITY.pier.w / 2, y: CITY.pier.y + CITY.pier.h / 2 };
      mission.targetLabel = 'Reach the pier';
    } else if (index === 3) {
      mission.target = { x: city.bankSpot.x, y: city.bankSpot.y };
      mission.targetLabel = 'Find the armored van on Ocean Drive';
    }
    state.mission = mission;
    say(`${def.name}: ${mission.targetLabel}`);
    return mission;
  }

  function completeMission() {
    const mission = state.mission;
    const reward = mission.def.reward;
    state.cash += reward;
    state.missionIndex += 1;
    state.mission = null;
    state.van = null;
    state.enemies = [];
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      spawnFare();
      say(`Debt cleared! Solmar is yours now — take fares to earn more.`, 6);
    } else {
      say(`Mission complete: ${mission.def.name} — $${reward} earned.`, 5);
      // The next job starts at once; the brief screen shows it before the
      // player drives off, and the world does not step while it is shown,
      // so its timer cannot run down there.
      startMission(state.missionIndex);
    }
    return EVENT_MISSION_DONE;
  }

  function failMission(why) {
    state.mission = null;
    state.van = null;
    state.enemies = [];
    state.wanted = 0;
    state.cops.splice(0, state.cops.length);
    for (const car of state.cars) if (car.kind === 'police') car.health = 0;
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    say(why, 5);
    return EVENT_MISSION_FAIL;
  }

  function spawnFare() {
    const p = city.randomRoadPoint(random, true);
    state.fare = { x: p.x, y: p.y };
  }

  function spawnCollectors() {
    const spots = [
      { x: CITY.pier.x + 60, y: CITY.pier.y + 30 },
      { x: CITY.pier.x + CITY.pier.w - 60, y: CITY.pier.y + 40 },
      { x: CITY.pier.x + CITY.pier.w / 2, y: CITY.pier.y + CITY.pier.h - 30 },
    ];
    for (const s of spots) {
      state.enemies.push({ x: s.x, y: s.y, angle: 0, health: 60, shootCd: 1 + random(), alive: true });
    }
  }

  function spawnVan() {
    const van = {
      kind: 'van', x: 240, y: 2640, angle: 0, vx: 0, vy: 0, speed: 0,
      health: 220, color: '#5a6a7a', driver: 'npc', target: { x: 3600, y: 2640 },
      honk: 0, dir: 1,
    };
    state.cars.push(van);
    state.van = van;
    return van;
  }

  function resetPlayerToGarage() {
    const p = state.player;
    p.x = CITY.garage.x;
    p.y = CITY.garage.y + 120;
    p.angle = -Math.PI / 2;
    p.health = PLAYER.health;
    p.ammo = GUN.magSize;
    p.inCar = null;
    p.vx = 0;
    p.vy = 0;
  }

  // ------------------------------------------------------------ combat

  function shootBullet(fromX, fromY, angle, damage, shooter) {
    const p = state.player;
    let best = null;
    let bestD = GUN.range;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const targets = [];
    for (const e of state.enemies) if (e.alive) targets.push({ x: e.x, y: e.y, r: 16, ref: e, kind: 'enemy' });
    for (const cop of state.cops) {
      if (!cop.inCar) targets.push({ x: cop.x, y: cop.y, r: 14, ref: cop, kind: 'cop' });
    }
    for (const ped of state.peds) {
      if (ped.down <= 0) targets.push({ x: ped.x, y: ped.y, r: 12, ref: ped, kind: 'ped' });
    }
    for (const car of state.cars) {
      if (car === p.inCar) continue;
      targets.push({ x: car.x, y: car.y, r: CAR.radius, ref: car, kind: 'car' });
    }
    if (shooter !== 'player') targets.push({ x: p.x, y: p.y, r: PLAYER.radius, ref: p, kind: 'player' });
    for (const t of targets) {
      const relX = t.x - fromX;
      const relY = t.y - fromY;
      const along = relX * dx + relY * dy;
      if (along < 0 || along > bestD) continue;
      const perp = Math.abs(relX * dy - relY * dx);
      if (perp > t.r) continue;
      if (segmentBlocked(fromX, fromY, t.x, t.y)) continue;
      best = t;
      bestD = along;
    }
    const endX = fromX + dx * bestD;
    const endY = fromY + dy * bestD;
    addParticles(endX, endY, '#ffd23f', 4, 120);
    let events = 0;
    if (best) {
      addParticles(best.x, best.y, '#ff5a5a', 8, 180);
      if (best.kind === 'enemy') {
        best.ref.health -= damage;
        if (best.ref.health <= 0) {
          best.ref.alive = false;
          events |= EVENT_ENEMY_DOWN;
          say('Collector down.');
        }
      } else if (best.kind === 'cop') {
        best.ref.health = (best.ref.health ?? 100) - damage;
        if (best.ref.health <= 0) {
          removeCop(best.ref);
          events |= addWanted(1, 'took down a cop');
        } else {
          events |= addWanted(1, 'shot a cop');
        }
      } else if (best.kind === 'ped') {
        best.ref.down = 1;
        best.ref.downTimer = 20;
        events |= addWanted(1, 'shot a pedestrian');
      } else if (best.kind === 'car') {
        best.ref.health -= damage;
        if (best.ref.health <= 0) {
          addParticles(best.ref.x, best.ref.y, '#ff8a3b', 24, 260);
          best.ref.health = 0;
          best.ref.driver = 'none';
          events |= EVENT_CRASH;
        }
      } else if (best.kind === 'player') {
        events |= damagePlayer(damage, 'shot');
      }
    }
    return events;
  }

  function damagePlayer(amount, why) {
    const p = state.player;
    if (p.inCar) {
      p.inCar.health -= amount;
      if (p.inCar.health <= 0) {
        p.inCar.health = 0;
        addParticles(p.inCar.x, p.inCar.y, '#ff8a3b', 24, 260);
        exitCar(p);
        return EVENT_CRASH;
      }
      return EVENT_HIT;
    }
    p.health -= amount;
    addParticles(p.x, p.y, '#ff5a5a', 6, 160);
    if (p.health <= 0) {
      p.health = 0;
      return EVENT_WASTED;
    }
    return EVENT_HIT;
  }

  function playerShoot() {
    const p = state.player;
    if (p.inCar || p.shootCd > 0 || p.reload > 0) return 0;
    if (p.ammo <= 0) {
      p.reload = GUN.reloadTime;
      say('Reloading…');
      return 0;
    }
    p.shootCd = GUN.cooldown;
    p.ammo -= 1;
    state.stats.shots += 1;
    const angle = p.angle + (random() - 0.5) * 2 * GUN.spread;
    const mx = p.x + Math.cos(p.angle) * 20;
    const my = p.y + Math.sin(p.angle) * 20;
    let events = EVENT_SHOT | shootBullet(mx, my, angle, GUN.damage, 'player');
    // Firing where a cop can see it draws the law.
    for (const cop of state.cops) {
      if (dist(cop.x, cop.y, p.x, p.y) < POLICE.sightRange && !segmentBlocked(cop.x, cop.y, p.x, p.y)) {
        events |= addWanted(1, 'fired in front of a cop');
        break;
      }
    }
    return events;
  }

  function playerPunch() {
    const p = state.player;
    if (p.inCar || p.punchCd > 0) return 0;
    p.punchCd = PLAYER.punchCooldown;
    let events = 0;
    const fx = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const fy = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const e of state.enemies) {
      if (e.alive && dist(fx, fy, e.x, e.y) < 30) {
        e.health -= PLAYER.punchDamage;
        addParticles(e.x, e.y, '#ff5a5a', 6, 160);
        if (e.health <= 0) {
          e.alive = false;
          events |= EVENT_ENEMY_DOWN;
        }
      }
    }
    for (const cop of state.cops) {
      if (!cop.inCar && dist(fx, fy, cop.x, cop.y) < 28) {
        events |= addWanted(1, 'punched a cop');
      }
    }
    return events;
  }

  // ------------------------------------------------------------ cars

  function nearestCar(x, y, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of state.cars) {
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(p, car) {
    if (car.kind === 'steal') {
      // The Comet GT by the pier is not yours to take: the law notices.
      car.driver = 'player';
      state.stats.carsStolen += 1;
      p.inCar = car;
      return addWanted(1, 'stole the Comet GT');
    }
    if (car.kind === 'traffic' && car.driver === 'npc') {
      // Yank the driver out: that is grand theft auto, and the law notices.
      car.driver = 'player';
      state.stats.carsStolen += 1;
      const ped = makePed();
      ped.x = car.x + 40;
      ped.y = car.y + 40;
      ped.state = 'flee';
      ped.fleeTimer = 3;
      const events = addWanted(1, 'stole a car');
      p.inCar = car;
      return events;
    }
    car.driver = 'player';
    p.inCar = car;
    return 0;
  }

  function exitCar(p) {
    const car = p.inCar;
    if (!car) return;
    car.driver = 'none';
    car.vx *= 0.2;
    car.vy *= 0.2;
    p.inCar = null;
    const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 44, y: car.y + Math.sin(car.angle + Math.PI / 2) * 44 };
    if (city.circleFits(side.x, side.y, PLAYER.radius)) {
      p.x = side.x;
      p.y = side.y;
    } else {
      p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 44;
      p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 44;
    }
    p.angle = car.angle;
  }

  /** The immediate point a car should steer toward to reach (tx, ty) on the
   * road grid. The car follows the road it is traveling on (by heading) to
   * the next intersection, then turns — it never cuts across a block, and it
   * never switches roads while merely crossing an intersection at speed. */
  function driveWaypoint(car, tx, ty) {
    if (!city.onRoad(car.x, car.y)) return city.nearestRoadPoint(car.x, car.y);
    const eastWest = Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle));
    let street = null;
    let avenue = null;
    for (const sy of CITY.streetY) if (Math.abs(car.y - sy) <= CITY.roadHalf) street = sy;
    for (const ax of CITY.avenueX) if (Math.abs(car.x - ax) <= CITY.roadHalf) avenue = ax;
    // The road the car is traveling on: the one it is on; at an intersection
    // (on both) the heading decides; off-axis on a single road, that road.
    const useStreet = street !== null && avenue !== null ? eastWest : street !== null;
    if (useStreet) {
      // Traveling along a street: straight there when the target is on it,
      // else the intersection on this street nearest the target.
      if (Math.abs(ty - street) <= CITY.roadHalf) return { x: tx, y: ty };
      let best = null;
      let bestD = Infinity;
      for (const ax of CITY.avenueX) {
        const d = Math.abs(ax - tx);
        if (d < bestD) {
          bestD = d;
          best = { x: ax, y: street };
        }
      }
      // Already at that intersection: turn onto the avenue.
      if (best && dist(car.x, car.y, best.x, best.y) < 50 && avenue !== null) {
        if (Math.abs(tx - avenue) <= CITY.roadHalf) return { x: tx, y: ty };
        let next = null;
        let nextD = Infinity;
        for (const sy of CITY.streetY) {
          const d = Math.abs(sy - ty);
          if (d < nextD) {
            nextD = d;
            next = { x: avenue, y: sy };
          }
        }
        if (next) return next;
      }
      return best ?? { x: tx, y: ty };
    }
    if (avenue !== null) {
      // Traveling along an avenue: the mirror image of the street case.
      if (Math.abs(tx - avenue) <= CITY.roadHalf) return { x: tx, y: ty };
      let best = null;
      let bestD = Infinity;
      for (const sy of CITY.streetY) {
        const d = Math.abs(sy - ty);
        if (d < bestD) {
          bestD = d;
          best = { x: avenue, y: sy };
        }
      }
      if (best && dist(car.x, car.y, best.x, best.y) < 50 && street !== null) {
        if (Math.abs(ty - street) <= CITY.roadHalf) return { x: tx, y: ty };
        let next = null;
        let nextD = Infinity;
        for (const ax of CITY.avenueX) {
          const d = Math.abs(ax - tx);
          if (d < nextD) {
            nextD = d;
            next = { x: ax, y: street };
          }
        }
        if (next) return next;
      }
      return best ?? { x: tx, y: ty };
    }
    // No road under the car (should not happen after the onRoad check).
    return city.nearestRoadPoint(tx, ty);
  }

  /**
   * The point to steer at on the way to a waypoint: a near lookahead point on
   * the right-hand lane of the road the car is traveling on. The lane follows
   * the road's own axis (a street's lane is a y offset, an avenue's an x
   * offset) — offsetting perpendicular to the diagonal to the waypoint would
   * push the car off the road instead of into its lane. The lookahead never
   * overshoots the waypoint, or the car would sail past its turn.
   */
  // The point on the road the car steers toward, on its right lane (side=1)
  // or the oncoming lane (side=-1, used to overtake a slow car ahead).
  function laneSteerTarget(car, wp, side = 1) {
    const d = dist(car.x, car.y, wp.x, wp.y);
    const look = Math.min(120, d);
    const wAng = angleTo(car.x, car.y, wp.x, wp.y);
    const tx = car.x + Math.cos(wAng) * look;
    const ty = car.y + Math.sin(wAng) * look;
    for (const sy of CITY.streetY) {
      if (Math.abs(car.y - sy) <= CITY.roadHalf && Math.abs(wp.y - sy) <= CITY.roadHalf) {
        return { x: tx, y: sy + side * 20 * (wp.x >= car.x ? 1 : -1) };
      }
    }
    for (const ax of CITY.avenueX) {
      if (Math.abs(car.x - ax) <= CITY.roadHalf && Math.abs(wp.x - ax) <= CITY.roadHalf) {
        return { x: ax - side * 20 * (wp.y >= car.y ? 1 : -1), y: ty };
      }
    }
    return { x: tx, y: ty };
  }

  /** Arcade car physics: throttle, steering, lateral grip, drag, walls. */
  function stepCar(car, dt, throttle, steer, handbrake) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const fwd = car.vx * fx + car.vy * fy;
    if (throttle > 0) {
      car.vx += fx * CAR.accel * throttle * dt;
      car.vy += fy * CAR.accel * throttle * dt;
    } else if (throttle < 0) {
      if (fwd > 30) {
        car.vx -= fx * CAR.brake * dt;
        car.vy -= fy * CAR.brake * dt;
      } else {
        car.vx += fx * CAR.reverseAccel * dt;
        car.vy += fy * CAR.reverseAccel * dt;
      }
    }
    const speed = Math.hypot(car.vx, car.vy);
    const dir = fwd >= 0 ? 1 : -1;
    // A stopped car can still pivot slowly: without a floor, a car that stops
    // facing the wrong way can never turn toward its target again.
    const turnAuthority = clamp(Math.abs(fwd) / 200, 0.25, 1);
    car.angle += steer * CAR.turnRate * turnAuthority * dir * dt;
    // Split velocity into forward and lateral, then damp the lateral hard (grip).
    const nfx = Math.cos(car.angle);
    const nfy = Math.sin(car.angle);
    const nfwd = car.vx * nfx + car.vy * nfy;
    const lat = (-car.vx * nfy + car.vy * nfx) * Math.exp(-(handbrake ? 1.2 : CAR.grip) * dt);
    car.vx = nfx * nfwd - nfy * lat;
    car.vy = nfy * nfwd + nfx * lat;
    const drag = Math.exp(-CAR.drag * dt) * (handbrake ? 0.94 : 1);
    car.vx *= drag;
    car.vy *= drag;
    const spd = Math.hypot(car.vx, car.vy);
    const max = car.kind === 'police' ? POLICE.maxSpeed : CAR.maxSpeed;
    if (spd > max) {
      car.vx *= max / spd;
      car.vy *= max / spd;
    }
    if (spd < 4 && throttle === 0) {
      car.vx = 0;
      car.vy = 0;
    }
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.speed = Math.hypot(car.vx, car.vy);
    const pushed = city.collideCircle(car, CAR.radius);
    if (pushed > 0 && speed > 140) {
      car.health -= CAR.crashDamage * (speed / CAR.maxSpeed);
      car.vx *= 0.35;
      car.vy *= 0.35;
      return EVENT_CRASH;
    }
    if (pushed > 0 && speed > 40) {
      car.health -= CAR.scrapeDamage * dt * 4;
    }
    return 0;
  }

  function stepTrafficCar(car, dt) {
    if (car.health <= 0) return 0;
    car.age = (car.age ?? 0) + dt;
    if (!car.target || dist(car.x, car.y, car.target.x, car.target.y) < 60) {
      car.target = city.randomRoadPoint(random, true);
    }
    const wp = driveWaypoint(car, car.target.x, car.target.y);
    const rightPoint = laneSteerTarget(car, wp);
    // Slow down for turns: a slow car turns tightly and stays on the road.
    // Also slow down approaching the next intersection, so the turn itself
    // is taken at a speed the road can hold.
    const turnDiff = Math.abs(angleDiff(angleTo(car.x, car.y, rightPoint.x, rightPoint.y), car.angle));
    let throttle = 0.55;
    if (turnDiff > 0.5) throttle = 0.2;
    if (turnDiff > 1.1) throttle = 0;
    if (dist(car.x, car.y, wp.x, wp.y) < 130) throttle = Math.min(throttle, 0.1);
    // Wedged against a building corner: back out and pick a new destination.
    if (car.reverse > 0) {
      car.reverse -= dt;
      const backSteer = clamp(angleDiff(angleTo(car.x, car.y, rightPoint.x, rightPoint.y), car.angle) * 1.6, -1, 1);
      return stepCar(car, dt, -1, -backSteer, false);
    }
    // Stuck at low speed for any reason (wedged, or queued behind a car
    // that will not move): back out and pick a new destination. This fires
    // even while braking for the car ahead, so a jam always clears itself.
    if (car.age > 2 && car.speed < 50) {
      car.stuck = (car.stuck ?? 0) + dt;
      if (car.stuck > 1.5) {
        car.stuck = 0;
        car.reverse = 0.9;
        car.target = city.randomRoadPoint(random, true);
      }
    } else {
      car.stuck = 0;
    }
    // The car ahead: overtake it on the oncoming lane when that lane is
    // clear, otherwise slow down and wait behind it.
    let steerPoint = rightPoint;
    let slowAhead = null;
    for (const other of state.cars) {
      if (other === car || other.health <= 0) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 90) {
        const ahead = angleDiff(angleTo(car.x, car.y, other.x, other.y), car.angle);
        if (Math.abs(ahead) < 0.6 && other.speed < 120) slowAhead = other;
      }
    }
    if (slowAhead) {
      const leftPoint = laneSteerTarget(car, wp, -1);
      let leftClear = true;
      for (const other of state.cars) {
        if (other === car || other === slowAhead || other.health <= 0) continue;
        if (dist(leftPoint.x, leftPoint.y, other.x, other.y) < 80) leftClear = false;
      }
      if (leftClear) {
        steerPoint = leftPoint;
        throttle = Math.max(throttle, 0.4);
      } else {
        throttle = -0.4;
      }
    }
    const want = angleTo(car.x, car.y, steerPoint.x, steerPoint.y);
    const diff = angleDiff(want, car.angle);
    const steer = clamp(diff * 1.6, -1, 1);
    return stepCar(car, dt, throttle, steer, false);
  }

  function stepPoliceCar(car, dt, targetX, targetY) {
    if (car.health <= 0) return 0;
    if (car.ramCd > 0) car.ramCd -= dt;
    const goal = city.onRoad(targetX, targetY) ? { x: targetX, y: targetY } : city.nearestRoadPoint(targetX, targetY);
    const d = dist(car.x, car.y, goal.x, goal.y);
    let want;
    if (d > 120) {
      // Far away: drive the road like everyone else, on the right lane.
      const wp = driveWaypoint(car, goal.x, goal.y);
      const steerPoint = laneSteerTarget(car, wp);
      want = angleTo(car.x, car.y, steerPoint.x, steerPoint.y);
    } else {
      // Close: cut the corner and ram.
      want = angleTo(car.x, car.y, targetX, targetY);
    }
    const diff = angleDiff(want, car.angle);
    const steer = clamp(diff * 2.0, -1, 1);
    // Just rammed something: follow at low speed instead of ramming again.
    let throttle = d > 40 ? 1 : 0.4;
    if (car.ramCd > 0) throttle = Math.min(throttle, 0.2);
    return stepCar(car, dt, throttle, steer, false);
  }

  function collideCars(dt) {
    let events = 0;
    const cars = state.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.health <= 0 || b.health <= 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR.carRadius * 2 - 4;
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const relSpeed = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (relSpeed > 220) {
          a.health -= relSpeed * 0.01;
          b.health -= relSpeed * 0.01;
          events |= EVENT_CRASH;
          addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd23f', 8, 200);
          // A police car that just rammed someone backs off for a few
          // seconds instead of ramming again immediately: the player gets
          // a chance to escape, and a chase does not shred a car in seconds.
          for (const c of [a, b]) {
            if (c.kind === 'police') c.ramCd = 5;
          }
          // The player ramming the armored van is the point of mission 4.
          if ((a === state.van || b === state.van) && state.mission && state.mission.index === 3 && state.mission.stage === 1) {
            state.van.health -= relSpeed * 0.12;
          }
        }
        const avgVx = (a.vx + b.vx) / 2;
        const avgVy = (a.vy + b.vy) / 2;
        a.vx = avgVx * 0.7;
        a.vy = avgVy * 0.7;
        b.vx = avgVx * 0.7;
        b.vy = avgVy * 0.7;
      }
    }
    return events;
  }

  // ------------------------------------------------------------ peds

  function scarePeds(x, y, radius) {
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (dist(x, y, ped.x, ped.y) < radius) {
        ped.state = 'flee';
        ped.fleeTimer = 2 + random();
        ped.target = { x: ped.x + (ped.x - x), y: ped.y + (ped.y - y) };
      }
    }
  }

  function stepPed(ped, dt) {
    if (ped.down > 0) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = 0;
        ped.state = 'walk';
        ped.target = city.randomRoadPoint(random, true);
      }
      return 0;
    }
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    else if (ped.state === 'flee') ped.state = 'walk';
    if (ped.state === 'walk' && (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 40)) {
      ped.target = city.randomRoadPoint(random, true);
    }
    const speed = ped.state === 'flee' ? PED.runSpeed : PED.walkSpeed;
    const want = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
    ped.angle = want;
    ped.x += Math.cos(want) * speed * dt;
    ped.y += Math.sin(want) * speed * dt;
    city.collideCircle(ped, PED.radius);
    // A fast car mows a pedestrian down: a crime, and the law notices.
    let events = 0;
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      const d = dist(ped.x, ped.y, car.x, car.y);
      if (d < CAR.radius + PED.radius && car.speed > 200) {
        ped.down = 1;
        ped.downTimer = 25;
        addParticles(ped.x, ped.y, '#ff5a5a', 10, 200);
        if (car.driver === 'player') {
          state.stats.pedsHit += 1;
          events |= addWanted(1, 'hit a pedestrian');
          scarePeds(ped.x, ped.y, 300);
        }
      }
    }
    return events;
  }

  // ------------------------------------------------------------ cops

  function stepCop(cop, dt) {
    const p = state.player;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (cop.inCar) {
      if (p.inCar) {
        stepPoliceCar(cop.car, dt, p.x, p.y);
        cop.x = cop.car.x;
        cop.y = cop.car.y;
        // Ram the player's car: damage on contact is handled by collideCars.
        return 0;
      }
      // Player on foot: park nearby and give chase on foot.
      if (d < 160) {
        cop.inCar = false;
        cop.car.driver = 'none';
        cop.x = cop.car.x;
        cop.y = cop.car.y;
        return 0;
      }
      stepPoliceCar(cop.car, dt, p.x, p.y);
      cop.x = cop.car.x;
      cop.y = cop.car.y;
      return 0;
    }
    // On foot: run the player down.
    if (p.inCar) {
      // Get back to the car and drive.
      const cd = dist(cop.x, cop.y, cop.car.x, cop.car.y);
      if (cd < 40) {
        cop.inCar = true;
        cop.car.driver = 'cop';
        cop.x = cop.car.x;
        cop.y = cop.car.y;
        return 0;
      }
      const want = angleTo(cop.x, cop.y, cop.car.x, cop.car.y);
      cop.angle = want;
      cop.x += Math.cos(want) * 320 * dt;
      cop.y += Math.sin(want) * 320 * dt;
      city.collideCircle(cop, PED.radius);
      return 0;
    }
    const want = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = want;
    const speed = 300;
    cop.x += Math.cos(want) * speed * dt;
    cop.y += Math.sin(want) * speed * dt;
    city.collideCircle(cop, PED.radius);
    if (d < POLICE.bustRange) {
      cop.bustTimer += dt;
      if (cop.bustTimer >= POLICE.bustTime) return EVENT_BUSTED;
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt);
    }
    return 0;
  }

  function updateWanted(dt) {
    let events = 0;
    if (state.wanted === 0) return 0;
    const p = state.player;
    let seen = false;
    for (const cop of state.cops) {
      if (dist(cop.x, cop.y, p.x, p.y) < POLICE.sightRange && !segmentBlocked(cop.x, cop.y, p.x, p.y)) {
        seen = true;
        break;
      }
    }
    if (seen) {
      state.lastSeen = 0;
      state.decayTimer = 0;
    } else {
      state.lastSeen += dt;
      if (state.lastSeen > POLICE.loseSightSeconds) {
        state.decayTimer += dt;
        if (state.decayTimer >= POLICE.decaySeconds) {
          state.decayTimer = 0;
          state.wanted -= 1;
          events |= EVENT_WANTED_DOWN;
          if (state.wanted === 0) {
            state.stats.copsLost += 1;
            say('You lost them. The heat is off — for now.');
          }
        }
      }
    }
    // Too many cops is a crowd: trim the ones farthest away.
    const want = POLICE.countByStars[state.wanted] ?? 0;
    if (state.cops.length > want) {
      state.cops.sort((a, b) => dist(b.x, b.y, p.x, p.y) - dist(a.x, a.y, p.x, p.y));
      while (state.cops.length > want) removeCop(state.cops[0]);
    }
    return events;
  }

  // ------------------------------------------------------------ enemies

  function stepEnemy(e, dt) {
    if (!e.alive) return 0;
    const p = state.player;
    const d = dist(e.x, e.y, p.x, p.y);
    e.shootCd -= dt;
    if (d < 420 && !segmentBlocked(e.x, e.y, p.x, p.y) && e.shootCd <= 0) {
      e.shootCd = 1.1 + random() * 0.7;
      e.angle = angleTo(e.x, e.y, p.x, p.y);
      const angle = e.angle + (random() - 0.5) * 0.16;
      return shootBullet(e.x, e.y, angle, 12, 'enemy');
    }
    return 0;
  }

  // ------------------------------------------------------------ missions

  function atTarget(target, radius) {
    const p = state.player;
    const ref = p.inCar ? p.inCar : p;
    return dist(ref.x, ref.y, target.x, target.y) < radius;
  }

  function updateMission(dt, ambient) {
    const mission = state.mission;
    if (!mission) return 0;
    if (mission.timer > 0 && !ambient) {
      mission.timer -= dt;
      if (mission.timer <= 0) {
        return failMission(`Out of time on ${mission.def.name}. Sal is not pleased — try it again.`);
      }
    }
    let events = 0;
    if (mission.index === 0) {
      if (mission.stage === 0) {
        if (atTarget(mission.target, 70)) {
          mission.stage = 1;
          mission.target = { x: 3600, y: 2640 };
          mission.targetLabel = 'Deliver the package to the south-east corner';
          say('Package collected. Deliver it to the south-east corner — fast.');
        }
      } else if (atTarget(mission.target, 70)) {
        events |= completeMission();
      }
    } else if (mission.index === 1) {
      if (mission.stage === 0) {
        if (atTarget(mission.target, 80)) {
          mission.targetLabel = 'Get in the Comet GT (E)';
          if (state.player.inCar && state.player.inCar.kind === 'steal') {
            mission.stage = 1;
            mission.target = { x: city.chopShop.x, y: city.chopShop.y };
            mission.targetLabel = 'Deliver the Comet GT to the chop shop';
            say('Nice ride. Now get it to the chop shop in one piece.');
          }
        }
      } else if (state.player.inCar && state.player.inCar.kind === 'steal' && atTarget(mission.target, 80)) {
        events |= completeMission();
      }
    } else if (mission.index === 2) {
      if (mission.stage === 0) {
        if (atTarget(mission.target, 90)) {
          mission.stage = 1;
          spawnCollectors();
          mission.targetLabel = 'Deal with all three collectors';
          say('There they are. Three of them. Make it quick.');
        }
      } else if (mission.stage === 1) {
        if (state.enemies.every((e) => !e.alive)) {
          mission.stage = 2;
          mission.target = { x: CITY.garage.x, y: CITY.garage.y };
          mission.targetLabel = 'Get back to the garage';
          say('Pier is clear. Get back to the garage.');
        }
      } else if (atTarget(mission.target, 90)) {
        events |= completeMission();
      }
    } else if (mission.index === 3) {
      if (mission.stage === 0) {
        if (atTarget(mission.target, 120)) {
          mission.stage = 1;
          spawnVan();
          mission.targetLabel = 'Ram the armored van until it stops';
          say('There it is — the vault courier. Ram it until it stops!');
        }
      } else if (mission.stage === 1) {
        if (state.van && state.van.health <= 0) {
          mission.stage = 2;
          makePickup(state.van.x, state.van.y, 'cash', 4000);
          mission.target = { x: state.van.x, y: state.van.y };
          mission.targetLabel = 'Grab the cash';
          events |= addWanted(3, 'robbed the vault courier');
          say('The van is done. Grab the cash — and run!');
        }
      } else if (mission.stage === 2) {
        // Cash pickup advances the stage in the pickup handler below.
      } else if (mission.stage === 3) {
        if (state.wanted === 0 && atTarget(mission.target, 90)) {
          events |= completeMission();
        }
      }
    }
    return events;
  }

  function updateFare() {
    if (!state.storyDone || !state.fare) return 0;
    if (atTarget(state.fare, 70)) {
      state.cash += ECONOMY.taxiFare;
      say(`Fare done: +$${ECONOMY.taxiFare}. Another rider is waiting.`);
      spawnFare();
      return EVENT_PICKUP;
    }
    return 0;
  }

  function updatePickups(dt) {
    let events = 0;
    const p = state.player;
    for (const pk of state.pickups) {
      if (!pk.active) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) pk.active = true;
        continue;
      }
      const ref = p.inCar ? p.inCar : p;
      if (dist(ref.x, ref.y, pk.x, pk.y) > 46) continue;
      // The mission cash is grabbed on foot: driving over the bag does not
      // pick it up (health and ammo can be driven over). You stop the van,
      // get out, and grab it while the cops close in.
      if (pk.kind === 'cash' && p.inCar) continue;
      pk.active = false;
      pk.respawn = 30;
      if (pk.kind === 'health') {
        p.health = Math.min(PLAYER.health, p.health + pk.amount);
        say(`+${pk.amount} health.`);
        events |= EVENT_PICKUP;
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        say(`+${pk.amount} rounds.`);
        events |= EVENT_PICKUP;
      } else if (pk.kind === 'cash') {
        say(`$${pk.amount} in the bag. Lose the cops, then get home.`);
        events |= EVENT_PICKUP;
        if (state.mission && state.mission.index === 3 && state.mission.stage === 2) {
          state.mission.stage = 3;
          state.mission.target = { x: CITY.garage.x, y: CITY.garage.y };
          state.mission.targetLabel = 'Lose the cops, then get home';
        }
      }
    }
    return events;
  }

  // ------------------------------------------------------------ player

  function stepPlayerOnFoot(dt, input) {
    const p = state.player;
    const sprint = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const mx = input.moveX;
    const my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      p.x += (mx / len) * sprint * dt;
      p.y += (my / len) * sprint * dt;
      p.angle = Math.atan2(my, mx);
      if (input.aimX !== undefined) p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    } else if (input.aimX !== undefined) {
      p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }
    city.collideCircle(p, PLAYER.radius);
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        p.ammo = GUN.magSize;
        p.reload = 0;
      }
    }
    let events = 0;
    if (input.shoot) events |= playerShoot();
    if (input.punch) events |= playerPunch();
    if (input.enter) {
      // Enter the car the player is facing: a car right behind them (the one
      // they just got out of) should not beat the car they are walking to.
      let bestCar = null;
      let bestScore = Infinity;
      for (const car of state.cars) {
        if (car.health <= 0) continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d > 64) continue;
        const facing = Math.abs(angleDiff(angleTo(p.x, p.y, car.x, car.y), p.angle));
        const score = d + 60 * facing;
        if (score < bestScore) {
          bestScore = score;
          bestCar = car;
        }
      }
      if (bestCar) events |= enterCar(p, bestCar);
    }
    if (input.reload && p.ammo < GUN.magSize && p.reload === 0) {
      p.reload = GUN.reloadTime;
      say('Reloading…');
    }
    return events;
  }

  function stepPlayerInCar(dt, input) {
    const p = state.player;
    const car = p.inCar;
    const throttle = input.up ? 1 : input.down ? -1 : 0;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let events = stepCar(car, dt, throttle, steer, input.handbrake);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.health <= 0) {
      addParticles(car.x, car.y, '#ff8a3b', 24, 260);
      exitCar(p);
      events |= EVENT_CRASH;
      say('Your ride is wrecked.');
    }
    if (input.enter) exitCar(p);
    if (input.horn && car.honk <= 0) {
      car.honk = 0.5;
      events |= EVENT_HORN;
    }
    if (car.honk > 0) car.honk -= dt;
    // The garage repairs the player's car while it sits inside the yard.
    if (dist(car.x, car.y, CITY.garage.x, CITY.garage.y) < 130 && car.health < CAR.health) {
      car.health = Math.min(CAR.health, car.health + 20 * dt);
    }
    return events;
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    if (p.inCar) return stepPlayerInCar(dt, input);
    return stepPlayerOnFoot(dt, input);
  }

  // ------------------------------------------------------------ lifecycle

  function reset(missionIndex = 0, cash = ECONOMY.startCash) {
    state.time = 0;
    state.cash = cash;
    state.wanted = 0;
    state.lastSeen = 0;
    state.decayTimer = 0;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.enemies = [];
    state.van = null;
    state.pickups = [];
    state.particles = [];
    state.mission = null;
    state.missionIndex = missionIndex;
    state.storyDone = false;
    state.fare = null;
    state.message = '';
    state.messageTimer = 0;
    state.stats = { shots: 0, hits: 0, carsStolen: 0, pedsHit: 0, copsLost: 0 };
    state.player = {
      x: CITY.garage.x, y: CITY.garage.y + 120, angle: -Math.PI / 2,
      vx: 0, vy: 0, health: PLAYER.health, ammo: GUN.magSize,
      reload: 0, shootCd: 0, punchCd: 0, inCar: null,
    };
    makePlayerCar();
    // The Comet GT, parked by the pier for mission 2.
    const steal = {
      kind: 'steal', x: city.stealCarSpot.x, y: city.stealCarSpot.y, angle: city.stealCarSpot.angle,
      vx: 0, vy: 0, speed: 0, health: CAR.health, color: '#ffd23f',
      driver: 'none', target: null, honk: 0,
    };
    state.cars.push(steal);
    for (let i = 0; i < TRAFFIC_COUNT; i++) makeTrafficCar();
    for (let i = 0; i < PED_COUNT; i++) makePed();
    setupPickups();
    if (missionIndex >= MISSIONS.length) {
      // Loading a finished save: free roam with fares, no mission.
      state.storyDone = true;
      state.mission = null;
      spawnFare();
    } else {
      startMission(missionIndex);
    }
  }

  function retryMission() {
    const index = state.missionIndex;
    const cash = state.cash;
    reset(index, cash);
  }

  /** The heat is off: no stars, no cops, no police cars left behind. */
  function clearWanted() {
    state.wanted = 0;
    state.lastSeen = 0;
    state.decayTimer = 0;
    state.cops.splice(0, state.cops.length);
    state.cars = state.cars.filter((c) => c.kind !== 'police');
  }

  function step(dt, input, opts) {
    const ambient = !!(opts && opts.ambient);
    let events = 0;
    state.time += dt;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    events |= stepPlayer(dt, input);
    if (state.player.health <= 0) return events | EVENT_WASTED;
    for (const car of state.cars) {
      if (car.kind === 'traffic') events |= stepTrafficCar(car, dt);
      else if (car.kind === 'van') {
        // The armored van crawls its Ocean Drive loop until it is stopped.
        if (car.health > 0) {
          const want = angleTo(car.x, car.y, car.target.x, car.target.y);
          const turn = angleDiff(want, car.angle);
          // Turning around at the end of the road: slow down and turn
          // tightly, so the van stays on the road instead of arcing off
          // into the buildings (and dragging the chase after it).
          const turning = Math.abs(turn) > 0.6;
          const speed = turning ? 60 : 150;
          const turnRate = turning ? 2.5 : 1.2;
          car.angle += clamp(turn, -1, 1) * turnRate * dt;
          car.vx = Math.cos(car.angle) * speed;
          car.vy = Math.sin(car.angle) * speed;
          car.x += car.vx * dt;
          car.y += car.vy * dt;
          car.speed = speed;
          if (dist(car.x, car.y, car.target.x, car.target.y) < 80) {
            car.target = car.target.x > 2000 ? { x: 240, y: 2640 } : { x: 3600, y: 2640 };
          }
        }
      }
    }
    events |= collideCars(dt);
    // Wrecked traffic is towed away and replaced, so the streets stay alive.
    for (let i = state.cars.length - 1; i >= 0; i--) {
      const car = state.cars[i];
      if (car.kind === 'traffic' && car.health <= 0) {
        state.cars.splice(i, 1);
        makeTrafficCar();
      }
    }
    for (const ped of state.peds) events |= stepPed(ped, dt);
    for (const cop of [...state.cops]) events |= stepCop(cop, dt);
    for (const e of state.enemies) events |= stepEnemy(e, dt);
    events |= updateWanted(dt);
    events |= updateMission(dt, ambient);
    events |= updateFare();
    events |= updatePickups(dt);
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    // Despawn traffic and peds that wandered far from the player, respawn near.
    for (let i = state.cars.length - 1; i >= 0; i--) {
      const car = state.cars[i];
      if (car.kind !== 'traffic') continue;
      if (dist(car.x, car.y, state.player.x, state.player.y) > 1600) {
        state.cars.splice(i, 1);
        makeTrafficCar();
      }
    }
    return events;
  }

  reset(0);

  return {
    state,
    city,
    reset,
    retryMission,
    step,
    startMission,
    completeMission,
    failMission,
    resetPlayerToGarage,
    clearWanted,
    driveWaypoint,
    laneSteerTarget,
    say,
    atTarget,
    missionTarget,
  };
}
