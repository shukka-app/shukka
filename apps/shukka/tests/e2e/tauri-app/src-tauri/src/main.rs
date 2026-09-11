//! Headless Tauri app: check the Shukka feed and download (verify signature).
//! Does not install. Mirrors tests/e2e/client for electron-updater.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

fn required(name: &str) -> String {
  std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}

fn write_result(path: &str, body: &Value) {
  if let Some(parent) = PathBuf::from(path).parent() {
    let _ = fs::create_dir_all(parent);
  }
  fs::write(path, format!("{}\n", serde_json::to_string_pretty(body).unwrap())).unwrap();
}

async fn run_updater(app: &tauri::AppHandle) -> Value {
  let feed = required("E2E_FEED_URL");
  let pubkey = required("E2E_PUBKEY");
  let expect = std::env::var("E2E_EXPECT_VERSION").ok();

  let updater = match app
    .updater_builder()
    .pubkey(pubkey)
    .endpoints(vec![Url::parse(&feed).expect("E2E_FEED_URL")])
    .and_then(|builder| builder.build())
  {
    Ok(updater) => updater,
    Err(error) => {
      return json!({ "ok": false, "stage": "build", "error": error.to_string() });
    }
  };

  let update = match updater.check().await {
    Ok(Some(update)) => update,
    Ok(None) => {
      return json!({ "ok": false, "stage": "check", "error": "check() returned no update" });
    }
    Err(error) => {
      return json!({ "ok": false, "stage": "check", "error": error.to_string() });
    }
  };

  if let Some(expected) = expect {
    if update.version != expected {
      return json!({
        "ok": false,
        "stage": "check",
        "error": format!("updater offered {}, expected {}", update.version, expected),
        "version": update.version,
      });
    }
  }

  match update.download(|_, _| {}, || {}).await {
    Ok(bytes) => json!({
      "ok": true,
      "stage": "download",
      "version": update.version,
      "target": update.target,
      "bytes": bytes.len(),
    }),
    Err(error) => json!({
      "ok": false,
      "stage": "download",
      "error": error.to_string(),
      "version": update.version,
    }),
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let result_path = required("E2E_RESULT");
        let result = run_updater(&handle).await;
        write_result(&result_path, &result);
        handle.exit(if result["ok"] == true { 0 } else { 1 });
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
