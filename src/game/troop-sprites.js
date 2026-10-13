// Sprites for the Garrison's troops. Same conventions as sprites.js: the caller has translated to the unit's feet,
// flipped for facing and set an ink outline; `s` is the unit scale. st = { ph, t, moving, swing }.
import { INK, TAU, roundRect, shade, limb, pivot } from './draw-util.js';

const SKIN = '#f2d1a8';
const STEEL = '#d9dde6';

export function drawTroopSprite(ctx, ts, tr, st, D) {
  const s = ts * 0.3;
  if (tr.kind === 'cavalry') return rider(ctx, s, tr, st, D);
  if (tr.kind === 'griffon') return griffon(ctx, s, tr, st, D);
  return foot(ctx, s, tr, st, D);
}

// Walking legs shared by every footsoldier.
function legs(ctx, s, st, dark, bounce) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0;
  for (const [side, off] of [[-1, 0], [1, Math.PI]]) {
    const a = Math.sin(st.ph + off) * mv, lift = Math.max(0, Math.cos(st.ph + off)) * mv;
    limb(ctx, side * 0.16 * s, 0.1 * s - bounce, side * 0.16 * s + a * 0.28 * s, 0.4 * s - lift * 0.12 * s, 0.2 * s, dark, ol);
  }
}

function foot(ctx, s, tr, st, D) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0;
  const bounce = Math.abs(Math.sin(st.ph)) * 0.08 * s * mv;
  const col = D.color, dark = shade(col, -0.45), k = tr.kind;
  const heavy = k === 'knight', robe = k === 'cleric';
  legs(ctx, s, st, robe ? shade(col, -0.2) : dark, bounce);
  ctx.save(); ctx.translate(0, -bounce);
  // body
  const body = heavy ? '#aab2c2' : col;
  ctx.fillStyle = body;
  if (robe) { ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.28); ctx.quadraticCurveTo(-s * 0.46, -s * 0.5, 0, -s * 0.6); ctx.quadraticCurveTo(s * 0.46, -s * 0.5, s * 0.42, s * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else { ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * (heavy ? 0.5 : 0.42), s * (heavy ? 0.46 : 0.42), 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  if (heavy) { ctx.fillStyle = col; ctx.fillRect(-s * 0.42, -s * 0.2, s * 0.84, s * 0.1); ctx.strokeRect(-s * 0.42, -s * 0.2, s * 0.84, s * 0.1); }
  if (robe) { ctx.fillStyle = '#d9473b'; ctx.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s * 0.78); }
  // head
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.66, s * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
  if (k === 'bowman') {                       // green hood
    ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(s * 0.02, -s * 0.7, s * 0.34, Math.PI * 0.95, Math.PI * 2.0); ctx.lineTo(s * 0.3, -s * 0.5); ctx.quadraticCurveTo(0, -s * 0.62, -s * 0.3, -s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (heavy) {                          // great helm with plume
    ctx.fillStyle = '#c3cad8'; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.68, s * 0.36, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(s * 0.36, -s * 0.5); ctx.lineTo(-s * 0.28, -s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(s * 0.02, -s * 0.7, s * 0.34, s * 0.07);
    ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(s * 0.04, -s * 1.02); ctx.quadraticCurveTo(-s * 0.3, -s * 1.2 + Math.sin(st.t * 7) * s * 0.05, -s * 0.34, -s * 0.8); ctx.lineTo(s * 0.02, -s * 0.94); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (robe) {                           // white cowl and halo
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(s * 0.02, -s * 0.7, s * 0.34, Math.PI * 0.92, Math.PI * 2.05); ctx.lineTo(s * 0.28, -s * 0.52); ctx.quadraticCurveTo(0, -s * 0.6, -s * 0.28, -s * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = 'rgba(255,224,120,0.95)'; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.ellipse(s * 0.02, -s * 1.06, s * 0.2, s * 0.07, 0, 0, TAU); ctx.stroke(); ctx.restore();
  } else {                                     // open helm; pikemen get a taller crest
    ctx.fillStyle = STEEL; ctx.beginPath(); ctx.arc(s * 0.04, -s * 0.7, s * 0.33, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = k === 'pikeman' ? '#8d7bb5' : k === 'crossbow' ? '#c98a4b' : '#d9473b';
    ctx.beginPath(); ctx.moveTo(s * 0.04, -s * 1.0); ctx.lineTo(-s * 0.1, -s * (k === 'pikeman' ? 1.3 : 1.2) + Math.sin(st.t * 8) * s * 0.04); ctx.lineTo(s * 0.12, -s * 1.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.64, Math.max(ol * 0.7, s * 0.05), 0, TAU); ctx.fill();
  // shield on the back arm
  if (k === 'footman' || k === 'knight' || k === 'pikeman') {
    const big = heavy ? 1.35 : 1;
    ctx.fillStyle = k === 'knight' ? '#c9a24b' : k === 'pikeman' ? '#6b5aa0' : '#3d7bd9';
    ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.2, s * 0.25 * big, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = k === 'knight' ? '#d9473b' : '#f2b33d'; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.2, s * 0.08 * big, 0, TAU); ctx.fill();
  }
  weapon(ctx, s, st, k, ol);
  ctx.restore();
  // a cleric's healing glow
  if (robe && st.swing > 0) { ctx.save(); ctx.strokeStyle = `rgba(255,236,140,${st.swing * 3})`; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.arc(0, -s * 0.3, s * (1.1 - st.swing * 1.6), 0, TAU); ctx.stroke(); ctx.restore(); }
}

function weapon(ctx, s, st, k, ol) {
  const mv = st.moving ? 1 : 0, sw = st.swing;
  if (k === 'bowman' || k === 'crossbow') {
    const pull = sw > 0 ? Math.min(1, sw * 5) : 0;
    ctx.save(); ctx.translate(s * 0.46, -s * 0.28);
    if (k === 'bowman') {
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.1 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, s * 0.62, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.arc(0, 0, s * 0.62, -1.15, 1.15); ctx.stroke();
      const bx = Math.cos(1.15) * s * 0.62, by = Math.sin(1.15) * s * 0.62;
      ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.beginPath(); ctx.moveTo(bx, -by); ctx.lineTo(bx - pull * s * 0.3, 0); ctx.lineTo(bx, by); ctx.stroke();
      if (sw <= 0) { ctx.strokeStyle = '#4a3520'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.lineTo(s * 0.55, 0); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#6b4a2a'; roundRect(ctx, -s * 0.12, -s * 0.07, s * 0.62, s * 0.14, s * 0.04); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = s * 0.09 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.34); ctx.lineTo(s * 0.34, s * 0.34); ctx.stroke();
      ctx.strokeStyle = '#a9794a'; ctx.lineWidth = s * 0.09; ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.34); ctx.lineTo(s * 0.34, s * 0.34); ctx.stroke();
      if (sw <= 0) { ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(s * 0.62, 0); ctx.lineTo(s * 0.4, -s * 0.05); ctx.lineTo(s * 0.4, s * 0.05); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
    return;
  }
  if (k === 'pikeman') {
    const thrust = sw > 0 ? Math.sin((1 - sw / 0.22) * Math.PI) * s * 0.5 : 0;
    ctx.save(); ctx.translate(s * 0.34, -s * 0.2); ctx.rotate(-0.12 + Math.sin(st.ph) * 0.05 * mv);
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.1 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 1.25 + thrust, 0); ctx.stroke();
    ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 1.25 + thrust, 0); ctx.stroke();
    ctx.fillStyle = STEEL; ctx.beginPath(); ctx.moveTo(s * 1.6 + thrust, 0); ctx.lineTo(s * 1.22 + thrust, -s * 0.12); ctx.lineTo(s * 1.22 + thrust, s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  if (k === 'cleric') {
    ctx.save(); ctx.translate(s * 0.46, -s * 0.1);
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.1 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, s * 0.4); ctx.lineTo(0, -s * 0.85); ctx.stroke();
    ctx.strokeStyle = '#a9794a'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(0, s * 0.4); ctx.lineTo(0, -s * 0.85); ctx.stroke();
    ctx.fillStyle = sw > 0 ? '#fff6a8' : '#ffe27a'; ctx.beginPath(); ctx.arc(0, -s * 0.95, s * (0.16 + sw * 0.3), 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  // sword (footman, knight): chops when fighting
  const big = k === 'knight' ? 1.2 : 1;
  const a = sw > 0 ? -1.15 + (0.22 - sw) * 6.5 : 0.25 + Math.sin(st.ph) * 0.12 * mv;
  ctx.save(); ctx.translate(s * 0.4, -s * 0.2); ctx.rotate(a);
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.16 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.75 * big); ctx.stroke();
  ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(0, -s * 0.12); ctx.lineTo(0, -s * 0.72 * big); ctx.stroke();
  ctx.strokeStyle = '#c9a24b'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.12); ctx.stroke();
  ctx.restore();
}

// Cavalry: a friendly charger with a knight on its back, lance couched.
function rider(ctx, s, tr, st, D) {
  const ol = ctx.lineWidth, mv = st.moving ? 1 : 0.2;
  const horse = '#e9e1cf', dark = shade(horse, -0.45), col = D.color;
  const bounce = Math.abs(Math.sin(st.ph)) * 0.1 * s * mv;
  for (const [lx, off] of [[-0.5, 0], [-0.32, 0.5], [0.34, 0.25], [0.52, 0.75]]) {
    const a = Math.sin(st.ph + off * TAU) * mv, lift = Math.max(0, Math.cos(st.ph + off * TAU)) * mv;
    limb(ctx, lx * s, -s * 0.02 - bounce, lx * s + a * 0.42 * s, s * 0.38 - lift * 0.2 * s, 0.14 * s, dark, ol);
  }
  ctx.save(); ctx.translate(0, -bounce);
  const tail = Math.sin(st.t * 9) * s * 0.12;
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.2); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2 + tail, -s * 1.05, s * 0.25 + tail); ctx.quadraticCurveTo(-s * 0.85, 0, -s * 0.65, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = horse; ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.75, s * 0.36, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; roundRect(ctx, -s * 0.34, -s * 0.4, s * 0.62, s * 0.3, s * 0.06); ctx.fill(); ctx.stroke();
  ctx.fillStyle = horse; ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.3); ctx.quadraticCurveTo(s * 0.75, -s * 0.8, s * 0.95, -s * 0.55); ctx.lineTo(s * 1.15, -s * 0.3); ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.75, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.42); ctx.quadraticCurveTo(s * 0.72, -s * 0.9 + Math.sin(st.t * 9) * s * 0.04, s * 0.88, -s * 0.66); ctx.lineTo(s * 0.74, -s * 0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.98, -s * 0.5, Math.max(ol * 0.8, s * 0.04), 0, TAU); ctx.fill();
  const lean = Math.sin(st.ph) * 0.05 * mv;
  ctx.save(); pivot(ctx, -s * 0.05, -s * 0.4, lean);
  ctx.fillStyle = '#aab2c2'; ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.66, s * 0.27, s * 0.34, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.1, s * 0.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c3cad8'; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.14, s * 0.22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 1.36); ctx.quadraticCurveTo(-s * 0.3, -s * 1.5 + Math.sin(st.t * 10) * s * 0.06, -s * 0.38, -s * 1.2); ctx.lineTo(-s * 0.1, -s * 1.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.08, -s * 1.08, Math.max(ol * 0.7, s * 0.035), 0, TAU); ctx.fill();
  const thrust = st.swing > 0 ? Math.sin((1 - st.swing / 0.22) * Math.PI) * s * 0.35 : 0;
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.08 + ol; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.45); ctx.lineTo(s * 1.15 + thrust, -s * 0.95); ctx.stroke();
  ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.45); ctx.lineTo(s * 1.15 + thrust, -s * 0.95); ctx.stroke();
  ctx.fillStyle = '#e3e7ee'; ctx.lineWidth = ol; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(s * 1.3 + thrust, -s * 1.0); ctx.lineTo(s * 1.04 + thrust, -s * 1.08); ctx.lineTo(s * 1.1 + thrust, -s * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
  const fl = Math.sin(st.t * 12) * s * 0.06;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s * 0.85, -s * 0.87); ctx.lineTo(s * 0.55, -s * 0.8 + fl); ctx.lineTo(s * 0.6, -s * 0.66 + fl); ctx.lineTo(s * 0.85, -s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// Griffon Rider: eagle head and wings, lion body, a knight in the saddle.
function griffon(ctx, s, tr, st, D) {
  const ol = ctx.lineWidth, flap = Math.sin(st.t * 11), body = '#d9a24a', dark = shade(body, -0.4), feather = '#f1e4c3';
  ctx.save(); ctx.translate(0, -Math.abs(Math.sin(st.t * 5.5)) * s * 0.12);
  // far wing
  ctx.fillStyle = shade(feather, -0.15); ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.5); ctx.quadraticCurveTo(-s * 0.9, -s * (1.5 + flap * 0.5), -s * 1.4, -s * (0.5 + flap * 0.6)); ctx.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.1, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  // hind legs and tail
  limb(ctx, -s * 0.35, -s * 0.05, -s * 0.5, s * 0.3, 0.16 * s, dark, ol);
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.2); ctx.quadraticCurveTo(-s * 1.2, -s * 0.1 + flap * s * 0.1, -s * 1.15, s * 0.25); ctx.quadraticCurveTo(-s * 0.9, 0, -s * 0.65, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.78, s * 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  limb(ctx, s * 0.35, -s * 0.05, s * 0.55, s * 0.28, 0.16 * s, dark, ol);
  // chest, neck, eagle head
  ctx.fillStyle = feather; ctx.beginPath(); ctx.moveTo(s * 0.4, -s * 0.35); ctx.quadraticCurveTo(s * 0.7, -s * 0.9, s * 0.95, -s * 0.8); ctx.lineTo(s * 1.0, -s * 0.45); ctx.quadraticCurveTo(s * 0.85, -s * 0.2, s * 0.6, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.moveTo(s * 0.98, -s * 0.78); ctx.lineTo(s * 1.38, -s * 0.62); ctx.lineTo(s * 1.0, -s * 0.52); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.72, Math.max(ol * 0.8, s * 0.05), 0, TAU); ctx.fill();
  // rider
  ctx.fillStyle = '#c9a24b'; roundRect(ctx, -s * 0.3, -s * 0.5, s * 0.5, s * 0.22, s * 0.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#aab2c2'; ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.78, s * 0.24, s * 0.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.15, s * 0.19, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c3cad8'; ctx.beginPath(); ctx.arc(-s * 0.02, -s * 1.19, s * 0.21, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 1.4); ctx.quadraticCurveTo(-s * 0.3, -s * 1.5 + flap * s * 0.05, -s * 0.36, -s * 1.25); ctx.lineTo(-s * 0.1, -s * 1.3); ctx.closePath(); ctx.fill();
  // sword arm
  const a = st.swing > 0 ? -0.9 + (0.22 - st.swing) * 6 : 0.4;
  ctx.save(); ctx.translate(s * 0.2, -s * 0.8); ctx.rotate(a);
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.14 + ol; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.7); ctx.stroke();
  ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, -s * 0.68); ctx.stroke();
  ctx.restore();
  // near wing
  ctx.fillStyle = feather; ctx.beginPath(); ctx.moveTo(s * 0.0, -s * 0.4); ctx.quadraticCurveTo(-s * 0.4, -s * (1.4 - flap * 0.5), -s * 1.0, -s * (0.35 - flap * 0.55)); ctx.quadraticCurveTo(-s * 0.4, -s * 0.15, s * 0.15, -s * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

