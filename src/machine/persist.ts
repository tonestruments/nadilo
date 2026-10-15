import { inTauri, invoke } from '../lib/tauri';
import { savedSchool, sanitizeSchool } from '../school/rules';
import { DEFAULTS, type LevelRecord, type Persisted } from './appMachine';

/**
 * What survives a restart. In the Mac app it is a file,
 * ~/Library/Application Support/se.tonestruments.nadilo/progress.json: reinstalling or updating the app never
 * touches it, Time Machine backs it up, and the dev build and the installed app share it. localStorage keeps a
 * copy, and is the only store in a plain browser (npm run dev, and the end-to-end tests).
 */
const KEY = 'nadilo';
/**
 * Still 5, so Nadilo 0.3.x, which rejects any other version, can read a file this build wrote. School is saved as
 * `rebuild`; `school` keeps 0.3.x's own School exactly as it was read, so that build still finds it. Since 0.4.2,
 * `rebuild` also holds the player's own song (`own`), today's twist and the sampler, which 0.4.1 ignores, and its
 * `level` is still an index into the rebuilding levels only (the exact level is `levelId`), so 0.4.1 opens the right one.
 */
const VERSION = 5;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const storage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // private windows and blocked site data throw on access
  }
};

/** Reads saved progress from its JSON: this version, an older one, or nothing usable ({}). */
export function parsePersisted(raw: string | null | undefined): Partial<Persisted> {
  try {
    if (!raw) return {};
    const data = JSON.parse(raw);
    // v1/v2 were written by the old zustand store as { state, version }.
    if (data && typeof data === 'object' && 'state' in data) {
      const s = data.state ?? {};
      const reordered = (data.version ?? 0) < 2; // v2 reordered levels 1–3, so older level numbers are meaningless
      return {
        onboarded: !!s.onboarded,
        cues: s.cues !== false,
        solved: reordered ? [] : sanitizeIds(s.solved),
        levelIdx: reordered ? 0 : Number(s.levelIdx) || 0,
      };
    }
    // v3 is v4 without the per-level records; v4 is v5 without School.
    if (data?.v !== VERSION && data?.v !== 4 && data?.v !== 3) return {};
    return {
      onboarded: !!data.onboarded,
      cues: data.cues !== false,
      solved: sanitizeIds(data.solved),
      levelIdx: Number(data.levelIdx) || 0,
      syncOffsetMs: Number(data.syncOffsetMs) || 0,
      records: sanitizeRecords(data.records),
      ...(data.rebuild ? { school: sanitizeSchool(data.rebuild) } : {}),
      ...(data.school !== undefined ? { legacySchool: data.school } : {}),
    };
  } catch {
    return {};
  }
}

export function serializePersisted(p: Persisted): string {
  const { school, legacySchool, ...rest } = pick(p);
  return JSON.stringify({ v: VERSION, ...rest, ...(legacySchool !== undefined ? { school: legacySchool } : {}), rebuild: savedSchool(school) });
}

export function loadPersisted(store: StorageLike | null = storage()): Partial<Persisted> {
  try {
    return parsePersisted(store?.getItem(KEY));
  } catch {
    return {};
  }
}

export function savePersisted(p: Persisted, store: StorageLike | null = storage()) {
  try {
    store?.setItem(KEY, serializePersisted(p));
  } catch {
    // Saving progress is best effort.
  }
}

const readProgressFile = async (): Promise<string | null> => (inTauri() ? invoke<string | null>('load_progress') : null);

/**
 * The file and localStorage, combined. Every save writes both, so normally they are the same. They differ on the
 * first run with the file (there is none yet), or when the dev build and the installed app, which keep separate
 * localStorage, both wrote the one file. Neither copy may lose a solved level: those are combined, and the copy with
 * more of them decides everything else (settings, where you were). A tie goes to the file.
 */
export function mergeProgress(file: Partial<Persisted>, local: Partial<Persisted>): Partial<Persisted> {
  if (!Object.keys(file).length) return local;
  if (!Object.keys(local).length) return file;
  const [main, other] = (local.solved?.length ?? 0) > (file.solved?.length ?? 0) ? [local, file] : [file, local];
  // School is one build, so it cannot be merged note by note: the copy further along wins (a tie goes to the file).
  const school = (local.school?.done.length ?? -1) > (file.school?.done.length ?? -1) ? local.school : file.school ?? local.school;
  const legacySchool = file.legacySchool !== undefined ? file.legacySchool : local.legacySchool;
  return {
    ...main,
    onboarded: !!(main.onboarded || other.onboarded),
    solved: [...new Set([...(main.solved ?? []), ...(other.solved ?? [])])],
    records: { ...other.records, ...main.records },
    ...(school ? { school } : {}),
    ...(legacySchool !== undefined ? { legacySchool } : {}),
  };
}

/** Progress at start-up, from the file (in the Mac app) and localStorage. */
export async function loadProgress(
  readFile: () => Promise<string | null> = readProgressFile,
  store: StorageLike | null = storage(),
): Promise<Partial<Persisted>> {
  const fromFile = parsePersisted(await readFile().catch(() => null));
  return mergeProgress(fromFile, loadPersisted(store));
}

let writes: Promise<unknown> = Promise.resolve();
let fileTimer: ReturnType<typeof setTimeout> | null = null;
let fileData: string | null = null;

/** Writes the newest progress to the file, in order with any write still running. */
function flushFile() {
  if (fileTimer) clearTimeout(fileTimer);
  fileTimer = null;
  if (fileData === null) return;
  const data = fileData;
  fileData = null;
  writes = writes.then(() => invoke('save_progress', { data })).catch(() => {
    // Best effort, like localStorage: the next change writes the whole file again.
  });
}
if (typeof addEventListener !== 'undefined') addEventListener('pagehide', flushFile);

/**
 * Saves to localStorage at once and, in the Mac app, to the file a moment later: dragging the tempo slider changes
 * the track many times a second, and only the last of those needs to reach the disk.
 */
export function saveProgress(p: Persisted, store: StorageLike | null = storage()) {
  savePersisted(p, store);
  if (!inTauri()) return;
  fileData = serializePersisted(p);
  if (fileTimer) clearTimeout(fileTimer);
  fileTimer = setTimeout(flushFile, 300);
}

export const pick = (p: Persisted): Persisted => ({
  onboarded: p.onboarded, cues: p.cues, solved: p.solved, levelIdx: p.levelIdx, syncOffsetMs: p.syncOffsetMs, records: p.records,
  school: p.school, ...(p.legacySchool !== undefined ? { legacySchool: p.legacySchool } : {}),
});

const sanitizeIds = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n) => Number.isInteger(n)) : DEFAULTS.solved);

function sanitizeRecords(x: unknown): Record<number, LevelRecord> {
  const out: Record<number, LevelRecord> = {};
  if (!x || typeof x !== 'object') return out;
  for (const [key, value] of Object.entries(x)) {
    const id = Number(key);
    const r = value as Partial<LevelRecord> | null;
    if (!Number.isInteger(id) || !r || typeof r !== 'object') continue;
    if (!Number.isInteger(r.checks) || r.checks! < 1) continue;
    out[id] = { checks: r.checks!, on: typeof r.on === 'string' ? r.on : '', ...(r.peeked === true ? { peeked: true } : {}) };
  }
  return out;
}
