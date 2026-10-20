// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

/// Trackpad haptic feedback (macOS Force Touch trackpads). A no-op elsewhere.
///
/// Sync commands run on the main thread, which AppKit expects.
#[tauri::command]
fn haptic(pattern: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;
        use objc2::{class, msg_send};
        // NSHapticFeedbackPattern: Generic = 0, Alignment = 1, LevelChange = 2
        let pattern: isize = match pattern.as_deref() {
            Some("generic") => 0,
            Some("alignment") => 1,
            _ => 2,
        };
        // NSHapticFeedbackPerformanceTime: Default = 0, Now = 1, DrawCompleted = 2
        let now: usize = 1;
        unsafe {
            let performer: *mut AnyObject =
                msg_send![class!(NSHapticFeedbackManager), defaultPerformer];
            if !performer.is_null() {
                let _: () =
                    msg_send![performer, performFeedbackPattern: pattern, performanceTime: now];
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = pattern;
}

/// Where progress is saved: ~/Library/Application Support/se.tonestruments.nadilo/progress.json on macOS.
/// It sits outside the app, so reinstalling or updating never touches it, and the dev build shares it.
fn progress_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("progress.json"))
}

/// The saved progress (JSON), or None before anything has been saved.
#[tauri::command]
async fn load_progress(app: tauri::AppHandle) -> Option<String> {
    std::fs::read_to_string(progress_path(&app)?).ok()
}

/// Saves progress (JSON). Written to a temporary file and renamed into place, so a crash mid-write never leaves
/// half a file behind.
#[tauri::command]
async fn save_progress(app: tauri::AppHandle, data: String) -> Result<(), String> {
    if data.len() > 1_000_000 {
        return Err("progress is unexpectedly large".into());
    }
    let path = progress_path(&app).ok_or("no app data directory")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            haptic,
            load_progress,
            save_progress
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nadilo");
}
