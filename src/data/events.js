// Seasonal events, themes, weekday blessings and commander ranks. Dates are UTC and repeat every year.

// Theme: palette overrides for the UI plus an ambient look on the battlefield.
export const THEMES = {
  halloween: { css: { '--night': '#140d1c', '--enamel': '#2b1d33', '--enamel-2': '#3b2848', '--enamel-3': '#523766', '--line': '#7a5290', '--gold': '#ff9a2e', '--gold-deep': '#c25f0a', '--parchment': '#eadcf5' }, tint: 'rgba(90,40,140,0.13)', fall: 'bats', emoji: '🎃', theme: '#140d1c' },
  harvest:   { css: { '--night': '#1a120b', '--enamel': '#33241a', '--enamel-2': '#45301f', '--enamel-3': '#5e4128', '--line': '#8a6234', '--gold': '#f0a53a', '--gold-deep': '#b0701a' }, tint: 'rgba(200,110,30,0.10)', fall: 'leaves', emoji: '🍂', theme: '#1a120b' },
  winter:    { css: { '--night': '#0e1620', '--enamel': '#1d2b3b', '--enamel-2': '#2a3d52', '--enamel-3': '#3b5470', '--line': '#6c8cab', '--gold': '#8fd3ff', '--gold-deep': '#4a9fd0', '--parchment': '#e7f3ff', '--text': '#f2f8ff', '--muted': '#a9bfd4' }, tint: 'rgba(150,200,255,0.12)', fall: 'snow', emoji: '🎄', theme: '#0e1620' },
  hearts:    { css: { '--night': '#1c0f16', '--enamel': '#3a1d2b', '--enamel-2': '#4d2a3b', '--enamel-3': '#6b3a50', '--line': '#a35a78', '--gold': '#ff7aa8', '--gold-deep': '#c2406f' }, tint: 'rgba(255,90,140,0.08)', fall: 'hearts', emoji: '💘', theme: '#1c0f16' },
  spring:    { css: { '--night': '#10180f', '--enamel': '#233222', '--enamel-2': '#314530', '--enamel-3': '#46603f', '--line': '#6f9a62', '--gold': '#ffb7d0', '--gold-deep': '#d9729a' }, tint: 'rgba(255,200,230,0.07)', fall: 'petals', emoji: '🌸', theme: '#10180f' },
  summer:    { css: { '--night': '#0e1a22', '--enamel': '#1d3342', '--enamel-2': '#294a5e', '--enamel-3': '#3a6682', '--line': '#5f9cc0', '--gold': '#ffd23d', '--gold-deep': '#d29a0a' }, tint: 'rgba(255,220,120,0.09)', fall: 'sparks', emoji: '☀️', theme: '#0e1a22' },
};

// Each event pays out by waves held while it runs. Rewards are cosmetics you keep (renown if you already own one).
export const EVENTS = [
  { id: 'heartfire', name: 'Heartfire Festival', icon: '💘', from: [2, 7], to: [2, 16], theme: 'hearts', blurb: 'Hearts rain over the battlements. Defend what you love.',
    rewards: [{ at: 20, cosmetic: 'castle:rosequartz', renown: 40 }, { at: 45, cosmetic: 'trail:hearts', renown: 60 }, { at: 80, cosmetic: 'kill:hearts', renown: 80 }, { at: 120, cosmetic: 'skin:rose', renown: 100 }, { at: 170, title: 'Heartwarden', renown: 200 }] },
  { id: 'bloomtide', name: 'Bloomtide', icon: '🌸', from: [3, 15], to: [4, 22], theme: 'spring', blurb: 'The meadows burst into flower. Petals drift over the road.',
    rewards: [{ at: 25, cosmetic: 'castle:blossom', renown: 40 }, { at: 60, cosmetic: 'trail:petalstorm', renown: 60 }, { at: 110, cosmetic: 'kill:bloom', renown: 80 }, { at: 170, cosmetic: 'skin:lichen', renown: 100 }, { at: 250, title: 'Springwarden', renown: 200 }] },
  { id: 'sunfest', name: 'Sunfest', icon: '☀️', from: [6, 20], to: [7, 9], theme: 'summer', blurb: 'Long days, bright banners and fireworks over the keep.',
    rewards: [{ at: 25, cosmetic: 'castle:sunstone', renown: 40 }, { at: 55, cosmetic: 'trail:firework', renown: 60 }, { at: 100, cosmetic: 'kill:fireworks', renown: 80 }, { at: 150, cosmetic: 'skin:coral', renown: 100 }, { at: 220, title: 'Sunwarden', renown: 200 }] },
  { id: 'haunt', name: 'Haunted Siege', icon: '🎃', from: [10, 10], to: [11, 2], theme: 'halloween', blurb: 'The night gets longer and the dead march on the keep.',
    rewards: [{ at: 25, cosmetic: 'castle:haunted', renown: 40 }, { at: 60, cosmetic: 'trail:ghostfire', renown: 60 }, { at: 110, cosmetic: 'kill:spooky', renown: 80 }, { at: 170, cosmetic: 'skin:bone', renown: 100 }, { at: 250, title: 'Pumpkin King', renown: 200 }] },
  { id: 'harvest', name: 'Harvest Feast', icon: '🍂', from: [11, 12], to: [11, 30], theme: 'harvest', blurb: 'Gold leaves, full granaries, hungry invaders.',
    rewards: [{ at: 20, cosmetic: 'castle:harvest', renown: 40 }, { at: 45, cosmetic: 'trail:autumn', renown: 60 }, { at: 80, cosmetic: 'kill:leaves', renown: 80 }, { at: 120, cosmetic: 'skin:oak', renown: 100 }, { at: 170, title: 'Harvest Lord', renown: 200 }] },
  { id: 'frostfair', name: 'Frostfair', icon: '🎄', from: [12, 10], to: [1, 3], theme: 'winter', blurb: 'Snow on the walls and lanterns on every tower.',
    rewards: [{ at: 25, cosmetic: 'castle:snowkeep', renown: 40 }, { at: 60, cosmetic: 'trail:snowflake', renown: 60 }, { at: 110, cosmetic: 'kill:snow', renown: 80 }, { at: 170, cosmetic: 'skin:candy', renown: 100 }, { at: 250, title: 'Frostwarden', renown: 200 }] },
];
export const EVENT_RENOWN_BONUS = 0.25;   // extra Renown on every run while an event is on

// Every weekday has a small blessing for everyone. Keys match the run bonuses used by the Realm.
export const DAY_BLESSINGS = [
  { name: 'Restful Sunday', icon: '🕊', perk: { castleHpMult: 0.1 }, renown: 0.15, text: '+10% keep HP, +15% Renown' },        // 0 Sun
  { name: 'Marksman Monday', icon: '🏹', perk: { weaponDmg: 0.12 }, text: '+12% weapon damage' },
  { name: 'Tower Tuesday', icon: '🗼', perk: { towerDmg: 0.08 }, text: '+8% tower damage' },
  { name: 'Wealthy Wednesday', icon: '💰', perk: { killGold: 0.2 }, text: '+20% kill gold' },
  { name: 'Thrifty Thursday', icon: '🪙', perk: { towerDiscount: 0.08 }, text: 'Towers cost 8% less' },
  { name: 'Fortify Friday', icon: '🛡', perk: { castleHpMult: 0.15, repairDiscount: 0.15 }, text: '+15% keep HP, repairs 15% cheaper' },
  { name: 'Spoils Saturday', icon: '🎁', perk: { startGold: 60 }, renown: 0.15, text: '+60 starting gold, +15% Renown' },
];

// Commander ranks from lifetime Renown earned. Each rank grants a title.
export const RANKS = [
  { at: 0, name: 'Recruit' }, { at: 100, name: 'Footman' }, { at: 300, name: 'Sergeant' }, { at: 700, name: 'Lieutenant' },
  { at: 1500, name: 'Captain' }, { at: 3000, name: 'Knight-Captain' }, { at: 6000, name: 'Banneret' }, { at: 12000, name: 'Baron' },
  { at: 25000, name: 'Count' }, { at: 50000, name: 'Duke' }, { at: 100000, name: 'Grand Marshal' },
];
