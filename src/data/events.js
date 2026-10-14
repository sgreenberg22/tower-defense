// Seasonal events, themes, weekday blessings and commander ranks. Dates are UTC and repeat every year.

// Theme: palette overrides for the UI plus an ambient look on the battlefield.
export const THEMES = {
  halloween: { css: { '--night': '#140d1c', '--enamel': '#2b1d33', '--enamel-2': '#3b2848', '--enamel-3': '#523766', '--line': '#7a5290', '--gold': '#ff9a2e', '--gold-deep': '#c25f0a', '--parchment': '#eadcf5' }, tint: 'rgba(90,40,140,0.13)', fall: 'bats', emoji: '🎃', theme: '#140d1c' },
  harvest:   { css: { '--night': '#1a120b', '--enamel': '#33241a', '--enamel-2': '#45301f', '--enamel-3': '#5e4128', '--line': '#8a6234', '--gold': '#f0a53a', '--gold-deep': '#b0701a' }, tint: 'rgba(200,110,30,0.10)', fall: 'leaves', emoji: '🍂', theme: '#1a120b' },
  winter:    { css: { '--night': '#0e1620', '--enamel': '#1d2b3b', '--enamel-2': '#2a3d52', '--enamel-3': '#3b5470', '--line': '#6c8cab', '--gold': '#8fd3ff', '--gold-deep': '#4a9fd0', '--parchment': '#e7f3ff', '--text': '#f2f8ff', '--muted': '#a9bfd4' }, tint: 'rgba(150,200,255,0.12)', fall: 'snow', emoji: '🎄', theme: '#0e1620' },
  hearts:    { css: { '--night': '#1c0f16', '--enamel': '#3a1d2b', '--enamel-2': '#4d2a3b', '--enamel-3': '#6b3a50', '--line': '#a35a78', '--gold': '#ff7aa8', '--gold-deep': '#c2406f' }, tint: 'rgba(255,90,140,0.08)', fall: 'hearts', emoji: '💘', theme: '#1c0f16' },
  spring:    { css: { '--night': '#10180f', '--enamel': '#233222', '--enamel-2': '#314530', '--enamel-3': '#46603f', '--line': '#6f9a62', '--gold': '#ffb7d0', '--gold-deep': '#d9729a' }, tint: 'rgba(255,200,230,0.07)', fall: 'petals', emoji: '🌸', theme: '#10180f' },
  summer:    { css: { '--night': '#0e1a22', '--enamel': '#1d3342', '--enamel-2': '#294a5e', '--enamel-3': '#3a6682', '--line': '#5f9cc0', '--gold': '#ffd23d', '--gold-deep': '#d29a0a' }, tint: 'rgba(255,220,120,0.09)', fall: 'sparks', emoji: '☀️', theme: '#0e1a22' },

  // ---- Realm themes: chosen by the player (Wardrobe → Themes), not tied to a date.
  // `ground` repaints the meadow battlefield (other lands keep their own look); `fall` is the ambient effect over the board.
  dawnstone: { css: { '--night': '#1b1511', '--enamel': '#33271e', '--enamel-2': '#473629', '--enamel-3': '#61493a', '--line': '#a1805f', '--gold': '#ffb27a', '--gold-deep': '#d1773c', '--parchment': '#f7e6cf' }, tint: 'rgba(255,190,130,0.08)', fall: 'motes', emoji: '🌅', theme: '#1b1511',
    ground: { grass: '#b7c46b', grass2: '#abb85f', path: '#ecd7a9', path2: '#d9c18d', accent: '#8c9a3d', sky: '#f4dfae' } },
  crimson:   { css: { '--night': '#1a0f10', '--enamel': '#34191c', '--enamel-2': '#4a2327', '--enamel-3': '#69313a', '--line': '#a85a5e', '--gold': '#f6c453', '--gold-deep': '#c28a1a', '--parchment': '#f6e3d8', '--blue': '#7a3a8a' }, tint: 'rgba(200,40,50,0.07)', fall: 'sparks', emoji: '⚜️', theme: '#1a0f10',
    ground: { grass: '#7da454', grass2: '#719849', path: '#d9b98a', path2: '#c7a572', accent: '#5f8a3a', sky: '#d8d9a8' } },
  ironclad:  { css: { '--night': '#0e1115', '--enamel': '#1d2229', '--enamel-2': '#2a313b', '--enamel-3': '#3b4553', '--line': '#6f7e91', '--gold': '#d3dcec', '--gold-deep': '#8190a8', '--parchment': '#e6ecf5', '--text': '#f2f6fb', '--muted': '#aab6c6' }, tint: 'rgba(110,135,175,0.08)', fall: 'embers', emoji: '🛡', theme: '#0e1115',
    ground: { grass: '#8ea183', grass2: '#839679', path: '#bdb6a8', path2: '#a8a193', accent: '#6c8062', sky: '#c9d3d6' } },
  emerald:   { css: { '--night': '#0d1710', '--enamel': '#1a2c1f', '--enamel-2': '#25402c', '--enamel-3': '#356041', '--line': '#6aa27a', '--gold': '#9be5a8', '--gold-deep': '#4fae66', '--parchment': '#e6f4e3' }, tint: 'rgba(60,170,90,0.08)', fall: 'greenleaves', emoji: '🌲', theme: '#0d1710',
    ground: { grass: '#4f9a4a', grass2: '#468f42', path: '#cfb98a', path2: '#bda274', accent: '#2f7a3a', sky: '#b9e3a8' } },
  moonlit:   { css: { '--night': '#0a0e1d', '--enamel': '#161d38', '--enamel-2': '#222b52', '--enamel-3': '#323f75', '--line': '#6577b5', '--gold': '#b9d6ff', '--gold-deep': '#6d92d6', '--parchment': '#e5ecff', '--text': '#f0f4ff', '--muted': '#a8b4d6' }, tint: 'rgba(30,50,140,0.20)', fall: 'fireflies', emoji: '🌙', theme: '#0a0e1d',
    ground: { grass: '#4a7a7a', grass2: '#427070', path: '#9aa8bd', path2: '#8693aa', accent: '#3a6a6a', sky: '#1d2a48' } },
  stormwatch:{ css: { '--night': '#0f1318', '--enamel': '#1c242c', '--enamel-2': '#283540', '--enamel-3': '#3a4c5c', '--line': '#6b8497', '--gold': '#8fd0e8', '--gold-deep': '#4a94b4', '--parchment': '#e3eef4', '--text': '#f0f6fa', '--muted': '#a6b8c4' }, tint: 'rgba(60,85,110,0.18)', fall: 'rain', emoji: '⛈', theme: '#0f1318',
    ground: { grass: '#6d8a6a', grass2: '#648060', path: '#a9a393', path2: '#958f80', accent: '#4f6d4f', sky: '#8a9ba6' } },
  dragonforge:{ css: { '--night': '#120b09', '--enamel': '#2a1710', '--enamel-2': '#3d2216', '--enamel-3': '#5a3220', '--line': '#a0583a', '--gold': '#ff8a3a', '--gold-deep': '#c2490e', '--parchment': '#f7e0cf' }, tint: 'rgba(255,90,30,0.10)', fall: 'embers', emoji: '🐉', theme: '#120b09',
    ground: { grass: '#7a5a48', grass2: '#6f5042', path: '#a9835e', path2: '#94704f', accent: '#d6561f', sky: '#4a2f26' } },
  royalcourt:{ css: { '--night': '#140c1f', '--enamel': '#2a1a42', '--enamel-2': '#3b2660', '--enamel-3': '#523684', '--line': '#8d6ed0', '--gold': '#ffd45a', '--gold-deep': '#c9961a', '--parchment': '#f1e6ff', '--blue': '#6b4fc4' }, tint: 'rgba(160,100,255,0.08)', fall: 'motes', emoji: '👑', theme: '#140c1f',
    ground: { grass: '#6fa860', grass2: '#639d56', path: '#e3cfa0', path2: '#d1ba88', accent: '#4f8a44', sky: '#d4c8ee' } },
  starforged:{ css: { '--night': '#070a18', '--enamel': '#12183a', '--enamel-2': '#1c2658', '--enamel-3': '#2b3a86', '--line': '#5f78d6', '--gold': '#9fe7ff', '--gold-deep': '#4ba9d6', '--parchment': '#e5f0ff', '--text': '#eef4ff', '--muted': '#a0b0d8' }, tint: 'rgba(60,70,200,0.16)', fall: 'stars', emoji: '✨', theme: '#070a18',
    ground: { grass: '#3f5a8a', grass2: '#37507c', path: '#9aa6d0', path2: '#8794c0', accent: '#5f78d6', sky: '#111a3a' } },
  eternal:   { css: { '--night': '#121212', '--enamel': '#262320', '--enamel-2': '#3a352f', '--enamel-3': '#564e44', '--line': '#a8996f', '--gold': '#ffe9a0', '--gold-deep': '#c9a84a', '--parchment': '#fff6dc', '--crimson': '#c9a84a' }, tint: 'rgba(255,230,150,0.07)', fall: 'motes', emoji: '♛', theme: '#121212',
    ground: { grass: '#c9b86a', grass2: '#bdac5e', path: '#f3e6bd', path2: '#e0d09f', accent: '#a8964a', sky: '#f1e6bf' } },
};

// Every theme a player can pick, in the order of the picker. `unlock` kinds: free · rank (name) · wave (best wave) ·
// prestige (level) · streak (best daily streak) · event (played that seasonal event, or it is on now).
export const THEME_CATALOG = [
  { id: null,          name: 'Oak & Gold',       blurb: 'The default look: oak, stone and gold trim.', unlock: { kind: 'free' }, swatch: ['#2a211b', '#4d3c30', '#f2b33d'] },
  { id: 'dawnstone',   name: 'Dawnstone',        blurb: 'Warm sandstone, a golden meadow and drifting dust in morning light.', unlock: { kind: 'free' } },
  { id: 'crimson',     name: 'Crimson Banner',   blurb: 'Heraldic red and gold, like the banners on the walls.', unlock: { kind: 'free' } },
  { id: 'emerald',     name: 'Emerald Marches',  blurb: 'Deep forest greens, a lush battlefield and falling leaves.', unlock: { kind: 'wave', wave: 15 } },
  { id: 'stormwatch',  name: 'Stormwatch',       blurb: 'Slate skies and rain lashing the battlements.', unlock: { kind: 'streak', days: 7 } },
  { id: 'moonlit',     name: 'Moonlit Keep',     blurb: 'A night siege under the moon, with fireflies over the field.', unlock: { kind: 'wave', wave: 25 } },
  { id: 'ironclad',    name: 'Ironclad',         blurb: 'Cold steel, gray stone and forge sparks.', unlock: { kind: 'rank', rank: 'Captain' } },
  { id: 'dragonforge', name: 'Dragonforge',      blurb: 'Black iron and molten orange. Embers drift up from the forge.', unlock: { kind: 'rank', rank: 'Baron' } },
  { id: 'royalcourt',  name: 'Royal Court',      blurb: 'Royal purple and gold for the first of your line.', unlock: { kind: 'prestige', level: 1 } },
  { id: 'starforged',  name: 'Starforged Throne', blurb: 'A cosmic night sky of silver and indigo.', unlock: { kind: 'prestige', level: 3 } },
  { id: 'eternal',     name: 'Eternal Dynasty',  blurb: 'White gold on charcoal. For rulers whose line has no end.', unlock: { kind: 'prestige', level: 5 } },
  { id: 'hearts',      name: 'Heartfire',        blurb: 'Seasonal: hearts over the battlements.', unlock: { kind: 'event', id: 'heartfire' }, seasonal: true },
  { id: 'spring',      name: 'Bloomtide',        blurb: 'Seasonal: petals on the wind.', unlock: { kind: 'event', id: 'bloomtide' }, seasonal: true },
  { id: 'summer',      name: 'Sunfest',          blurb: 'Seasonal: long days and fireworks.', unlock: { kind: 'event', id: 'sunfest' }, seasonal: true },
  { id: 'halloween',   name: 'Haunted Siege',    blurb: 'Seasonal: bats and a purple night.', unlock: { kind: 'event', id: 'haunt' }, seasonal: true },
  { id: 'harvest',     name: 'Harvest Feast',    blurb: 'Seasonal: gold leaves and full granaries.', unlock: { kind: 'event', id: 'harvest' }, seasonal: true },
  { id: 'winter',      name: 'Frostfair',        blurb: 'Seasonal: snow on the walls.', unlock: { kind: 'event', id: 'frostfair' }, seasonal: true },
];

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
// Thresholds are about 4x the original curve so climbing takes a lot more play time (a decent run pays roughly 100-200 Renown).
export const RANKS = [
  { at: 0, name: 'Recruit' }, { at: 400, name: 'Footman' }, { at: 1200, name: 'Sergeant' }, { at: 3000, name: 'Lieutenant' },
  { at: 6500, name: 'Captain' }, { at: 13000, name: 'Knight-Captain' }, { at: 26000, name: 'Banneret' }, { at: 50000, name: 'Baron' },
  { at: 100000, name: 'Count' }, { at: 200000, name: 'Duke' }, { at: 400000, name: 'Grand Marshal' },
  // Beyond Grand Marshal: the ranks of a ruling line. Each pays a Renown gift when reached (RANK_REWARDS in prestige.js).
  { at: 600000, name: 'Lord Protector' }, { at: 850000, name: 'Archduke' }, { at: 1200000, name: 'Prince Regent' },
  { at: 1700000, name: 'High King' }, { at: 2400000, name: 'Emperor' }, { at: 3500000, name: 'Eternal Sovereign' },
];
