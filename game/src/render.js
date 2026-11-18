// Everything the player sees: the city from above, the people and cars in it,
// the mission marker, and the HUD (cash, health, wanted stars, minimap). It
// only reads state; it never changes it.
import { CAR, CITY, MISSIONS, PALETTE, PED, PLAYER, WORLD } from './config.js';

const TAU = Math.PI * 2;
const WANTED_MAX_STARS = 5;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** The camera follows the player and never shows outside the world. */
export function cameraFor(player, view) {
  const x = clamp(player.x - view.width / 2, 0, Math.max(0, WORLD.width - view.width));
  const y = clamp(player.y - view.height / 2, 0, Math.max(0, WORLD.height - view.height));
  return { x, y };
}

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = CAR.length;
  const h = CAR.width;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fill();
  // Cabin and windscreen.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  ctx.beginPath();
  ctx.roundRect(-w * 0.18, -h / 2 + 4, w * 0.34, h - 8, 4);
  ctx.fill();
  // Headlights (front) and taillights (rear).
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 6);
  ctx.fillRect(w / 2 - 3, h / 2 - 8, 3, 6);
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(-w / 2, -h / 2 + 2, 3, 6);
  ctx.fillRect(-w / 2, h / 2 - 8, 3, 6);
  if (car.kind === 'police') {
    // Light bar, flashing red/blue.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
    ctx.fillRect(-6, -h / 2 - 2, 12, 5);
    ctx.fillStyle = phase ? PALETTE.policeLightBlue : PALETTE.policeLightRed;
    ctx.fillRect(-6, h / 2 - 3, 12, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', 0, 3);
  }
  if (car.kind === 'van') {
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VAULT', 0, 3);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, radius, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    // Lying flat.
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, radius + 4, radius - 2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius + 4, radius - 3, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, radius, radius * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    // Facing: a small nose and shoulders.
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(radius * 0.7, 0, radius * 0.35, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawWorld(ctx, world, view, time) {
  const { state, city } = world;
  const cam = cameraFor(state.player, view);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // Ground: grass.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(cam.x - 4, cam.y - 4, view.width + 8, view.height + 8);

  // Beach and sea along the south edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(cam.x - 4, CITY.beachTop, view.width + 8, WORLD.height - CITY.beachTop);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(cam.x - 4, WORLD.height - 60, view.width + 8, 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cam.x - 4, WORLD.height - 58);
  ctx.lineTo(cam.x + view.width + 4, WORLD.height - 58);
  ctx.stroke();

  // Park.
  ctx.fillStyle = PALETTE.parkGrass;
  ctx.fillRect(CITY.park.x, CITY.park.y, CITY.park.w, CITY.park.h);

  // Roads: dark asphalt, then dashed centre lines.
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of CITY.avenueX) ctx.fillRect(ax - CITY.roadHalf, 0, CITY.roadHalf * 2, WORLD.height);
  for (const sy of CITY.streetY) ctx.fillRect(0, sy - CITY.roadHalf, WORLD.width, CITY.roadHalf * 2);
  ctx.strokeStyle = PALETTE.asphaltLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const ax of CITY.avenueX) {
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, WORLD.height);
  }
  for (const sy of CITY.streetY) {
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD.width, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Sidewalks: pale strips just outside the asphalt.
  ctx.strokeStyle = PALETTE.sidewalk;
  ctx.lineWidth = CITY.walkHalf - CITY.roadHalf;
  ctx.beginPath();
  for (const ax of CITY.avenueX) {
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, WORLD.height);
  }
  for (const sy of CITY.streetY) {
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD.width, sy);
  }
  ctx.stroke();

  // Pier.
  ctx.fillStyle = '#8a6b4a';
  ctx.fillRect(CITY.pier.x, CITY.pier.y, CITY.pier.w, CITY.pier.h);
  ctx.fillStyle = '#6e5238';
  for (let i = 0; i < 5; i++) ctx.fillRect(CITY.pier.x + 20 + i * 52, CITY.pier.y + 8, 6, CITY.pier.h - 16);

  // Garage (home base): a yard with a painted S.
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(CITY.garage.x - 130, CITY.garage.y - 90, 260, 180);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', CITY.garage.x, CITY.garage.y);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('MORENO GARAGE', CITY.garage.x, CITY.garage.y + 70);

  // Buildings with a roof, a shade edge and a few windows.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x, b.y, b.w, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const cols = Math.max(1, Math.floor(b.w / 46));
    const rows = Math.max(1, Math.floor(b.h / 46));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillRect(b.x + 12 + c * 46, b.y + 12 + r * 46, 18, 14);
      }
    }
  }

  // Palm trees.
  for (const t of city.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 3, t.y + 4, t.r + 2, t.r, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f7a3d';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6b4a2b';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3, 0, TAU);
    ctx.fill();
  }

  // Mission marker: a bouncing diamond over the target.
  const mission = state.mission;
  const target = mission ? mission.target : state.fare;
  if (target) {
    const bounce = Math.sin(time * 4) * 8;
    const pulse = 26 + Math.sin(time * 4) * 6;
    ctx.save();
    ctx.translate(target.x, target.y + bounce - 40);
    ctx.fillStyle = 'rgba(56,182,255,0.25)';
    ctx.beginPath();
    ctx.arc(0, 40 - bounce, pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE.marker;
    ctx.strokeStyle = PALETTE.markerRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Pickups.
  for (const pk of state.pickups) {
    if (!pk.active) continue;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    const bob = Math.sin(time * 3 + pk.x) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 14, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pk.kind === 'health' ? '#3ddc84' : pk.kind === 'ammo' ? '#ffd23f' : '#7ee787';
    ctx.beginPath();
    ctx.arc(0, bob, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'ammo' ? '•' : '$', 0, bob + 1);
    ctx.restore();
  }

  // Pedestrians.
  for (const ped of state.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, PED.radius, ped.down > 0);
  }

  // Collectors (mission 3).
  for (const e of state.enemies) {
    if (!e.alive) continue;
    drawPerson(ctx, e.x, e.y, e.angle, '#3b3b3b', 15, false);
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - 16, e.y - 26, 32, 5);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(e.x - 16, e.y - 26, 32 * (e.health / 60), 5);
  }

  // Cars.
  for (const car of state.cars) {
    if (car.health <= 0) {
      // Wreck: smoke and a darkened body.
      drawCar(ctx, { ...car, color: '#2c2c2c' }, time);
      const puff = Math.sin(time * 2 + car.x) * 6;
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(car.x + puff, car.y - 12, 8, 0, TAU);
      ctx.fill();
      continue;
    }
    drawCar(ctx, car, time);
  }

  // Cops on foot.
  for (const cop of state.cops) {
    if (cop.inCar) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, PALETTE.policeCar, 13, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', cop.x, cop.y - 16);
  }

  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The player: a bright jacket so they are easy to find in a crowd.
  const p = state.player;
  if (!p.inCar) {
    drawPerson(ctx, p.x, p.y, p.angle, PALETTE.player, PLAYER.radius, false);
    // Pistol in hand, pointing where the player aims.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(PLAYER.radius - 2, -2, 12, 4);
    ctx.restore();
  }

  ctx.restore();
}

function drawMinimap(ctx, world, view) {
  const { state, city } = world;
  const w = 190;
  const h = 143;
  const x = view.width - w - 14;
  const y = view.height - h - 14;
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.78)';
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#2e5d34';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e8d27a';
  ctx.fillRect(x, y + CITY.beachTop * sy, w, h - CITY.beachTop * sy);
  ctx.fillStyle = '#3a3f4a';
  for (const ax of CITY.avenueX) ctx.fillRect(x + ax * sx - 1, y, 2, h);
  for (const street of CITY.streetY) ctx.fillRect(x, y + street * sy - 1, w, 2);
  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, TAU);
    ctx.fill();
  };
  const target = state.mission ? state.mission.target : state.fare;
  if (target) dot(target.x, target.y, '#ffd23f', 4);
  for (const cop of state.cops) dot(cop.x, cop.y, '#2e6bff', 2.5);
  for (const e of state.enemies) if (e.alive) dot(e.x, e.y, '#ff5a5a', 2.5);
  if (state.van) dot(state.van.x, state.van.y, '#ff8a3b', 3);
  // The player is a white arrow pointing where they face.
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function drawHud(ctx, world, view) {
  const { state } = world;
  const p = state.player;
  ctx.save();
  // Cash.
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.beginPath();
  ctx.roundRect(14, 14, 190, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${state.cash.toLocaleString('en-US')}`, 28, 37);
  // Health bar.
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.beginPath();
  ctx.roundRect(14, 66, 190, 22, 8);
  ctx.fill();
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath();
  ctx.roundRect(20, 71, 178 * (p.health / PLAYER.health), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HEALTH', 26, 77);
  // Ammo (on foot) or speed (in a car).
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.beginPath();
  ctx.roundRect(14, 96, 190, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  if (p.inCar) {
    const kmh = Math.round((p.inCar.speed / 10) * 3.6);
    ctx.fillText(`${kmh} km/h`, 26, 111);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`CAR ${Math.max(0, Math.round(p.inCar.health))}`, 120, 111);
  } else {
    ctx.fillText(p.reload > 0 ? 'RELOADING…' : `AMMO ${p.ammo} / 24`, 26, 111);
  }
  // Wanted stars, top centre.
  const starW = 30;
  const totalW = WANTED_MAX_STARS * starW;
  const sx = (view.width - totalW) / 2;
  for (let i = 0; i < WANTED_MAX_STARS; i++) {
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = i < state.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', sx + i * starW + starW / 2, 34);
  }
  if (state.wanted > 0) {
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WANTED', view.width / 2, 52);
  }
  // Mission panel, top left under the bars.
  const mission = state.mission;
  if (mission) {
    const def = MISSIONS[mission.index];
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.beginPath();
    ctx.roundRect(14, 136, 340, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${mission.index + 1}. ${def.name}  —  $${def.reward}`, 26, 156);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(mission.targetLabel, 26, 178);
    if (mission.timer > 0) {
      ctx.fillStyle = mission.timer < 15 ? '#ff5a5a' : '#7ee787';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${Math.ceil(mission.timer)}s`, 26, 196);
    }
  } else if (state.storyDone) {
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.beginPath();
    ctx.roundRect(14, 136, 340, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#7ee787';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Free roam — follow the marker for a fare', 26, 161);
  }
  // Message banner, centre.
  if (state.message) {
    ctx.font = 'bold 17px sans-serif';
    const w = ctx.measureText(state.message).width + 32;
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.beginPath();
    ctx.roundRect((view.width - w) / 2, view.height - 86, w, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, view.width / 2, view.height - 68);
  }
  // Controls hint, bottom left.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('WASD move · Shift sprint · Mouse aim · Click shoot · F punch · E enter/exit car · R reload · Space handbrake · P pause · M mute', 14, view.height - 14);
  drawMinimap(ctx, world, view);
  ctx.restore();
}
