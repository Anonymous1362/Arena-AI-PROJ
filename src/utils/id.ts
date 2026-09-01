/** Collision-resistant id generator (no external dep, works on JSI-less Hermes too). */
export function uid(prefix = ''): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}${t}${r}`;
}
