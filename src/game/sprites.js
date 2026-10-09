// Animated character art: enemies (walk cycles, faces, weapons), the hero, and allied soldiers.
// Everything is drawn from a small animation state `st` = { ph, t, moving, hit, blink, attack, dead }:
//   ph      walk phase in radians (advances with distance travelled)
//   t       seconds, used for idle motion and flapping
//   hit     0..1 flinch after taking damage
//   attack  true while engaged in melee (weapons swing faster)
import { INK, TAU, roundRect, star, shade, limb, blob, pivot } from './draw-util.js';

const GEAR_WEAPONS = ['club', 'sword', 'axe', 'halberd', 'flail', 'glaive'];
const HELM = ['#8a5a32', '#9aa1b0', '#7d8394', '#c9a24b', '#5b5f6b', '#2f3240'];
const SKIN = '#f2d1a8';
const BOOT = '#3a2a22';

export function drawEnemySprite(ctx, e, s, col, st) {
  const type = e.boss ? 'boss_' + e.boss : e.type;
  switch (type) {
    case 'wyvern': return drawWyvern(ctx, s, col, st, false);
    case 'boss_dragon': return drawWyvern(ctx, s, col, st, true);
    case 'cavalry': return drawCavalry(ctx, s, col, st, e.gear);
    case 'ram': return drawRam(ctx, s, col, st);
    case 'brood': return drawSpider(ctx, s, col, st, true);
    case 'spider': return drawSpider(ctx, s, col, st, false);
    case 'golem': return drawGolem(ctx, s, col, st, false);
    case 'boss_titan': return drawGolem(ctx, s, col, st, true);
    default: return drawHumanoid(ctx, s, col, e, type, st);
  }
}

// ---------------------------------------------------------------------------------------------
// Humanoids: grunt, runner, shieldbearer, archer, healer, sapper, warchief, warlock + warlord / lich bosses
// ---------------------------------------------------------------------------------------------
function face(ctx, s, hx, hy, st, angry = 1, ol = 1.5) {
  const er = Math.max(ol * 0.75, s * 0.075);
  if (st.dead != null || st.hit > 0.35) {            // squint: X eyes
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.8); ctx.lineCap = 'round';
    for (const ex of [hx + s * 0.06, hx + s * 0.23]) { ctx.beginPath(); ctx.moveTo(ex - er, hy - er); ctx.lineTo(ex + er, hy + er); ctx.moveTo(ex + er, hy - er); ctx.lineTo(ex - er, hy + er); ctx.stroke(); }
    ctx.lineCap = 'butt';
  } else if (st.blink) {
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.8);
    for (const ex of [hx + s * 0.06, hx + s * 0.23]) { ctx.beginPath(); ctx.moveTo(ex - er, hy); ctx.lineTo(ex + er, hy); ctx.stroke(); }
  } else {
    for (const ex of [hx + s * 0.06, hx + s * 0.23]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, hy, er * 1.25, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + er * 0.35, hy + er * 0.1, er * 0.7, 0, TAU); ctx.fill();
    }
  }
  if (angry) {                                        // brows
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.1, ol * 0.9); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - s * 0.02, hy - er * 2.2 - s * 0.03 * angry); ctx.lineTo(hx + s * 0.13, hy - er * 1.5); ctx.moveTo(hx + s * 0.16, hy - er * 1.5); ctx.lineTo(hx + s * 0.31, hy - er * 2.3 - s * 0.03 * angry); ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

function drawHumanoid(ctx, s, col, e, type, st) {
  const tier = Math.min(5, e.gear || 0);
  const boss = type.startsWith('boss_');
  const robe = type === 'warlock' || type === 'boss_lich';
  const ol = ctx.lineWidth;
  const mv = st.moving ? 1 : 0;
  const sw = Math.sin(st.ph) * mv, cw = Math.cos(st.ph) * mv;
  const bounce = (Math.abs(Math.sin(st.ph)) * 0.09 * mv + Math.sin(st.t * 2.4) * 0.014 * (1 - mv)) * s;
  const lean = (type === 'runner' ? 0.2 : 0.05 * sw) - st.hit * 0.2;
  const dark = shade(col, -0.42);
  const hover = robe ? s * 0.08 + Math.sin(st.t * 2.2) * s * 0.05 : 0;

  // behind the body: cape, banner pole, quiver
  if (type === 'boss_warlord') {
    ctx.fillStyle = '#7a1624'; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.55);
    ctx.quadraticCurveTo(-s * 0.9 - sw * s * 0.1, -s * 0.2, -s * 0.8 - cw * s * 0.1, s * 0.3); ctx.lineTo(-s * 0.1, s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (type === 'warchief') {
    ctx.strokeStyle = INK; ctx.lineWidth = ol * 1.6; ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.2); ctx.lineTo(-s * 0.45, -s * 1.6); ctx.stroke();
    ctx.lineWidth = ol; const fl = Math.sin(st.t * 6) * s * 0.08;
    ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 1.6); ctx.quadraticCurveTo(-s * 0.8, -s * 1.7 + fl, -s * 1.15, -s * 1.5 + fl); ctx.lineTo(-s * 0.45, -s * 1.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(-s * 0.75, -s * 1.47 + fl * 0.6, s * 0.09, 0, TAU); ctx.fill();
  }
  if (type === 'archer') {
    ctx.save(); ctx.translate(-s * 0.3, -s * 0.5 - bounce); ctx.rotate(-0.5);
    ctx.fillStyle = '#7a5130'; roundRect(ctx, -s * 0.1, -s * 0.1, s * 0.22, s * 0.5, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d9dde6'; ctx.lineWidth = ol * 0.9;
    for (const dx of [-0.04, 0.03, 0.1]) { ctx.beginPath(); ctx.moveTo(dx * s, -s * 0.1); ctx.lineTo(dx * s, -s * 0.24); ctx.stroke(); }
    ctx.restore();
  }

  // legs (or a floating robe hem)
  if (!robe) {
    for (const [side, off] of [[-1, 0], [1, Math.PI]]) {
      const a = Math.sin(st.ph + off) * mv, lift = Math.max(0, Math.cos(st.ph + off)) * mv;
      const hx = side * 0.2 * s, hy = 0.05 * s - bounce;
      const fx = hx + a * 0.32 * s, fy = 0.34 * s - lift * 0.13 * s;
      limb(ctx, hx, hy, fx, fy, 0.2 * s, dark, ol);
      blob(ctx, fx + s * 0.07, fy, s * 0.16, s * 0.09, BOOT);
    }
  }

  ctx.save();
  ctx.translate(0, -bounce - hover);
  pivot(ctx, 0, s * 0.1, lean);

  // far arm (swings opposite to the legs)
  const farHx = -s * 0.5 - sw * s * 0.14, farHy = -s * 0.02 + cw * s * 0.1;
  if (type !== 'shield') { limb(ctx, -s * 0.36, -s * 0.34, farHx, farHy, 0.17 * s, shade(col, -0.25), ol); blob(ctx, farHx, farHy, s * 0.09, s * 0.09, SKIN); }

  // torso
  if (robe) {
    const hem = Math.sin(st.t * 3) * s * 0.04;
    ctx.fillStyle = type === 'boss_lich' ? '#2c4d66' : '#3a2160';
    ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.55); ctx.quadraticCurveTo(-s * 0.55, -s * 0.1, -s * 0.62, s * 0.3 + hem);
    ctx.lineTo(-s * 0.2, s * 0.22 - hem); ctx.lineTo(s * 0.1, s * 0.32 + hem); ctx.lineTo(s * 0.62, s * 0.26 - hem);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.1, s * 0.4, -s * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-s * 0.45, -s * 0.12, s * 0.9, s * 0.1);
    ctx.strokeStyle = type === 'boss_lich' ? '#9fe7ff' : '#c79bff'; ctx.lineWidth = ol * 0.7;
    ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.5); ctx.lineTo(-s * 0.2, s * 0.2); ctx.moveTo(s * 0.25, -s * 0.5); ctx.lineTo(s * 0.25, s * 0.2); ctx.stroke();
    ctx.lineWidth = ol;
  } else {
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.52, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = shade(col, 0.35); ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.38, s * 0.2, s * 0.13, -0.5, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = shade(col, -0.38); ctx.save(); ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.52, s * 0.5, 0, 0, TAU); ctx.clip(); ctx.fillRect(-s * 0.6, -s * 0.06, s * 1.2, s * 0.14); ctx.restore();
    ctx.fillStyle = '#f2b33d'; ctx.fillRect(-s * 0.06, -s * 0.06, s * 0.12, s * 0.14);       // buckle
    if (type === 'healer') { ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.46, -s * 0.5, s * 0.92, s * 0.35); ctx.fillStyle = '#d9473b'; ctx.fillRect(-s * 0.09, -s * 0.5, s * 0.18, s * 0.5); ctx.fillRect(-s * 0.22, -s * 0.36, s * 0.44, s * 0.18); }
    if (type === 'sapper') { ctx.fillStyle = '#5b5f6b'; ctx.fillRect(-s * 0.35, -s * 0.5, s * 0.7, s * 0.12); }
    if (tier >= 3 && !boss) { ctx.fillStyle = HELM[tier]; ctx.beginPath(); ctx.ellipse(s * 0.35, -s * 0.38, s * 0.2, s * 0.14, 0.3, 0, TAU); ctx.fill(); ctx.stroke(); }   // pauldron
  }

  // head
  const hx = s * 0.05, hy = -s * 0.82 + (mv ? sw * s * 0.02 : 0), hr = s * 0.36;
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill(); ctx.stroke();
  if (type === 'warlock' || type === 'boss_lich') {
    ctx.fillStyle = type === 'boss_lich' ? '#dfe9ef' : '#a89bb8'; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill(); ctx.stroke();   // pale / skull
  }
  face(ctx, s, hx, hy + s * 0.03, st, type === 'healer' ? 0 : 1, ol);
  if (type !== 'healer') {          // mouth
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.7); ctx.beginPath();
    const mo = st.attack ? s * 0.07 : 0;
    ctx.moveTo(hx + s * 0.08, hy + hr * 0.62); ctx.lineTo(hx + s * 0.22, hy + hr * 0.62 + mo); ctx.stroke();
  }
  // headgear
  if (type === 'healer') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy - s * 0.06, hr * 1.04, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b'; ctx.fillRect(hx - s * 0.04, hy - hr * 1.0, s * 0.08, s * 0.2);
  } else if (robe) {
    ctx.fillStyle = type === 'boss_lich' ? '#2c4d66' : '#3a2160';
    ctx.beginPath(); ctx.moveTo(hx - hr * 1.1, hy - hr * 0.35); ctx.quadraticCurveTo(hx - hr * 0.2, hy - hr * 0.9, hx + hr * 0.1 - Math.sin(st.t * 3) * s * 0.06, hy - s * 0.95); ctx.quadraticCurveTo(hx + hr * 0.7, hy - hr * 0.8, hx + hr * 1.1, hy - hr * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2b33d'; star(ctx, hx - hr * 0.15, hy - hr * 1.05, s * 0.07);
  } else if (type === 'runner') {
    ctx.fillStyle = '#d4af6a'; ctx.beginPath(); ctx.arc(hx, hy - s * 0.04, hr * 1.02, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b'; const f2 = Math.sin(st.t * 14) * s * 0.07;   // headband tails
    ctx.beginPath(); ctx.moveTo(hx - hr, hy - s * 0.12); ctx.lineTo(hx - hr - s * 0.38, hy - s * 0.2 + f2); ctx.lineTo(hx - hr - s * 0.3, hy - s * 0.02 + f2 * 0.6); ctx.lineTo(hx - hr, hy - s * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (type === 'sapper') {
    ctx.fillStyle = '#5b5f6b'; ctx.beginPath(); ctx.arc(hx, hy - s * 0.04, hr * 1.06, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(hx + s * 0.18, hy - hr * 0.95, s * 0.07, 0, TAU); ctx.fill(); ctx.stroke();   // lamp
  } else {
    ctx.fillStyle = HELM[tier]; ctx.beginPath(); ctx.arc(hx, hy - s * 0.05, hr * 1.06, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (tier >= 2) { ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(hx, hy - hr * 1.2); ctx.quadraticCurveTo(hx - s * 0.2, hy - hr * 1.7 - sw * s * 0.05, hx - s * 0.3, hy - hr * 1.25 + cw * s * 0.04); ctx.lineTo(hx - s * 0.02, hy - hr * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (tier >= 4) { ctx.fillStyle = HELM[tier]; ctx.beginPath(); ctx.moveTo(hx + hr * 0.9, hy - hr * 0.4); ctx.lineTo(hx + hr * 1.35, hy - hr * 0.1); ctx.lineTo(hx + hr * 0.9, hy + hr * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke(); }   // nose guard
  }
  if (type === 'boss_warlord') {
    ctx.fillStyle = '#f2b33d'; ctx.beginPath();
    ctx.moveTo(hx - hr * 0.8, hy - hr * 0.7); ctx.lineTo(hx - hr * 0.7, hy - hr * 1.5); ctx.lineTo(hx - hr * 0.25, hy - hr * 1.0); ctx.lineTo(hx + hr * 0.05, hy - hr * 1.65); ctx.lineTo(hx + hr * 0.35, hy - hr * 1.0); ctx.lineTo(hx + hr * 0.8, hy - hr * 1.5); ctx.lineTo(hx + hr * 0.9, hy - hr * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // near arm + held item
  const atk = st.attack ? Math.sin(st.t * 9) : 0;
  const handX = s * 0.52 + atk * s * 0.1, handY = -s * 0.22 - Math.max(0, -atk) * s * 0.22 + sw * s * 0.03;
  if (type === 'shield') {
    limb(ctx, s * 0.3, -s * 0.34, handX, handY, 0.17 * s, shade(col, -0.2), ol);
    ctx.fillStyle = '#aab0bd'; ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.78); ctx.lineTo(s * 0.9, -s * 0.78); ctx.lineTo(s * 0.9, -s * 0.12); ctx.quadraticCurveTo(s * 0.62, s * 0.36, s * 0.34, -s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b'; ctx.fillRect(s * 0.57, -s * 0.7, s * 0.1, s * 0.62); ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.38, s * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
    limb(ctx, -s * 0.36, -s * 0.34, farHx, farHy, 0.17 * s, shade(col, -0.25), ol); blob(ctx, farHx, farHy, s * 0.09, s * 0.09, SKIN);
  } else {
    limb(ctx, s * 0.36, -s * 0.34, handX, handY, 0.17 * s, shade(col, -0.1), ol);
    if (type === 'archer') {
      ctx.save(); ctx.translate(handX, handY);
      ctx.strokeStyle = '#6b4220'; ctx.lineWidth = ol * 2; ctx.beginPath(); ctx.arc(-s * 0.1, 0, s * 0.46, -1.15, 1.15); ctx.stroke();
      const pull = st.attack ? 0.5 + 0.5 * Math.sin(st.t * 6) : 0.15;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.6); ctx.beginPath();
      ctx.moveTo(-s * 0.1 + Math.cos(1.15) * s * 0.46, -Math.sin(1.15) * s * 0.46); ctx.lineTo(-s * 0.1 - pull * s * 0.2, 0); ctx.lineTo(-s * 0.1 + Math.cos(1.15) * s * 0.46, Math.sin(1.15) * s * 0.46); ctx.stroke();
      ctx.restore();
    } else if (type === 'healer') {
      ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = ol * 1.8; ctx.beginPath(); ctx.moveTo(handX, handY + s * 0.45); ctx.lineTo(handX, handY - s * 0.65); ctx.stroke();
      const g = 0.5 + 0.5 * Math.sin(st.t * 4);
      ctx.fillStyle = `rgba(127,224,138,${0.35 + 0.3 * g})`; ctx.beginPath(); ctx.arc(handX, handY - s * 0.72, s * (0.2 + 0.05 * g), 0, TAU); ctx.fill();
      ctx.fillStyle = '#7fe08a'; ctx.beginPath(); ctx.arc(handX, handY - s * 0.72, s * 0.1, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (robe) {
      ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = ol * 1.8; ctx.beginPath(); ctx.moveTo(handX, handY + s * 0.5); ctx.lineTo(handX, handY - s * 0.62); ctx.stroke();
      const g = 0.5 + 0.5 * Math.sin(st.t * 5);
      const oc = type === 'boss_lich' ? '159,231,255' : '199,155,255';
      ctx.fillStyle = `rgba(${oc},${0.3 + 0.35 * g})`; ctx.beginPath(); ctx.arc(handX, handY - s * 0.72, s * (0.22 + 0.06 * g), 0, TAU); ctx.fill();
      ctx.fillStyle = `rgb(${oc})`; ctx.beginPath(); ctx.arc(handX, handY - s * 0.72, s * 0.11, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (type === 'sapper') {
      blob(ctx, handX + s * 0.04, handY - s * 0.12, s * 0.27, s * 0.27, '#2d2f36');
      const sp = (Math.sin(st.t * 30) + 1) / 2;
      ctx.strokeStyle = '#d6c28a'; ctx.lineWidth = ol * 0.9; ctx.beginPath(); ctx.moveTo(handX + s * 0.1, handY - s * 0.36); ctx.quadraticCurveTo(handX + s * 0.22, handY - s * 0.6, handX + s * 0.08, handY - s * 0.68); ctx.stroke();
      ctx.fillStyle = sp > 0.4 ? '#ffd25e' : '#ff7a3d'; star(ctx, handX + s * 0.08, handY - s * 0.7, s * (0.1 + 0.05 * sp));
    } else {
      // melee weapon, swinging while walking and chopping while fighting
      const ang = -0.55 + sw * 0.18 + atk * 0.9;
      drawWeapon(ctx, s, tier, boss, handX, handY, ang, ol);
    }
    blob(ctx, handX, handY, s * 0.1, s * 0.1, SKIN);
  }
  ctx.restore();
}

function drawWeapon(ctx, s, tier, big, x, y, ang, ol) {
  const k = big ? 1.3 : 1;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const len = [0.7, 0.8, 0.8, 1.2, 0.9, 1.2][tier] * s * k;
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.13 * k + ol; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s * 0.12); ctx.lineTo(0, -len); ctx.stroke();
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = s * 0.13 * k; ctx.beginPath(); ctx.moveTo(0, s * 0.12); ctx.lineTo(0, -len); ctx.stroke();
  ctx.lineCap = 'butt'; ctx.lineWidth = ol * 0.9; ctx.strokeStyle = INK;
  ctx.fillStyle = tier === 5 ? '#b79bff' : '#e3e7ee';
  switch (GEAR_WEAPONS[tier]) {
    case 'club': ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.ellipse(0, -len, s * 0.17 * k, s * 0.26 * k, 0, 0, TAU); ctx.fill(); ctx.stroke(); break;
    case 'sword': ctx.beginPath(); ctx.moveTo(-s * 0.08, -len * 0.45); ctx.lineTo(0, -len * 1.4); ctx.lineTo(s * 0.08, -len * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#c9a24b'; ctx.fillRect(-s * 0.16, -len * 0.5, s * 0.32, s * 0.07); break;
    case 'axe': ctx.beginPath(); ctx.moveTo(0, -len * 1.05); ctx.quadraticCurveTo(s * 0.5 * k, -len - s * 0.1, s * 0.32 * k, -len + s * 0.4); ctx.lineTo(0, -len * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'halberd': ctx.beginPath(); ctx.moveTo(0, -len - s * 0.32); ctx.lineTo(s * 0.3, -len + s * 0.05); ctx.lineTo(0, -len + s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -len - s * 0.35); ctx.lineTo(-s * 0.06, -len - s * 0.1); ctx.lineTo(s * 0.06, -len - s * 0.1); ctx.fill(); break;
    case 'flail': ctx.strokeStyle = '#7d8394'; ctx.beginPath(); ctx.moveTo(0, -len); ctx.quadraticCurveTo(s * 0.2, -len - s * 0.3, s * 0.34, -len - s * 0.12); ctx.stroke(); ctx.fillStyle = '#5b5f6b'; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(s * 0.36, -len - s * 0.1, s * 0.18 * k, 0, TAU); ctx.fill(); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.moveTo(0, -len); ctx.quadraticCurveTo(s * 0.45, -len - s * 0.3, s * 0.18, -len - s * 0.6); ctx.lineTo(0, -len - s * 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(183,155,255,0.5)'; ctx.beginPath(); ctx.arc(s * 0.1, -len - s * 0.3, s * 0.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Wyvern / Ember Dragon
// ---------------------------------------------------------------------------------------------
function drawWyvern(ctx, s, col, st, boss) {
  const ol = ctx.lineWidth;
  const rate = boss ? 4.5 : 10;
  const flap = Math.sin(st.t * rate);
  const dark = shade(col, -0.25), light = shade(col, 0.3);
  const tail = Math.sin(st.t * 3.5) * s * 0.25;
  // tail
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.22 + ol * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.15); ctx.quadraticCurveTo(-s * 0.85, s * 0.05 + tail, -s * 1.15, -s * 0.3 + tail * 1.2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = s * 0.22; ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.15); ctx.quadraticCurveTo(-s * 0.85, s * 0.05 + tail, -s * 1.15, -s * 0.3 + tail * 1.2); ctx.stroke();
  ctx.lineCap = 'butt'; ctx.lineWidth = ol;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-s * 1.15, -s * 0.3 + tail * 1.2); ctx.lineTo(-s * 1.4, -s * 0.5 + tail * 1.2); ctx.lineTo(-s * 1.3, -s * 0.12 + tail * 1.2); ctx.closePath(); ctx.fill();
  // wings (mirrored pair, flapping together)
  for (const side of [-1, 1]) {
    const tipY = -s * (0.95 + flap * 0.4), tipX = side * s * 1.3;
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(side * s * 0.1, -s * 0.35);
    ctx.lineTo(tipX, tipY);
    ctx.quadraticCurveTo(side * s * 1.0, tipY * 0.45 - s * 0.05, side * s * 0.95, -s * 0.12 + flap * s * 0.05);
    ctx.quadraticCurveTo(side * s * 0.7, -s * 0.3, side * s * 0.62, -s * 0.05);
    ctx.quadraticCurveTo(side * s * 0.4, -s * 0.22, side * s * 0.3, -s * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = ol * 0.7;
    ctx.beginPath(); ctx.moveTo(side * s * 0.1, -s * 0.35); ctx.lineTo(side * s * 0.95, -s * 0.12 + flap * s * 0.05); ctx.moveTo(side * s * 0.1, -s * 0.35); ctx.lineTo(side * s * 0.62, -s * 0.05); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = ol;
  }
  // body, belly, spikes
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.55, s * 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.08, s * 0.4, s * 0.17, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = dark;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-s * (0.3 - i * 0.22), -s * 0.54); ctx.lineTo(-s * (0.2 - i * 0.22), -s * 0.74); ctx.lineTo(-s * (0.1 - i * 0.22), -s * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // neck + head
  const nod = Math.sin(st.t * 2.6) * s * 0.04;
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(s * 0.52, -s * 0.5 + nod, s * 0.3, s * 0.23, -0.35, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.68 + nod); ctx.lineTo(s * 0.32, -s * 0.95 + nod); ctx.lineTo(s * 0.58, -s * 0.72 + nod); ctx.closePath(); ctx.fill(); ctx.stroke();   // horn
  ctx.fillStyle = boss ? '#ffdf6b' : '#fff6c2'; ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.56 + nod, Math.max(ol, s * 0.075), 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.64, -s * 0.56 + nod, Math.max(ol * 0.5, s * 0.035), 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = ol * 0.8; ctx.beginPath(); ctx.moveTo(s * 0.62, -s * 0.4 + nod); ctx.lineTo(s * 0.8, -s * 0.44 + nod); ctx.stroke();
  if (boss) {
    const g = 0.5 + 0.5 * Math.sin(st.t * 9);
    ctx.fillStyle = `rgba(255,170,60,${0.35 + 0.35 * g})`; ctx.beginPath(); ctx.arc(s * 0.95, -s * 0.46 + nod, s * (0.16 + 0.07 * g), 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,230,140,${0.6 + 0.3 * g})`; ctx.beginPath(); ctx.arc(s * 0.92, -s * 0.46 + nod, s * 0.08, 0, TAU); ctx.fill();
  }
  // tucked legs
  limb(ctx, -s * 0.05, -s * 0.02, -s * 0.12 + flap * s * 0.03, s * 0.25, s * 0.1, dark, ol); limb(ctx, s * 0.2, -s * 0.02, s * 0.25 - flap * s * 0.03, s * 0.25, s * 0.1, dark, ol);
}

// ---------------------------------------------------------------------------------------------
// Cavalry: four-leg gallop
// ---------------------------------------------------------------------------------------------
function drawCavalry(ctx, s, col, st, gear) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0.2;
  const horse = '#8a5a32', dark = shade(horse, -0.4);
  const bounce = Math.abs(Math.sin(st.ph)) * 0.1 * s * mv;
  const legs = [[-0.5, 0], [-0.32, 0.5], [0.34, 0.25], [0.52, 0.75]];
  for (const [lx, off] of legs) {
    const a = Math.sin(st.ph + off * TAU) * mv, lift = Math.max(0, Math.cos(st.ph + off * TAU)) * mv;
    const hx = lx * s, hy = -s * 0.02 - bounce;
    const fx = hx + a * 0.42 * s, fy = s * 0.38 - lift * 0.2 * s;
    limb(ctx, hx, hy, fx, fy, 0.14 * s, dark, ol);
  }
  ctx.save(); ctx.translate(0, -bounce);
  const tail = Math.sin(st.t * 9) * s * 0.12;
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.2); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2 + tail, -s * 1.05, s * 0.25 + tail); ctx.quadraticCurveTo(-s * 0.85, s * 0.0, -s * 0.65, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = horse; ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.75, s * 0.36, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = shade(horse, 0.4); ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.28, s * 0.4, s * 0.1, 0, 0, TAU); ctx.fill(); ctx.restore();
  // saddle blanket
  ctx.fillStyle = col; roundRect(ctx, -s * 0.28, -s * 0.38, s * 0.5, s * 0.22, s * 0.05); ctx.fill(); ctx.stroke();
  // neck/head
  ctx.fillStyle = horse; ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.3); ctx.quadraticCurveTo(s * 0.75, -s * 0.8, s * 0.95, -s * 0.55); ctx.lineTo(s * 1.15, -s * 0.3); ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.75, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.42); ctx.quadraticCurveTo(s * 0.72, -s * 0.9 + Math.sin(st.t * 9) * s * 0.04, s * 0.88, -s * 0.66); ctx.lineTo(s * 0.74, -s * 0.5); ctx.closePath(); ctx.fill();   // mane
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.98, -s * 0.5, Math.max(ol * 0.8, s * 0.04), 0, TAU); ctx.fill();
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 0.62); ctx.lineTo(s * 0.86, -s * 0.78); ctx.lineTo(s * 0.98, -s * 0.66); ctx.closePath(); ctx.fill();   // ear
  // rider
  const lean = Math.sin(st.ph) * 0.05 * mv;
  ctx.save(); pivot(ctx, -s * 0.05, -s * 0.4, lean);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.66, s * 0.27, s * 0.34, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.1, s * 0.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = gear >= 3 ? '#c9a24b' : '#aab0bd'; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.14, s * 0.22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 1.36); ctx.quadraticCurveTo(-s * 0.3, -s * 1.5 + Math.sin(st.t * 10) * s * 0.06, -s * 0.38, -s * 1.2); ctx.lineTo(-s * 0.1, -s * 1.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.08, -s * 1.08, Math.max(ol * 0.7, s * 0.035), 0, TAU); ctx.fill();
  // lance with pennant
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.08 + ol; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.45); ctx.lineTo(s * 1.15, -s * 0.95); ctx.stroke();
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.45); ctx.lineTo(s * 1.15, -s * 0.95); ctx.stroke();
  ctx.fillStyle = '#e3e7ee'; ctx.lineWidth = ol; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(s * 1.3, -s * 1.0); ctx.lineTo(s * 1.04, -s * 1.08); ctx.lineTo(s * 1.1, -s * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
  const fl = Math.sin(st.t * 12) * s * 0.06;
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.85, -s * 0.87); ctx.lineTo(s * 0.55, -s * 0.8 + fl); ctx.lineTo(s * 0.6, -s * 0.66 + fl); ctx.lineTo(s * 0.85, -s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Battering ram carried by a squad (little legs underneath)
// ---------------------------------------------------------------------------------------------
function drawRam(ctx, s, col, st) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0;
  const bounce = Math.abs(Math.sin(st.ph)) * 0.05 * s * mv;
  for (let i = 0; i < 4; i++) {
    const off = (i % 2) * Math.PI, hx = (-0.55 + i * 0.4) * s;
    const a = Math.sin(st.ph + off) * mv, lift = Math.max(0, Math.cos(st.ph + off)) * mv;
    limb(ctx, hx, -s * 0.12 - bounce, hx + a * 0.22 * s, s * 0.34 - lift * 0.09 * s, 0.17 * s, '#4a3626', ol);
    blob(ctx, hx + a * 0.22 * s + s * 0.05, s * 0.34 - lift * 0.09 * s, s * 0.13, s * 0.07, BOOT);
  }
  ctx.save(); ctx.translate(0, -bounce);
  // the log slides back and forth
  const slide = Math.sin(st.t * 2.2) * s * 0.07;
  ctx.fillStyle = '#6b4a2a'; roundRect(ctx, -s * 0.5 + slide, -s * 0.52, s * 1.7, s * 0.24, s * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa1b0'; ctx.beginPath(); ctx.moveTo(s * 1.1 + slide, -s * 0.56); ctx.lineTo(s * 1.38 + slide, -s * 0.4); ctx.lineTo(s * 1.1 + slide, -s * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
  // roof
  ctx.fillStyle = shade(col, 0.1); roundRect(ctx, -s * 0.85, -s * 0.78, s * 1.6, s * 0.6, s * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.moveTo(-s * 0.95, -s * 0.76); ctx.lineTo(-s * 0.05, -s * 1.2); ctx.lineTo(s * 0.85, -s * 0.76); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = shade('#8a5a32', -0.4); ctx.lineWidth = ol * 0.8;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.9 + i * s * 0.2, -s * 0.78 - i * 0.02 * s); ctx.lineTo(-s * 0.5 + i * s * 0.1, -s * 1.05 + i * 0.03 * s); ctx.stroke(); }
  ctx.lineWidth = ol;
  // shield rack on the side
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.arc(-s * 0.45, -s * 0.47, s * 0.13, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(-s * 0.05, -s * 0.47, s * 0.13, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Spiders
// ---------------------------------------------------------------------------------------------
function drawSpider(ctx, s, col, st, mother) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0.25;
  const bounce = Math.abs(Math.sin(st.ph * 2)) * 0.05 * s * mv;
  ctx.strokeStyle = INK; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    const w = Math.sin(st.ph * 1.5 + i * 1.6 + (side > 0 ? 0 : Math.PI)) * 0.14 * s * mv;
    const lift = Math.max(0, Math.cos(st.ph * 1.5 + i * 1.6 + (side > 0 ? 0 : Math.PI))) * 0.08 * s * mv;
    const kx = side * s * (0.55 + i * 0.03), ky = -s * (0.65 - i * 0.12) - lift;
    ctx.lineWidth = s * 0.1 + ol; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(side * s * 0.15, -s * 0.2 - bounce); ctx.lineTo(kx + w * 0.5, ky - bounce); ctx.lineTo(side * s * (0.85 + i * 0.05) + w, s * 0.3 - lift * 0.5); ctx.stroke();
    ctx.lineWidth = s * 0.1; ctx.strokeStyle = shade(col, -0.35);
    ctx.beginPath(); ctx.moveTo(side * s * 0.15, -s * 0.2 - bounce); ctx.lineTo(kx + w * 0.5, ky - bounce); ctx.lineTo(side * s * (0.85 + i * 0.05) + w, s * 0.3 - lift * 0.5); ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineWidth = ol;
  ctx.save(); ctx.translate(0, -bounce);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-s * 0.22, -s * 0.28, s * 0.52, s * 0.44, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(col, -0.3);
  const throb = mother ? 1 + Math.sin(st.t * 5) * 0.12 : 1;
  for (const [bx, by, br] of mother ? [[-0.4, -0.5, 0.14], [-0.15, -0.58, 0.12], [-0.55, -0.28, 0.12]] : [[-0.3, -0.5, 0.1]]) { ctx.beginPath(); ctx.arc(bx * s, by * s, br * s * throb, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.26, s * 0.27, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffdf6b';
  for (const [ex, ey, er] of [[0.46, -0.32, 0.065], [0.32, -0.36, 0.055], [0.5, -0.2, 0.045]]) { ctx.beginPath(); ctx.arc(ex * s, ey * s, Math.max(ol * 0.7, er * s), 0, TAU); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = ol * 0.9; ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.1); ctx.lineTo(s * 0.62, s * 0.02); ctx.moveTo(s * 0.46, -s * 0.06); ctx.lineTo(s * 0.5, s * 0.07); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Stone Golem / Siege Titan
// ---------------------------------------------------------------------------------------------
function drawGolem(ctx, s, col, st, boss) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0;
  const sw = Math.sin(st.ph) * mv;
  const bob = Math.abs(sw) * 0.07 * s;
  const dark = shade(col, -0.25);
  // legs
  for (const [side, off] of [[-1, 0], [1, Math.PI]]) {
    const a = Math.sin(st.ph + off) * mv, lift = Math.max(0, Math.cos(st.ph + off)) * mv;
    limb(ctx, side * s * 0.3, s * 0.0 - bob, side * s * 0.3 + a * s * 0.2, s * 0.34 - lift * s * 0.12, s * 0.34, dark, ol);
  }
  ctx.save(); ctx.translate(0, -bob);
  // far arm
  const armA = -sw * 0.35;
  ctx.save(); pivot(ctx, -s * 0.6, -s * 0.7, armA); limb(ctx, -s * 0.6, -s * 0.7, -s * 0.85, -s * 0.05, s * 0.3, dark, ol); blob(ctx, -s * 0.88, -s * 0.0, s * (boss ? 0.34 : 0.26), s * (boss ? 0.32 : 0.25), shade(col, -0.1)); ctx.restore();
  // torso
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.15); ctx.lineTo(-s * 0.8, -s * 0.6); ctx.lineTo(-s * 0.3, -s * 1.02); ctx.lineTo(s * 0.4, -s * 0.98); ctx.lineTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 0.7, s * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = shade(col, 0.4); ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.5); ctx.lineTo(-s * 0.3, -s * 0.9); ctx.lineTo(s * 0.1, -s * 0.9); ctx.lineTo(-s * 0.3, -s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = ol * 0.8;
  ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.25); ctx.lineTo(-s * 0.1, -s * 0.05); ctx.lineTo(-s * 0.28, s * 0.1); ctx.moveTo(s * 0.35, -s * 0.5); ctx.lineTo(s * 0.45, -s * 0.2); ctx.stroke();
  ctx.lineWidth = ol; ctx.strokeStyle = INK;
  const glow = 0.5 + 0.5 * Math.sin(st.t * 3);
  const core = boss ? '255,106,61' : '127,211,242';
  ctx.fillStyle = `rgba(${core},${0.25 + 0.3 * glow})`; ctx.beginPath(); ctx.arc(0, -s * 0.4, s * (0.2 + 0.05 * glow), 0, TAU); ctx.fill();
  ctx.fillStyle = `rgb(${core})`; ctx.beginPath(); ctx.arc(0, -s * 0.4, s * 0.09, 0, TAU); ctx.fill(); ctx.stroke();
  // moss on the shoulders
  ctx.fillStyle = '#5f9a3a'; ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.9, s * 0.22, s * 0.08, -0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * 0.5, -s * 0.78, s * 0.16, s * 0.07, 0.4, 0, TAU); ctx.fill();
  // head
  ctx.fillStyle = shade(col, -0.08); roundRect(ctx, -s * 0.02, -s * 1.3 + bob * 0.3, s * 0.55, s * 0.4, s * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = `rgb(${core})`;
  for (const ex of [0.12, 0.34]) { ctx.beginPath(); ctx.arc(s * ex + s * 0.05, -s * 1.12 + bob * 0.3, Math.max(ol, s * 0.065), 0, TAU); ctx.fill(); }
  if (boss) { ctx.fillStyle = dark; for (const ex of [0.02, 0.2, 0.38]) { ctx.beginPath(); ctx.moveTo(s * ex, -s * 1.28); ctx.lineTo(s * (ex + 0.07), -s * 1.55); ctx.lineTo(s * (ex + 0.14), -s * 1.28); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  // near arm
  ctx.save(); pivot(ctx, s * 0.62, -s * 0.7, -armA); limb(ctx, s * 0.62, -s * 0.7, s * 0.9, -s * 0.05, s * 0.3, dark, ol); blob(ctx, s * 0.93, s * 0.0, s * (boss ? 0.36 : 0.27), s * (boss ? 0.34 : 0.26), shade(col, -0.05)); ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Allied soldiers (barracks)
// ---------------------------------------------------------------------------------------------
export function drawSoldierSprite(ctx, ts, so, st) {
  const ol = ctx.lineWidth, s = ts * 0.3;
  const mv = st.moving ? 1 : 0;
  const bounce = Math.abs(Math.sin(st.ph)) * 0.08 * s * mv;
  const col = so.armor ? '#9aa1b0' : '#3a8a52';
  const dark = shade(col, -0.4);
  for (const [side, off] of [[-1, 0], [1, Math.PI]]) {
    const a = Math.sin(st.ph + off) * mv, lift = Math.max(0, Math.cos(st.ph + off)) * mv;
    limb(ctx, side * 0.16 * s, 0.1 * s - bounce, side * 0.16 * s + a * 0.28 * s, 0.4 * s - lift * 0.12 * s, 0.2 * s, dark, ol);
  }
  ctx.save(); ctx.translate(0, -bounce);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 0.42, s * 0.42, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.66, s * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.7, s * 0.33, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.04, -s * 1.0); ctx.lineTo(-s * 0.1, -s * 1.2 + Math.sin(st.t * 8) * s * 0.04); ctx.lineTo(s * 0.12, -s * 1.02); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.64, Math.max(ol * 0.7, s * 0.05), 0, TAU); ctx.fill();
  // shield on the back arm
  ctx.fillStyle = '#3d7bd9'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.2, s * 0.25, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.2, s * 0.08, 0, TAU); ctx.fill();
  // sword, chopping when fighting
  const sw = st.swing > 0 ? -1.15 + (0.2 - st.swing) * 7 : 0.25 + Math.sin(st.ph) * 0.12 * mv;
  ctx.save(); ctx.translate(s * 0.4, -s * 0.2); ctx.rotate(sw);
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.16 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.75); ctx.stroke();
  ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(0, -s * 0.12); ctx.lineTo(0, -s * 0.72); ctx.stroke();
  ctx.strokeStyle = '#c9a24b'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.12); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// The hero on the battlements. Local origin: castle centre; `s` is the castle scale.
// o: { aim, t, pull, kick, weapon, ammo, cape, tunic, hot }
// ---------------------------------------------------------------------------------------------
export function drawHero(ctx, s, o) {
  const ol = ctx.lineWidth;
  ctx.save();
  ctx.translate(0, -s * 0.36);
  const face = Math.cos(o.aim) >= -0.05 ? 1 : -1;
  ctx.scale(face, 1);
  const la = face > 0 ? o.aim : Math.PI - o.aim;
  const breath = Math.sin(o.t * 2.2) * 0.012 * s;
  if (o.hot) {                                           // combo aura
    const g = 0.5 + 0.5 * Math.sin(o.t * 9);
    ctx.fillStyle = `rgba(242,179,61,${0.18 + 0.14 * g})`; ctx.beginPath(); ctx.arc(0, -s * 0.22, s * (0.34 + 0.04 * g), 0, TAU); ctx.fill();
  }
  // cape
  const fl = Math.sin(o.t * 5) * 0.05 * s, fl2 = Math.sin(o.t * 5 + 1.3) * 0.05 * s;
  ctx.fillStyle = o.cape; ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 0.3 + breath);
  ctx.quadraticCurveTo(-s * 0.22 - fl, -s * 0.15, -s * 0.3 - fl2, s * 0.03); ctx.lineTo(-s * 0.1, s * 0.0); ctx.lineTo(-s * 0.02, -s * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  // legs
  limb(ctx, -s * 0.045, -s * 0.1, -s * 0.05, 0, s * 0.06, '#3a2a22', ol); limb(ctx, s * 0.045, -s * 0.1, s * 0.05, 0, s * 0.06, '#3a2a22', ol);
  // torso
  ctx.fillStyle = o.tunic; roundRect(ctx, -s * 0.095, -s * 0.31 + breath, s * 0.19, s * 0.22, s * 0.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6b4220'; ctx.fillRect(-s * 0.095, -s * 0.16 + breath, s * 0.19, s * 0.035);
  // head
  const hy = -s * 0.38 + breath;
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(s * 0.01, hy, s * 0.105, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = o.tunic; ctx.beginPath(); ctx.arc(s * 0.0, hy - s * 0.015, s * 0.115, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.02, hy - s * 0.11); ctx.quadraticCurveTo(-s * 0.08, hy - s * 0.24 + fl, -s * 0.16, hy - s * 0.12 + fl2); ctx.lineTo(-s * 0.01, hy - s * 0.09); ctx.closePath(); ctx.fill(); ctx.stroke();
  const er = Math.max(ol * 0.6, s * 0.022);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.055 + Math.cos(la) * s * 0.012, hy + s * 0.012 + Math.sin(la) * s * 0.012, er, 0, TAU); ctx.fill();
  // weapon arm + weapon, rotated toward the aim
  ctx.save(); ctx.translate(0, -s * 0.22 + breath); ctx.rotate(la);
  const kick = o.kick * s * 0.06;
  switch (o.weapon) {
    case 'crossbow': {
      ctx.translate(s * 0.1 - kick, 0);
      limb(ctx, -s * 0.1, 0, s * 0.1, 0, s * 0.05, '#6b4220', ol);
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.045 + ol; ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.15); ctx.lineTo(s * 0.12, s * 0.15); ctx.stroke();
      ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = s * 0.045; ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.15); ctx.lineTo(s * 0.12, s * 0.15); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.6); ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.15); ctx.lineTo(s * 0.12 - Math.max(o.pull, o.ammo > 0 ? 0.35 : 0) * s * 0.1, 0); ctx.lineTo(s * 0.12, s * 0.15); ctx.stroke();
      if (o.ammo > 0) { ctx.strokeStyle = '#d9dde6'; ctx.lineWidth = ol; ctx.beginPath(); ctx.moveTo(-s * 0.02, 0); ctx.lineTo(s * 0.22, 0); ctx.stroke(); }
      break;
    }
    case 'javelin': {
      const back = Math.max(o.pull, 0.2) * s * 0.12 + kick;
      ctx.translate(-back, 0);
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.05 + ol; ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.lineTo(s * 0.34, 0); ctx.stroke();
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.lineTo(s * 0.34, 0); ctx.stroke();
      if (o.ammo > 0) { const g = 0.5 + 0.5 * Math.sin(o.t * 14); ctx.fillStyle = `rgba(255,150,50,${0.5 + 0.4 * g})`; ctx.beginPath(); ctx.arc(s * 0.38, 0, s * (0.07 + 0.03 * g), 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.04); ctx.lineTo(s * 0.45, 0); ctx.lineTo(s * 0.34, s * 0.04); ctx.fill(); }
      limb(ctx, 0, 0, s * 0.1, 0, s * 0.05, o.tunic, ol);
      break;
    }
    case 'wand': {
      ctx.translate(s * 0.08 - kick, 0);
      limb(ctx, -s * 0.08 + kick, 0, 0, 0, s * 0.05, o.tunic, ol);
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.04 + ol; ctx.beginPath(); ctx.moveTo(-s * 0.05, 0); ctx.lineTo(s * 0.22, 0); ctx.stroke();
      ctx.strokeStyle = '#6b4a7a'; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(-s * 0.05, 0); ctx.lineTo(s * 0.22, 0); ctx.stroke();
      const g = 0.5 + 0.5 * Math.sin(o.t * 6) + o.pull;
      ctx.fillStyle = `rgba(199,155,255,${Math.min(0.9, 0.3 + 0.3 * g)})`; ctx.beginPath(); ctx.arc(s * 0.26, 0, s * (0.09 + 0.05 * Math.min(1, g)), 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9d8ff'; ctx.beginPath(); ctx.arc(s * 0.26, 0, s * 0.045, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 'handcannon': {
      ctx.translate(s * 0.06 - kick * 1.5, 0);
      limb(ctx, -s * 0.06 + kick * 1.5, 0, 0, 0, s * 0.05, o.tunic, ol);
      ctx.fillStyle = '#4a4f5c'; roundRect(ctx, 0, -s * 0.05, s * 0.3, s * 0.1, s * 0.03); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b4220'; roundRect(ctx, -s * 0.06, -s * 0.03, s * 0.1, s * 0.12, s * 0.03); ctx.fill(); ctx.stroke();
      if (o.kick > 0.6) { ctx.fillStyle = 'rgba(255,200,80,0.9)'; ctx.beginPath(); ctx.arc(s * 0.36, 0, s * 0.1 * o.kick, 0, TAU); ctx.fill(); }
      break;
    }
    default: {                                            // longbow
      ctx.translate(s * 0.12 - kick, 0);
      limb(ctx, -s * 0.12 + kick, 0, 0, 0, s * 0.05, o.tunic, ol);
      const r = s * 0.2;
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.05 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-s * 0.06, 0, r, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = '#9a6a3c'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.arc(-s * 0.06, 0, r, -1.15, 1.15); ctx.stroke();
      ctx.lineCap = 'butt';
      const tipX = -s * 0.06 + Math.cos(1.15) * r, tipY = Math.sin(1.15) * r;
      const draw = Math.max(o.pull, o.ammo > 0 ? 0.3 : 0) * s * 0.15;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, ol * 0.6); ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(-s * 0.06 - draw + s * 0.02, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
      if (o.ammo > 0) {
        ctx.strokeStyle = '#d9dde6'; ctx.lineWidth = ol; ctx.beginPath(); ctx.moveTo(-s * 0.06 - draw + s * 0.02, 0); ctx.lineTo(s * 0.2, 0); ctx.stroke();
        ctx.fillStyle = '#e3e7ee'; ctx.beginPath(); ctx.moveTo(s * 0.26, 0); ctx.lineTo(s * 0.18, -s * 0.03); ctx.lineTo(s * 0.18, s * 0.03); ctx.closePath(); ctx.fill();
      }
      blob(ctx, -s * 0.06 - draw + s * 0.02, 0, s * 0.04, s * 0.04, SKIN);        // draw hand
      blob(ctx, 0, 0, s * 0.045, s * 0.045, SKIN);                                  // grip hand
    }
  }
  ctx.restore();
  ctx.restore();
}
