use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

// Constants
const ENGLISH: &str = include_str!("../../web/lang/en.lang");
const ENGLISH_CODE: &str = "en";
const EXTENSION: &str = "lang";
const LANGUAGE_DIRECTORY: &str = "lang";
const MAX_FILE_SIZE: u64 = 256 * 1024;
const MAX_CODE_LENGTH: usize = 16;
const RIGHT_TO_LEFT: &str = "rtl";
const SIMPLIFIED_CHINESE: &str = "zh-Hans";
const TRADITIONAL_CHINESE: &str = "zh-Hant";
const TRADITIONAL_CHINESE_REGIONS: [&str; 3] = ["TW", "HK", "MO"];
const CATEGORY_PREFIX: &str = "# Category:";
const STANDARD_CATEGORY: &str = "standard";

pub const LANGUAGE_NAME: &str = "language.name";
pub const LANGUAGE_FALLBACK: &str = "language.fallback";
pub const LANGUAGE_DIRECTION: &str = "language.direction";
pub const TRAY_OPEN: &str = "tray.open";
pub const TRAY_QUIT: &str = "tray.quit";

#[cfg(test)]
const KEYS: [&str; 3] = [LANGUAGE_NAME, TRAY_OPEN, TRAY_QUIT];

#[cfg(test)]
const OPTIONAL_KEYS: [&str; 2] = [LANGUAGE_FALLBACK, LANGUAGE_DIRECTION];

// Types
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Language {
    pub code: String,
    pub name: String,
    pub category: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStatus {
    pub code: String,
    pub preference: Option<String>,
    pub automatic: String,
    pub direction: &'static str,
    pub texts: BTreeMap<String, String>,
    pub languages: Vec<Language>,
}

pub struct Translations {
    code: String,
    texts: HashMap<String, String>,
}

// Translations
impl Translations {
    pub fn load(preference: Option<&str>, directories: &[PathBuf]) -> Self {
        let codes = available_codes(directories);
        let code = resolve_code(preference, &preferred_ui_languages(), &codes);
        Self {
            texts: load_texts(&code, directories),
            code,
        }
    }

    pub fn text(&self, key: &str) -> String {
        self.texts
            .get(key)
            .cloned()
            .unwrap_or_else(|| key.to_owned())
    }

    pub fn is_right_to_left(&self) -> bool {
        self.texts
            .get(LANGUAGE_DIRECTION)
            .is_some_and(|direction| direction.eq_ignore_ascii_case(RIGHT_TO_LEFT))
    }
}

pub fn directories(web_root: &Path, config_dir: &Path) -> Vec<PathBuf> {
    vec![
        web_root.join(LANGUAGE_DIRECTORY),
        config_dir.join(LANGUAGE_DIRECTORY),
    ]
}

pub fn status(preference: Option<&str>, directories: &[PathBuf]) -> LanguageStatus {
    let translations = Translations::load(preference, directories);
    let automatic = Translations::load(None, directories).code;
    LanguageStatus {
        direction: if translations.is_right_to_left() {
            RIGHT_TO_LEFT
        } else {
            "ltr"
        },
        preference: preference.map(str::to_owned),
        automatic,
        languages: available_languages(directories),
        texts: translations.texts.into_iter().collect(),
        code: translations.code,
    }
}

pub fn find_language(code: &str, directories: &[PathBuf]) -> Option<String> {
    available_codes(directories)
        .into_iter()
        .find(|candidate| candidate.eq_ignore_ascii_case(code))
}

pub fn available_languages(directories: &[PathBuf]) -> Vec<Language> {
    let mut languages: Vec<Language> = available_codes(directories)
        .into_iter()
        .map(|code| {
            let name = load_texts(&code, directories)
                .remove(LANGUAGE_NAME)
                .unwrap_or_else(|| code.clone());
            let category = read_category(&code, directories);
            Language {
                code,
                name,
                category,
            }
        })
        .collect();
    languages.sort_by_key(|language| language.name.to_lowercase());
    languages
}

fn read_category(code: &str, directories: &[PathBuf]) -> String {
    directories
        .iter()
        .filter_map(|directory| read_file(&directory.join(format!("{code}.{EXTENSION}"))))
        .chain(std::iter::once(ENGLISH.to_owned()).filter(|_| code == ENGLISH_CODE))
        .find_map(|content| {
            content
                .lines()
                .find_map(|line| line.strip_prefix(CATEGORY_PREFIX))
                .map(|category| category.trim().to_lowercase())
        })
        .unwrap_or_else(|| STANDARD_CATEGORY.to_owned())
}

fn load_texts(code: &str, directories: &[PathBuf]) -> HashMap<String, String> {
    let fallback = read_language(code, directories)
        .remove(LANGUAGE_FALLBACK)
        .filter(|fallback| is_valid_code(fallback));
    let mut texts = parse(ENGLISH);
    for code in language_chain(code, fallback.as_deref()) {
        texts.extend(read_language(code, directories));
    }
    texts
}

fn read_language(code: &str, directories: &[PathBuf]) -> HashMap<String, String> {
    let mut texts = HashMap::new();
    for directory in directories {
        if let Some(content) = read_file(&directory.join(format!("{code}.{EXTENSION}"))) {
            texts.extend(parse(&content));
        }
    }
    texts
}

fn language_chain<'a>(code: &'a str, fallback: Option<&'a str>) -> Vec<&'a str> {
    let mut chain = Vec::new();
    let candidates = fallback
        .map(fallback_chain)
        .unwrap_or_default()
        .into_iter()
        .chain(fallback_chain(code));
    for candidate in candidates {
        if !chain
            .iter()
            .any(|known: &&str| known.eq_ignore_ascii_case(candidate))
        {
            chain.push(candidate);
        }
    }
    chain
}

// Languages
fn available_codes(directories: &[PathBuf]) -> Vec<String> {
    let mut codes = vec![ENGLISH_CODE.to_owned()];
    for directory in directories {
        let Ok(files) = fs::read_dir(directory) else {
            continue;
        };
        for file in files.flatten() {
            let path = file.path();
            if !path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case(EXTENSION))
            {
                continue;
            }
            let Some(code) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if is_valid_code(code) && !codes.iter().any(|known| known.eq_ignore_ascii_case(code)) {
                codes.push(code.to_owned());
            }
        }
    }
    codes
}

fn resolve_code(preference: Option<&str>, preferred: &[String], available: &[String]) -> String {
    let find = |code: &str| {
        available
            .iter()
            .find(|candidate| candidate.eq_ignore_ascii_case(code))
            .cloned()
    };
    preference
        .into_iter()
        .chain(preferred.iter().map(String::as_str))
        .find_map(|code| candidates(code).into_iter().find_map(find))
        .unwrap_or_else(|| ENGLISH_CODE.to_owned())
}

fn candidates(code: &str) -> Vec<&str> {
    let mut candidates: Vec<&str> = code
        .char_indices()
        .filter(|&(_, character)| character == '-')
        .map(|(index, _)| &code[..index])
        .rev()
        .collect();
    candidates.insert(0, code);
    if let Some(script) = script_code(code) {
        candidates.insert(1, script);
    }
    candidates
}

fn script_code(code: &str) -> Option<&'static str> {
    let mut parts = code.split('-');
    if !parts.next()?.eq_ignore_ascii_case("zh") {
        return None;
    }
    let traditional = parts.any(|part| {
        part.eq_ignore_ascii_case("Hant")
            || TRADITIONAL_CHINESE_REGIONS
                .iter()
                .any(|region| part.eq_ignore_ascii_case(region))
    });
    Some(if traditional {
        TRADITIONAL_CHINESE
    } else {
        SIMPLIFIED_CHINESE
    })
}

fn fallback_chain(code: &str) -> Vec<&str> {
    let mut chain = vec![ENGLISH_CODE];
    for candidate in [base_code(code), code] {
        if !chain
            .iter()
            .any(|known| known.eq_ignore_ascii_case(candidate))
        {
            chain.push(candidate);
        }
    }
    chain
}

fn base_code(code: &str) -> &str {
    code.split('-').next().unwrap_or(code)
}

pub fn is_valid_code(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= MAX_CODE_LENGTH
        && code
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

// System language
#[cfg(windows)]
fn preferred_ui_languages() -> Vec<String> {
    use std::ptr;

    use windows_sys::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};

    let mut count = 0_u32;
    let mut length = 0_u32;
    if unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &raw mut count,
            ptr::null_mut(),
            &raw mut length,
        )
    } == 0
    {
        return Vec::new();
    }
    let mut buffer = vec![0_u16; length as usize];
    if unsafe {
        GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &raw mut count,
            buffer.as_mut_ptr(),
            &raw mut length,
        )
    } == 0
    {
        return Vec::new();
    }
    buffer
        .split(|&unit| unit == 0)
        .filter(|part| !part.is_empty())
        .map(String::from_utf16_lossy)
        .collect()
}

#[cfg(target_os = "macos")]
fn preferred_ui_languages() -> Vec<String> {
    use objc2_foundation::NSLocale;

    NSLocale::preferredLanguages()
        .iter()
        .map(|language| language.to_string())
        .collect()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn preferred_ui_languages() -> Vec<String> {
    environment_languages(|name| std::env::var(name).ok())
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
fn environment_languages(lookup: impl Fn(&str) -> Option<String>) -> Vec<String> {
    let languages = lookup("LANGUAGE").unwrap_or_default();
    let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .into_iter()
        .filter_map(&lookup)
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    languages
        .split(':')
        .chain(std::iter::once(locale.as_str()))
        .map(|value| {
            value
                .split(['.', '@'])
                .next()
                .unwrap_or_default()
                .replace('_', "-")
        })
        .filter(|value| !value.is_empty() && value != "C" && value != "POSIX")
        .collect()
}

// Files
fn read_file(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_SIZE {
        return None;
    }
    fs::read_to_string(path).ok()
}

pub fn parse(content: &str) -> HashMap<String, String> {
    content
        .trim_start_matches('\u{feff}')
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with(';'))
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| (key.trim(), value.trim()))
        .filter(|(key, value)| !key.is_empty() && !value.is_empty())
        .map(|(key, value)| (key.to_owned(), value.replace("\\n", "\n")))
        .collect()
}

// Tests
#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    fn codes(values: &[&str]) -> Vec<String> {
        values.iter().map(|&value| value.to_owned()).collect()
    }

    fn placeholders(text: &str) -> BTreeSet<String> {
        text.split('{')
            .skip(1)
            .filter_map(|part| part.split_once('}'))
            .map(|(name, _)| name.to_owned())
            .collect()
    }

    fn temp_directory(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("streamxtras-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn parses_language_files() {
        let texts = parse(
            "\u{feff}# Comment\n; Comment\ntray.quit = Quit \nbroken\nempty =\nmulti = One\\nTwo\n",
        );
        assert_eq!(texts.len(), 2);
        assert_eq!(texts["tray.quit"], "Quit");
        assert_eq!(texts["multi"], "One\nTwo");
    }

    #[test]
    fn resolves_the_language() {
        let available = codes(&["en", "de", "pt-BR"]);
        assert_eq!(
            resolve_code(None, &codes(&["de-AT", "en-US"]), &available),
            "de"
        );
        assert_eq!(resolve_code(None, &codes(&["pt-br"]), &available), "pt-BR");
        assert_eq!(resolve_code(None, &codes(&["fr-FR"]), &available), "en");
        assert_eq!(
            resolve_code(Some("en"), &codes(&["de-DE"]), &available),
            "en"
        );
        assert_eq!(
            resolve_code(Some("xx"), &codes(&["de-DE"]), &available),
            "de"
        );
    }

    #[test]
    fn shortens_system_language_codes() {
        let available = codes(&["en", "sr-Latn", "nb"]);
        assert_eq!(
            resolve_code(None, &codes(&["sr-Latn-RS"]), &available),
            "sr-Latn"
        );
        assert_eq!(resolve_code(None, &codes(&["nb-NO"]), &available), "nb");
        assert_eq!(candidates("sr-Latn-RS"), ["sr-Latn-RS", "sr-Latn", "sr"]);
        assert_eq!(candidates("zh-TW"), ["zh-TW", "zh-Hant", "zh"]);
    }

    #[test]
    fn maps_chinese_regions_to_scripts() {
        let available = codes(&["en", "zh-Hans", "zh-Hant"]);
        for (system, expected) in [
            ("zh-CN", "zh-Hans"),
            ("zh-SG", "zh-Hans"),
            ("zh-TW", "zh-Hant"),
            ("zh-HK", "zh-Hant"),
            ("zh-Hant-TW", "zh-Hant"),
        ] {
            assert_eq!(resolve_code(None, &codes(&[system]), &available), expected);
        }
        assert_eq!(script_code("de-DE"), None);
    }

    #[test]
    fn reads_unix_locale_variables() {
        let values = [("LANGUAGE", "de_AT:fr"), ("LANG", "en_US.UTF-8")];
        let lookup = |name: &str| {
            values
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
        };
        assert_eq!(environment_languages(lookup), ["de-AT", "fr", "en-US"]);
        assert_eq!(
            environment_languages(|_| Some("C".to_owned())),
            Vec::<String>::new()
        );
    }

    #[test]
    fn falls_back_through_the_declared_language() {
        assert_eq!(language_chain("sxu", Some("de")), ["en", "de", "sxu"]);
        assert_eq!(
            language_chain("de-x-amtsdt", Some("de")),
            ["en", "de", "de-x-amtsdt"]
        );
        assert_eq!(language_chain("de-CH", None), ["en", "de", "de-CH"]);
        assert_eq!(fallback_chain("en"), ["en"]);
    }

    #[test]
    fn reads_the_declared_fallback_direction_and_category() {
        let directory = temp_directory("lang-fallback");
        fs::write(
            directory.join("de.lang"),
            "# Category: standard\ntray.quit = Beenden\ntray.open = Einstellungen öffnen\n",
        )
        .unwrap();
        fs::write(
            directory.join("yy.lang"),
            "# Category: fun\nlanguage.name = Yy\nlanguage.fallback = de\ntray.quit = Feierabend\n",
        )
        .unwrap();
        fs::write(directory.join("zz.lang"), "language.direction = RTL\n").unwrap();
        let directories = [directory.clone()];
        let texts = load_texts("yy", &directories);
        let right_to_left = Translations::load(Some("zz"), &directories);
        let languages = available_languages(&directories);
        fs::remove_dir_all(&directory).unwrap();
        assert_eq!(texts[TRAY_QUIT], "Feierabend");
        assert_eq!(texts[TRAY_OPEN], "Einstellungen öffnen");
        assert!(right_to_left.is_right_to_left());
        let fun = languages.iter().find(|language| language.code == "yy");
        assert_eq!(fun.map(|language| language.category.as_str()), Some("fun"));
        assert_eq!(fun.map(|language| language.name.as_str()), Some("Yy"));
    }

    #[test]
    fn falls_back_per_text() {
        let directory = temp_directory("lang-text");
        fs::write(directory.join("xx.lang"), "tray.quit = Exit now\n").unwrap();
        let translations = Translations::load(Some("xx"), std::slice::from_ref(&directory));
        fs::remove_dir_all(&directory).unwrap();
        assert_eq!(translations.text(TRAY_QUIT), "Exit now");
        assert_eq!(translations.text(TRAY_OPEN), parse(ENGLISH)[TRAY_OPEN]);
        assert_eq!(translations.text("missing.key"), "missing.key");
    }

    #[test]
    fn english_contains_the_companion_texts() {
        let english = parse(ENGLISH);
        for key in KEYS {
            assert!(english.contains_key(key), "en.lang is missing {key}");
        }
    }

    #[test]
    fn bundled_languages_match_english() {
        let english = parse(ENGLISH);
        let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("web")
            .join(LANGUAGE_DIRECTORY);
        for file in fs::read_dir(directory).unwrap().flatten() {
            let path = file.path();
            let texts = parse(&fs::read_to_string(&path).unwrap());
            let name = path.display();
            assert!(
                is_valid_code(path.file_stem().unwrap().to_str().unwrap()),
                "{name} has an invalid name"
            );
            for (key, text) in &texts {
                if OPTIONAL_KEYS.contains(&key.as_str()) {
                    continue;
                }
                let Some(original) = english.get(key) else {
                    panic!("{name} contains the unknown text {key}");
                };
                assert_eq!(
                    placeholders(text),
                    placeholders(original),
                    "{name}: {key} has other placeholders"
                );
            }
            for key in english.keys() {
                assert!(texts.contains_key(key), "{name} is missing {key}");
            }
        }
    }
}
