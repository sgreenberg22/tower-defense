// Plural of a unit or foe name for display ("Harpy" -> "Harpies", "Cavalry" stays "Cavalry").
export function plural(name) {
  const n = String(name);
  if (/(^|\s)cavalry$/i.test(n) || /(^|\s)sanctum$/i.test(n)) return n;
  if (/thief$/i.test(n)) return n.slice(0, -2) + 'eves';
  if (/[^aeiou]y$/i.test(n)) return n.slice(0, -1) + 'ies';
  if (/(s|x|ch|sh)$/i.test(n)) return n + 'es';
  return n + 's';
}
