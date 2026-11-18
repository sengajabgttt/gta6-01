// The city of Solmar, generated once from the seed: a grid of avenues and
// streets, buildings filling the blocks, a park, a beach along the south edge
// and a pier on the east side. Nothing here draws or moves; it answers where
// things are, what is road, and what blocks a circle.
import { CITY, PALETTE, WORLD } from './config.js';
import { randomPick, randomRange } from './random.js';

/** A building: a solid rectangle with a roof colour and a height for its shade. */
function makeBuildings(random) {
  const list = [];
  const { avenueX, streetY, roadHalf } = CITY;
  const margin = roadHalf + 26;
  for (let a = 0; a < avenueX.length - 1; a++) {
    for (let s = 0; s < streetY.length - 1; s++) {
      const x0 = avenueX[a] + margin;
      const x1 = avenueX[a + 1] - margin;
      const y0 = streetY[s] + margin;
      const y1 = streetY[s + 1] - margin;
      // The park block holds trees, not buildings.
      if (x0 >= CITY.park.x && y0 >= CITY.park.y && x1 <= CITY.park.x + CITY.park.w && y1 <= CITY.park.y + CITY.park.h) continue;
      const bw = x1 - x0;
      const bh = y1 - y0;
      const split = random() < 0.55;
      if (split && bw > 220 && bh > 220) {
        // Two buildings side by side, with a gap between them.
        const cut = x0 + bw * (0.4 + random() * 0.2);
        list.push({ x: x0, y: y0, w: cut - x0 - 14, h: bh, color: randomPick(random, PALETTE.buildingRoof), height: 14 + random() * 26 });
        list.push({ x: cut + 14, y: y0, w: x1 - cut - 14, h: bh, color: randomPick(random, PALETTE.buildingRoof), height: 14 + random() * 26 });
      } else {
        list.push({ x: x0, y: y0, w: bw, h: bh, color: randomPick(random, PALETTE.buildingRoof), height: 14 + random() * 26 });
      }
    }
  }
  return list;
}

/** A few palm trees in the park and along the beach, for shade and scenery. */
function makeTrees(random) {
  const trees = [];
  for (let i = 0; i < 26; i++) {
    trees.push({
      x: CITY.park.x + 24 + random() * (CITY.park.w - 48),
      y: CITY.park.y + 24 + random() * (CITY.park.h - 48),
      r: 9 + random() * 5,
    });
  }
  for (let i = 0; i < 18; i++) {
    trees.push({ x: 80 + random() * (WORLD.width - 160), y: CITY.beachTop + 20 + random() * 90, r: 8 + random() * 5 });
  }
  return trees;
}

export function createCity(random) {
  const buildings = makeBuildings(random);
  const trees = makeTrees(random);
  // A parked car the player can steal in mission 2, on the street by the pier.
  const stealCarSpot = { x: CITY.pier.x + 150, y: CITY.pier.y + 20, angle: 0 };
  // The chop shop, far north-west; the taxi pickup and the bank sit on fixed roads.
  const chopShop = { x: 240, y: 720 };
  const taxiPickup = { x: 3120, y: 720 };
  const bankSpot = { x: 2160, y: 2160 };

  function onRoad(x, y, extra = 0) {
    const half = CITY.roadHalf + extra;
    for (const ax of CITY.avenueX) if (Math.abs(x - ax) <= half && y >= 0 && y <= WORLD.height) return true;
    for (const sy of CITY.streetY) if (Math.abs(y - sy) <= half && x >= 0 && x <= WORLD.width) return true;
    return false;
  }

  function onSidewalk(x, y) {
    return !onRoad(x, y) && onRoad(x, y, CITY.walkHalf - CITY.roadHalf);
  }

  function inBeach(x, y) {
    return y >= CITY.beachTop && y <= WORLD.height && x >= 0 && x <= WORLD.width;
  }

  function inPark(x, y) {
    const p = CITY.park;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  function inPier(x, y) {
    const p = CITY.pier;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  /** The building at (x, y), or null when the point is open ground. */
  function buildingAt(x, y) {
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  /** Whether a circle of radius r at (x, y) may stand there (not in a wall, not in the water). */
  function circleFits(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return false;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return false;
    }
    return true;
  }

  /**
   * Push a circle out of every building it overlaps, and clamp it inside the
   * world. Returns the distance pushed (0 when nothing was in the way).
   */
  function collideCircle(pos, r) {
    let pushed = 0;
    for (const b of buildings) {
      const cx = Math.min(Math.max(pos.x, b.x), b.x + b.w);
      const cy = Math.min(Math.max(pos.y, b.y), b.y + b.h);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) {
        // Dead centre: push out along the shortest side.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
        pushed += r;
      } else {
        const d = Math.sqrt(d2);
        const push = r - d;
        pos.x += (dx / d) * push;
        pos.y += (dy / d) * push;
        pushed += push;
      }
    }
    const ox = pos.x;
    const oy = pos.y;
    pos.x = Math.min(Math.max(pos.x, r), WORLD.width - r);
    pos.y = Math.min(Math.max(pos.y, r), WORLD.height - r);
    pushed += Math.abs(pos.x - ox) + Math.abs(pos.y - oy);
    return pushed;
  }

  /** A random point on a road (an intersection, or anywhere along one). */
  function randomRoadPoint(randomFn, onIntersection = false) {
    if (onIntersection) {
      return {
        x: randomPick(randomFn, CITY.avenueX),
        y: randomPick(randomFn, CITY.streetY),
      };
    }
    if (randomFn() < 0.5) {
      return { x: randomPick(randomFn, CITY.avenueX), y: randomRange(randomFn, 120, WORLD.height - 120) };
    }
    return { x: randomRange(randomFn, 120, WORLD.width - 120), y: randomPick(randomFn, CITY.streetY) };
  }

  /** The nearest point on the road network to (x, y). */
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const ax of CITY.avenueX) {
      const d = Math.abs(x - ax);
      if (d < bestD) {
        bestD = d;
        best = { x: ax, y: Math.min(Math.max(y, 0), WORLD.height) };
      }
    }
    for (const sy of CITY.streetY) {
      const d = Math.abs(y - sy);
      if (d < bestD) {
        bestD = d;
        best = { x: Math.min(Math.max(x, 0), WORLD.width), y: sy };
      }
    }
    return best;
  }

  return {
    buildings,
    trees,
    stealCarSpot,
    chopShop,
    taxiPickup,
    bankSpot,
    onRoad,
    onSidewalk,
    inBeach,
    inPark,
    inPier,
    buildingAt,
    circleFits,
    collideCircle,
    randomRoadPoint,
    nearestRoadPoint,
  };
}
