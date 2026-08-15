import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js?v=76';

export const NAME_KEY = 'pumprun_name';
const BEST_LEGACY = 'pumprun_best';
export const BEST_KEY = 'pumprun_best_v2';

const BANNED = new Set([
  'admin', 'nigger', 'nigga', 'faggot', 'fuck', 'shit', 'asshole', 'rape',
  'hitler', 'nazi', 'kike', 'chink', 'spic', 'retard',
]);

export function resetLegacyBest() {
  try {
    localStorage.removeItem(BEST_LEGACY);
  } catch {
    /* private mode */
  }
}

export function loadBest() {
  resetLegacyBest();
  const n = Number(localStorage.getItem(BEST_KEY) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function saveBest(n) {
  const v = Math.max(0, Math.floor(n));
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

export function getUsername() {
  try {
    return String(localStorage.getItem(NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setUsername(raw) {
  const v = sanitizeName(raw);
  if (!v.ok) return v;
  try {
    localStorage.setItem(NAME_KEY, v.name);
  } catch {
    /* ignore */
  }
  return v;
}

export function sanitizeName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, '_');
  if (name.length < 3 || name.length > 16) return { ok: false, error: '3–16 letters, numbers, _ or -' };
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, error: 'letters, numbers, _ or - only' };
  if (BANNED.has(name.toLowerCase())) return { ok: false, error: 'pick another name' };
  return { ok: true, name };
}

export function boardReady() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('https://'));
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function fetchBoard(limit = 40) {
  if (!boardReady()) return [];
  const url = `${SUPABASE_URL}/rest/v1/scores?select=username,distance,bags,character,created_at&order=distance.desc,created_at.asc&limit=${limit}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`board ${res.status}`);
  return res.json();
}

export async function fetchStanding(username) {
  if (!boardReady() || !username) return { best: 0, bags: 0, rank: null };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/player_standing`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_username: username }),
  });
  if (!res.ok) return { best: 0, bags: 0, rank: null };
  return res.json();
}

export async function submitRun({ username, distance, bags, character }) {
  if (!boardReady()) return { ok: false, skipped: true };
  const name = sanitizeName(username);
  if (!name.ok) return { ok: false, error: name.error };
  const d = Math.floor(Number(distance) || 0);
  const b = Math.floor(Number(bags) || 0);
  if (d < 10) return { ok: false, skipped: true, error: 'too short' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      p_username: name.name,
      p_distance: d,
      p_bags: b,
      p_character: String(character || '').slice(0, 24),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t || `submit ${res.status}` };
  }
  return res.json();
}
