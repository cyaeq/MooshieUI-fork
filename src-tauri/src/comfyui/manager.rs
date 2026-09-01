use std::path::{Path, PathBuf};

/// Keys MooshieUI owns inside Manager's `[default]` section. The two install
/// flags are what the Node Manager permission switch actually controls;
/// upstream gates them on `flag AND a loopback --listen` at request time.
const POLICY_KEYS: [&str; 3] = [
    "security_level",
    "allow_git_url_install",
    "allow_pip_install",
];

/// `security_level` stays `normal` in both modes: upstream decoupled the two
/// direct install endpoints from it, and going lower would additionally unlock
/// unregistered non-safetensors model downloads, which this switch is not about.
fn policy_values(relaxed: bool) -> [&'static str; 3] {
    if relaxed {
        ["normal", "true", "true"]
    } else {
        ["normal", "false", "false"]
    }
}

/// `network_mode` is unrelated to install permissions, so MooshieUI leaves any
/// valid user choice alone and only repairs values Manager cannot interpret
/// (older MooshieUI builds wrote a bogus `personal_cloud` here).
const NETWORK_MODE_KEY: &str = "network_mode";
const VALID_NETWORK_MODES: [&str; 3] = ["public", "private", "offline"];
const DEFAULT_NETWORK_MODE: &str = "public";

fn split_assignment(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
        return None;
    }
    let equals = trimmed.find('=');
    let colon = trimmed.find(':');
    let split = match (equals, colon) {
        (Some(a), Some(b)) => a.min(b),
        (Some(a), None) => a,
        (None, Some(b)) => b,
        (None, None) => return None,
    };
    Some((trimmed[..split].trim(), trimmed[split + 1..].trim()))
}

fn section_name(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    trimmed.strip_prefix('[')?.strip_suffix(']').map(str::trim)
}

fn append_missing_policy(
    output: &mut Vec<String>,
    seen: &[bool; POLICY_KEYS.len()],
    values: &[&str; POLICY_KEYS.len()],
) {
    for (index, key) in POLICY_KEYS.iter().enumerate() {
        if !seen[index] {
            output.push(format!("{} = {}", key, values[index]));
        }
    }
}

fn update_manager_ini(existing: &str, relaxed: bool) -> String {
    let newline = if existing.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let normalized = existing.replace("\r\n", "\n").replace('\r', "\n");
    let values = policy_values(relaxed);
    let mut output = Vec::new();
    let mut seen = [false; POLICY_KEYS.len()];
    let mut found_default = false;
    let mut in_default = false;

    for line in normalized.lines() {
        if let Some(section) = section_name(line) {
            if in_default {
                append_missing_policy(&mut output, &seen, &values);
            }
            in_default = section.eq_ignore_ascii_case("default");
            found_default |= in_default;
            output.push(line.to_string());
            continue;
        }

        if in_default {
            if let Some((key, value)) = split_assignment(line) {
                if let Some(index) = POLICY_KEYS
                    .iter()
                    .position(|candidate| key.eq_ignore_ascii_case(candidate))
                {
                    output.push(format!("{} = {}", POLICY_KEYS[index], values[index]));
                    seen[index] = true;
                    continue;
                }
                if key.eq_ignore_ascii_case(NETWORK_MODE_KEY)
                    && !VALID_NETWORK_MODES
                        .iter()
                        .any(|candidate| value.eq_ignore_ascii_case(candidate))
                {
                    output.push(format!("{} = {}", NETWORK_MODE_KEY, DEFAULT_NETWORK_MODE));
                    continue;
                }
            }
        }
        output.push(line.to_string());
    }

    if in_default {
        append_missing_policy(&mut output, &seen, &values);
    } else if !found_default {
        if output.last().is_some_and(|line| !line.is_empty()) {
            output.push(String::new());
        }
        output.push("[default]".to_string());
        append_missing_policy(&mut output, &seen, &values);
    }

    let mut result = output.join(newline);
    result.push_str(newline);
    result
}

fn configured_user_directory(comfyui_path: &Path, extra_args: &[String]) -> PathBuf {
    for (index, arg) in extra_args.iter().enumerate() {
        let value = if arg == "--user-directory" {
            extra_args.get(index + 1).map(String::as_str)
        } else {
            arg.strip_prefix("--user-directory=")
        };
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            let path = PathBuf::from(value);
            return if path.is_absolute() {
                path
            } else {
                comfyui_path.join(path)
            };
        }
    }
    comfyui_path.join("user")
}

pub fn manager_config_path(comfyui_path: &str, extra_args: &[String]) -> PathBuf {
    configured_user_directory(Path::new(comfyui_path), extra_args)
        .join("__manager")
        .join("config.ini")
}

/// Manager's own `write_config()` rewrites every key, so this policy is not
/// authoritative at runtime; callers re-apply it before each ComfyUI spawn.
pub fn set_manager_security_policy(
    comfyui_path: &str,
    extra_args: &[String],
    relaxed: bool,
) -> Result<PathBuf, String> {
    if comfyui_path.trim().is_empty() {
        return Err("ComfyUI path is empty".to_string());
    }

    let config_path = manager_config_path(comfyui_path, extra_args);
    let existing = match std::fs::read_to_string(&config_path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => {
            return Err(format!(
                "Failed to read Manager config '{}': {}",
                config_path.display(),
                error
            ));
        }
    };
    let updated = update_manager_ini(&existing, relaxed);
    let parent = config_path
        .parent()
        .ok_or_else(|| format!("Invalid Manager config path '{}'", config_path.display()))?;
    std::fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create Manager config directory '{}': {}",
            parent.display(),
            error
        )
    })?;
    std::fs::write(&config_path, updated).map_err(|error| {
        format!(
            "Failed to write Manager config '{}': {}",
            config_path.display(),
            error
        )
    })?;
    Ok(config_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaxed_policy_updates_only_managed_keys() {
        let input = "[default]\r\npreview_method = auto\r\nsecurity_level = strong\r\nnetwork_mode = offline\r\nallow_pip_install = false\r\n\r\n[other]\r\nsecurity_level = strong\r\n";
        let updated = update_manager_ini(input, true);

        assert!(updated.contains("preview_method = auto\r\n"));
        assert!(updated.contains("security_level = normal\r\n"));
        assert!(updated.contains("network_mode = offline\r\n"));
        assert!(updated.contains("allow_git_url_install = true\r\n"));
        assert!(updated.contains("allow_pip_install = true\r\n"));
        assert!(updated.contains("[other]\r\nsecurity_level = strong\r\n"));
    }

    #[test]
    fn secure_policy_creates_default_section() {
        let updated = update_manager_ini("[other]\nvalue = 1\n", false);

        assert!(updated.contains("[default]\n"));
        assert!(updated.contains("security_level = normal\n"));
        assert!(!updated.contains("network_mode"));
        assert!(updated.contains("allow_git_url_install = false\n"));
        assert!(updated.contains("allow_pip_install = false\n"));
    }

    #[test]
    fn invalid_network_mode_is_repaired_to_public() {
        let updated = update_manager_ini("[default]\nnetwork_mode = personal_cloud\n", true);

        assert!(updated.contains("network_mode = public\n"));
        assert!(!updated.contains("personal_cloud"));
    }

    #[test]
    fn custom_user_directory_supports_split_and_equals_args() {
        let comfyui = Path::new("C:/ComfyUI");
        let split = vec!["--user-directory".to_string(), "profiles/user".to_string()];
        let equals = vec!["--user-directory=D:/ComfyUser".to_string()];

        assert_eq!(
            configured_user_directory(comfyui, &split),
            comfyui.join("profiles/user")
        );
        assert_eq!(
            configured_user_directory(comfyui, &equals),
            PathBuf::from("D:/ComfyUser")
        );
    }
}
