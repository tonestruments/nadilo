// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { inTauri, invoke } from './tauri';

/** Trackpad haptics on macOS (Force Touch). A no-op in the browser and on other platforms. */
export type HapticPattern = 'generic' | 'alignment' | 'levelChange';

export async function haptic(pattern: HapticPattern = 'generic') {
  if (!inTauri()) return;
  try {
    await invoke('haptic', { pattern });
  } catch {
    // Haptics are a nicety; never let them break the game.
  }
}
