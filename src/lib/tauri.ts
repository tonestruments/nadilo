// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

/** True inside the desktop app; false in a plain browser (npm run dev, and the end-to-end tests). */
export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Calls one of the app's own Rust commands (src-tauri/src/lib.rs). Only call it when `inTauri()`. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
