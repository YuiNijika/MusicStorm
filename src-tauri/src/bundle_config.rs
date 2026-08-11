//! Validate shipped Tauri bundle configuration for macOS packaging.
//!
//! These helpers read the real `tauri.conf.json` next to this crate so CI and
//! local tests fail if DMG / minimum system version settings regress.

use serde_json::Value;
use std::path::{Path, PathBuf};

const SHIPPED_MIN_MACOS: &str = "13.0";

/// Resolve the path to the shipped `tauri.conf.json` for this crate.
pub fn tauri_conf_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json")
}

/// Load and parse the shipped Tauri configuration as JSON.
pub fn load_tauri_conf(path: &Path) -> Result<Value, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("read {}: {error}", path.display()))?;
    serde_json::from_str(&raw).map_err(|error| format!("parse {}: {error}", path.display()))
}

/// Return true when bundle targets include DMG (explicit list or `"all"`).
pub fn targets_include_dmg(targets: &Value) -> bool {
    match targets {
        Value::String(s) if s.eq_ignore_ascii_case("all") => true,
        Value::String(s) if s.eq_ignore_ascii_case("dmg") => true,
        Value::Array(items) => items.iter().any(|item| {
            item.as_str()
                .is_some_and(|s| s.eq_ignore_ascii_case("dmg") || s.eq_ignore_ascii_case("all"))
        }),
        _ => false,
    }
}

/// Extract the configured macOS minimum system version string.
pub fn macos_minimum_system_version(conf: &Value) -> Option<&str> {
    conf.pointer("/bundle/macOS/minimumSystemVersion")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// Return true when the macOS DMG layout block is present under bundle.macOS.
pub fn has_macos_dmg_config(conf: &Value) -> bool {
    conf.pointer("/bundle/macOS/dmg").is_some_and(Value::is_object)
}

/// Validate the shipped configuration requirements for this packaging step.
pub fn validate_macos_packaging_config(conf: &Value) -> Result<(), String> {
    let targets = conf
        .pointer("/bundle/targets")
        .ok_or_else(|| "bundle.targets is missing".to_string())?;
    if !targets_include_dmg(targets) {
        return Err(format!(
            "bundle.targets must include dmg (or \"all\"), got: {targets}"
        ));
    }

    let min = macos_minimum_system_version(conf).ok_or_else(|| {
        "bundle.macOS.minimumSystemVersion must be a non-empty string".to_string()
    })?;
    // Reject accidental empty/placeholder values; require major.minor style.
    if !min
        .split('.')
        .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
    {
        return Err(format!(
            "bundle.macOS.minimumSystemVersion looks invalid: {min:?}"
        ));
    }

    if !has_macos_dmg_config(conf) {
        return Err("bundle.macOS.dmg object is required".to_string());
    }

    Ok(())
}

/// Load and validate the crate's shipped `tauri.conf.json`.
///
/// Kept as a library entry point so the helpers stay reachable outside tests
/// and package configuration regressions surface in normal `cargo test --lib`.
pub fn assert_shipped_macos_packaging_config() -> Result<(), String> {
    let path = tauri_conf_path();
    let conf = load_tauri_conf(&path)?;
    validate_macos_packaging_config(&conf)?;
    let min = macos_minimum_system_version(&conf)
        .ok_or_else(|| "minimumSystemVersion missing after validation".to_string())?;
    if min != SHIPPED_MIN_MACOS {
        return Err(format!(
            "expected minimumSystemVersion {SHIPPED_MIN_MACOS}, got {min}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shipped_tauri_conf_enables_macos_dmg_packaging() {
        assert_shipped_macos_packaging_config().expect("macOS packaging config");
        let conf = load_tauri_conf(&tauri_conf_path()).expect("load tauri.conf.json");
        assert!(has_macos_dmg_config(&conf));
        assert!(targets_include_dmg(
            conf.pointer("/bundle/targets").expect("targets")
        ));
        assert_eq!(
            macos_minimum_system_version(&conf).expect("min"),
            SHIPPED_MIN_MACOS
        );
    }

    #[test]
    fn targets_include_dmg_accepts_all_and_lists() {
        assert!(targets_include_dmg(&json!("all")));
        assert!(targets_include_dmg(&json!("dmg")));
        assert!(targets_include_dmg(&json!(["app", "dmg"])));
        assert!(!targets_include_dmg(&json!("app")));
        assert!(!targets_include_dmg(&json!(["app", "nsis"])));
    }

    #[test]
    fn validate_rejects_missing_minimum_version() {
        let conf = json!({
            "bundle": {
                "targets": "all",
                "macOS": {
                    "dmg": { "windowSize": { "width": 660, "height": 400 } }
                }
            }
        });
        let err = validate_macos_packaging_config(&conf).unwrap_err();
        assert!(err.contains("minimumSystemVersion"), "{err}");
    }

    #[test]
    fn macos_ci_builds_universal_app_and_dmg() {
        // Workflow lives at repo root; CARGO_MANIFEST_DIR is src-tauri/.
        let workflow = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../.github/workflows/macos.yml");
        let raw = std::fs::read_to_string(&workflow)
            .unwrap_or_else(|e| panic!("read {}: {e}", workflow.display()));
        assert!(
            raw.contains("universal-apple-darwin"),
            "macos.yml must build universal-apple-darwin"
        );
        assert!(
            raw.contains("x86_64-apple-darwin") && raw.contains("aarch64-apple-darwin"),
            "macos.yml must install both Apple Rust targets"
        );
        assert!(
            raw.contains("--bundles app,dmg") || raw.contains("--bundles app, dmg"),
            "macos.yml must build app and dmg bundles"
        );
    }
}
