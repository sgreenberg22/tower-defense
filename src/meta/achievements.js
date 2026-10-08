// 48 achievements. check(p, run) gets the profile (lifetime stats already merged) and the last run summary (may be null).

const L = (p) => p.stats;
const best = (p) => Math.max(0, ...Object.values(p.best.wave || {}));

export const ACHIEVEMENTS = [
  // Progress
  { id: 'first_blood', name: 'First Blood', desc: 'Defeat your first enemy.', check: (p) => L(p).kills >= 1 },
  { id: 'wave10', name: 'Holding the Line', desc: 'Reach wave 10.', check: (p) => best(p) >= 10, reward: { title: 'Sentry' } },
  { id: 'wave25', name: 'Quarter Century', desc: 'Reach wave 25.', check: (p) => best(p) >= 25, reward: { cosmetic: 'castle:royal', title: 'Castellan' } },
  { id: 'wave50', name: 'Unbroken', desc: 'Reach wave 50.', check: (p) => best(p) >= 50, reward: { title: 'Warden' } },
  { id: 'wave75', name: 'The Long Siege', desc: 'Reach wave 75.', check: (p) => best(p) >= 75, reward: { cosmetic: 'skin:marble' } },
  { id: 'wave100', name: 'Centurion', desc: 'Reach wave 100.', check: (p) => best(p) >= 100, reward: { cosmetic: 'castle:gold', title: 'Centurion' } },
  { id: 'wave150', name: 'Legend of the Keep', desc: 'Reach wave 150.', check: (p) => best(p) >= 150, reward: { title: 'Living Legend' } },
  // Kills
  { id: 'kills100', name: 'Skirmisher', desc: 'Defeat 100 enemies.', check: (p) => L(p).kills >= 100 },
  { id: 'kills1k', name: 'Veteran', desc: 'Defeat 1,000 enemies.', check: (p) => L(p).kills >= 1000 },
  { id: 'kills10k', name: 'Scourge of Armies', desc: 'Defeat 10,000 enemies.', check: (p) => L(p).kills >= 10000, reward: { cosmetic: 'kill:confetti' } },
  { id: 'kills100k', name: 'Endless Tide', desc: 'Defeat 100,000 enemies.', check: (p) => L(p).kills >= 100000, reward: { title: 'Tidebreaker' } },
  // Hero
  { id: 'hero50', name: 'Steady Aim', desc: 'Get 50 kills with your own weapon.', check: (p) => L(p).heroKills >= 50 },
  { id: 'hero500', name: 'Marksman', desc: 'Get 500 kills with your own weapon.', check: (p) => L(p).heroKills >= 500, reward: { cosmetic: 'trail:ember' } },
  { id: 'hero5000', name: 'Legendary Archer', desc: 'Get 5,000 kills with your own weapon.', check: (p) => L(p).heroKills >= 5000, reward: { title: 'Eagle Eye' } },
  { id: 'headshot1', name: 'Right Between the Eyes', desc: 'Land a headshot.', check: (p) => L(p).headshots >= 1 },
  { id: 'headshot100', name: 'Headhunter', desc: 'Land 100 headshots.', check: (p) => L(p).headshots >= 100, reward: { cosmetic: 'trail:frost' } },
  { id: 'combo10', name: 'On a Roll', desc: 'Reach a 10-hit combo.', check: (p) => L(p).maxCombo >= 10 },
  { id: 'combo25', name: 'Unstoppable', desc: 'Reach a 25-hit combo.', check: (p) => L(p).maxCombo >= 25, reward: { cosmetic: 'castle:candy' } },
  { id: 'combo50', name: 'Arrow Storm', desc: 'Reach a 50-hit combo.', check: (p) => L(p).maxCombo >= 50, reward: { cosmetic: 'trail:rainbow', title: 'Stormcaller' } },
  { id: 'accuracy', name: 'Sharpshooter', desc: 'Finish a run with 90%+ accuracy over 100+ shots.', check: (p, r) => r && r.shots >= 100 && r.hits / r.shots >= 0.9 },
  // Bosses
  { id: 'boss1', name: 'Giant Slayer', desc: 'Defeat a boss.', check: (p) => L(p).bossKills >= 1 },
  { id: 'boss10', name: 'Boss Hunter', desc: 'Defeat 10 bosses.', check: (p) => L(p).bossKills >= 10, reward: { cosmetic: 'castle:obsidian' } },
  { id: 'boss50', name: 'Bane of Tyrants', desc: 'Defeat 50 bosses.', check: (p) => L(p).bossKills >= 50, reward: { title: 'Tyrantbane' } },
  { id: 'dragon', name: 'Dragonfall', desc: 'Defeat the Ember Dragon.', check: (p) => (L(p).killsByType.dragon || 0) >= 1 },
  { id: 'lich', name: 'Lay to Rest', desc: 'Defeat the Lich.', check: (p) => (L(p).killsByType.lich || 0) >= 1 },
  // Building
  { id: 'build50', name: 'Architect', desc: 'Build 50 towers.', check: (p) => L(p).towersBuilt >= 50 },
  { id: 'build500', name: 'Master Builder', desc: 'Build 500 towers.', check: (p) => L(p).towersBuilt >= 500, reward: { cosmetic: 'skin:ironwood' } },
  { id: 'spec1', name: 'Specialist', desc: 'Choose a tier-5 specialization.', check: (p) => (p.specsSeen || []).length >= 1 },
  { id: 'spec10', name: 'Grand Strategist', desc: 'Use 10 different specializations.', check: (p) => (p.specsSeen || []).length >= 10, reward: { title: 'Strategist' } },
  { id: 'mastery5', name: 'Five Stars', desc: 'Raise a tower to Mastery ★5.', check: (p, r) => (L(p).maxMastery || 0) >= 5 },
  { id: 'mint', name: 'Coin Counter', desc: 'Earn 1,000 gold from Mints in one run.', check: (p, r) => r && r.mintGold >= 1000 },
  { id: 'hoard', name: 'Dragon\'s Hoard', desc: 'Hold 2,000 gold at once.', check: (p, r) => r && r.peakGold >= 2000 },
  { id: 'spender', name: 'Big Spender', desc: 'Spend 20,000 gold in one run.', check: (p, r) => r && r.goldSpent >= 20000 },
  // Challenge
  { id: 'flawless10', name: 'Not a Scratch', desc: 'Clear 10 waves in a row without a leak.', check: (p) => (L(p).maxFlawlessStreak || 0) >= 10, reward: { cosmetic: 'kill:sparkle' } },
  { id: 'norepair', name: 'Unbreakable', desc: 'Reach wave 20 with No Repairs on.', check: (p, r) => r && r.modifiers.includes('norepair') && r.wave >= 20 },
  { id: 'fog', name: 'Through the Fog', desc: 'Reach wave 20 with Fog of War on.', check: (p, r) => r && r.modifiers.includes('fog') && r.wave >= 20 },
  { id: 'lonetowers', name: 'Thin Red Line', desc: 'Reach wave 10 having built at most 4 towers.', check: (p, r) => r && r.wave >= 10 && r.towersBuilt <= 4 },
  { id: 'pacifist', name: 'Hands Off', desc: 'Reach wave 15 without firing your weapon.', check: (p, r) => r && r.wave >= 15 && r.shots === 0 },
  { id: 'asc1', name: 'Ascendant', desc: 'Reach the goal wave (25) on Ascension 1.', check: (p) => (p.maxAscCleared || 0) >= 1 },
  { id: 'asc5', name: 'High Ascendant', desc: 'Reach the goal wave (45) on Ascension 5.', check: (p) => (p.maxAscCleared || 0) >= 5, reward: { cosmetic: 'trail:starlight', title: 'Ascendant' } },
  { id: 'asc10', name: 'Apex', desc: 'Reach the goal wave (70) on Ascension 10.', check: (p) => (p.maxAscCleared || 0) >= 10, reward: { title: 'Apex' } },
  { id: 'frontier30', name: 'Pathfinder', desc: 'Reach wave 30 on The Frontier.', check: (p) => (p.best.wave.frontier || 0) >= 30 },
  { id: 'allmaps', name: 'Cartographer', desc: 'Reach wave 30 on every map.', check: (p) => ['meadow', 'twin', 'cross', 'frontier'].every((m) => (p.best.wave[m] || 0) >= 30), reward: { title: 'Cartographer' } },
  // Daily & social
  { id: 'daily1', name: 'Daily Duty', desc: 'Play a Daily Challenge.', check: (p) => Object.keys(p.daily || {}).length >= 1 },
  { id: 'daily7', name: 'Week of Watch', desc: 'Play 7 Daily Challenges.', check: (p) => Object.keys(p.daily || {}).length >= 7, reward: { cosmetic: 'kill:pixels' } },
  { id: 'friend', name: 'Brothers in Arms', desc: 'Add a friend.', check: (p) => (p.social?.friends || 0) >= 1 },
  { id: 'gift', name: 'Supply Line', desc: 'Send a gift or reinforcement.', check: (p) => (p.social?.giftsSent || 0) >= 1 },
  { id: 'clan', name: 'Banner Bearer', desc: 'Join a clan.', check: (p) => !!p.social?.clan, reward: { title: 'Bannerman' } },
  { id: 'siege', name: 'Answer the Call', desc: 'Contribute to a world Siege.', check: (p) => (p.social?.siegeDamage || 0) > 0 },
  { id: 'challenge', name: 'Gauntlet Thrown', desc: 'Send a friend challenge.', check: (p) => (p.social?.challengesSent || 0) >= 1 },
];

export const COSMETICS = {
  castle: { stone: 'Stone Keep', royal: 'Royal White', obsidian: 'Obsidian Hold', candy: 'Candy Citadel', gold: 'Golden Bastion' },
  trail: { none: 'No trail', ember: 'Ember', frost: 'Frostfire', rainbow: 'Rainbow', starlight: 'Starlight' },
  kill: { poof: 'Poof', confetti: 'Confetti', sparkle: 'Sparkle', pixels: 'Pixel Burst' },
  skin: { classic: 'Classic Stone', marble: 'Marble', ironwood: 'Ironwood' },
};
export const DEFAULT_COSMETICS = ['castle:stone', 'trail:none', 'kill:poof', 'skin:classic'];

export function cosmeticSource(key) {
  const a = ACHIEVEMENTS.find((x) => x.reward?.cosmetic === key);
  return a ? a.name : null;
}
