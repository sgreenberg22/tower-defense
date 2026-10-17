// Shared navigation for related screens, so the home page needs one door for each group instead of one per screen.
import { h } from './dom.js';

// The Collection: everything you have earned or learned, in one row of tabs that every member screen shows.
export const COLLECTION = [['ach', '🏆 Achievements'], ['ward', '🧝 Wardrobe'], ['theme', '🎨 Themes'], ['beast', '👹 Bestiary'], ['codex', '📚 Codex'], ['stats', '📖 Chronicle']];

export function collectionBar(app, active) {
  const go = { ach: () => app.showAchievements('ach'), ward: () => app.showAchievements('ward'), theme: () => app.showAchievements('theme'), beast: () => app.showAchievements('beast'), codex: () => app.showCodex(), stats: () => app.showStats() };
  return h('div', { class: 'tabs hub-tabs', role: 'tablist', 'aria-label': 'Collection' },
    COLLECTION.map(([id, label]) => h('button', { class: 'btn small', role: 'tab', 'aria-selected': String(active === id), onclick: () => { if (active !== id) go[id](); } }, label)));
}
