// SOLMAR — every tuning number, colour and city constant in one place.
// The world is a fixed 3840x2880 top-down city; the camera follows the player,
// so no rule below depends on the screen size.

export const WORLD = { width: 3840, height: 2880 };

/** Roads: avenues run north-south, streets east-west, 480 apart, 96 wide. */
export const CITY = {
  roadSpacing: 480,
  roadHalf: 48,
  walkHalf: 74,
  avenueX: [240, 720, 1200, 1680, 2160, 2640, 3120, 3600],
  streetY: [240, 720, 1200, 1680, 2160, 2640],
  /** The beach strip along the south edge (walkable sand) and the pier. */
  beachTop: 2700,
  pier: { x: 3360, y: 1200, w: 420, h: 120 },
  /** The park block, between 4th and 5th avenue, 2nd and 3rd street. */
  park: { x: 1728, y: 768, w: 384, h: 384 },
  /** The garage (home base, repair + save) on 2nd avenue, 1st street. */
  garage: { x: 720, y: 240 },
};

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 260,
  sprintSpeed: 390,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
};

export const GUN = {
  damage: 34,
  range: 460,
  cooldown: 0.28,
  magSize: 12,
  reloadTime: 1.1,
  spread: 0.03,
};

export const CAR = {
  radius: 26,
  /** The circle used for car-vs-car bumps: smaller than the wall circle, so
   * two cars can pass on a 96-wide road without touching. */
  carRadius: 20,
  length: 54,
  width: 28,
  accel: 620,
  brake: 900,
  reverseAccel: 320,
  maxSpeed: 640,
  maxReverse: 220,
  turnRate: 3.0,
  drag: 0.55,
  grip: 6.0,
  health: 100,
  /** Damage a car takes per second while scraping a wall, and on a hard hit. */
  scrapeDamage: 2,
  crashDamage: 16,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 26;
export const PED = { radius: 12, walkSpeed: 70, runSpeed: 170 };

export const POLICE = {
  carRadius: 26,
  maxSpeed: 700,
  accel: 700,
  turnRate: 3.0,
  bustRange: 46,
  bustTime: 1.6,
  /** Cops per wanted level, index = stars. */
  countByStars: [0, 2, 3, 5, 7, 9],
  sightRange: 620,
  loseSightSeconds: 12,
  decaySeconds: 8,
};

/** Wanted stars 0..5. */
export const WANTED_MAX = 5;

export const ECONOMY = {
  startCash: 250,
  taxiFare: 120,
  debt: 8000,
};

/** Missions, in story order. Rewards are paid on completion. */
export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Fare',
    brief: 'Sal needs a package across town. Drive it to the blue marker before the clock runs out — and try not to scratch the paint.',
    reward: 400,
    timeLimit: 120,
  },
  {
    id: 'm2',
    name: 'Hot Wheels',
    brief: 'A customer wants a Comet GT. Steal the yellow sports car by the pier, then deliver it to the chop shop. The cops will not like it.',
    reward: 900,
    timeLimit: 150,
  },
  {
    id: 'm3',
    name: 'Payback',
    brief: "Sal's collectors are shaking down the pier. Go on foot, deal with all three of them, then get back to the garage in one piece.",
    reward: 1500,
    timeLimit: 0,
  },
  {
    id: 'm4',
    name: 'The Big Score',
    brief: 'Ram the armored van on Ocean Drive until it stops, grab the cash, then lose a three-star chase and bring it home. This clears the debt.',
    reward: 4000,
    timeLimit: 300,
  },
];

export const PALETTE = {
  backdrop: '#10141c',
  grass: '#33582e',
  asphalt: '#2e3138',
  asphaltLine: '#d8c56a',
  sidewalk: '#4a4a48',
  sand: '#c9a86a',
  water: '#1d5f7a',
  parkGrass: '#3d6b35',
  parkPath: '#8a7a5a',
  buildingRoof: ['#7a4a3a', '#4a5a7a', '#6a5a3a', '#5a6a4a', '#7a3a5a', '#3a6a6a'],
  buildingWall: '#2a2a30',
  player: '#ffd23f',
  playerCar: '#e8b73a',
  trafficCar: ['#c94f42', '#4f7ec9', '#7ec94f', '#c9c94f', '#8a6fc9', '#c9c9c9'],
  policeCar: '#2f6fd0',
  policeLightRed: '#ff3b30',
  policeLightBlue: '#3b82ff',
  ped: ['#e8e8e8', '#d08a4a', '#8ad0c9', '#c98ad0', '#a0c94f'],
  enemy: '#d03b2f',
  marker: '#38b6ff',
  markerRing: '#ffffff',
  cash: '#5ee06a',
  health: '#ff5a5a',
  panel: '#171c26',
  panelEdge: '#2e3648',
  text: '#eef1f5',
  muted: '#9aa3b2',
  gold: '#f2c94c',
  star: '#ffd23f',
  starEmpty: '#3a4152',
  minimapRoad: '#565b66',
  minimapBg: '#14181f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, missions done, best) is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar.save.v1';
/** Where the best cash haul is kept. */
export const BEST_KEY = 'solmar.best.v1';
