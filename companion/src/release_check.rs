// Constants
const VERSION: &str = env!("CARGO_PKG_VERSION");
const CHANGELOG: &str = include_str!("../../CHANGELOG.md");
const PACKAGE_JSON: &str = include_str!("../../package.json");
const PACKAGE_LOCK: &str = include_str!("../../package-lock.json");

// Helpers
fn changelog_section(version: &str) -> Option<&'static str> {
    let heading = format!("## [{version}]");
    let start = CHANGELOG.find(&heading)? + heading.len();
    let rest = &CHANGELOG[start..];
    Some(rest.find("\n## [").map_or(rest, |end| &rest[..end]))
}

// Tests
#[test]
fn package_files_have_the_same_version() {
    let package: serde_json::Value = serde_json::from_str(PACKAGE_JSON).unwrap();
    let lock: serde_json::Value = serde_json::from_str(PACKAGE_LOCK).unwrap();
    assert_eq!(package["version"], VERSION, "package.json");
    assert_eq!(lock["version"], VERSION, "package-lock.json");
    assert_eq!(
        lock["packages"][""]["version"], VERSION,
        "package-lock.json root package"
    );
}

#[test]
fn newest_changelog_section_is_the_current_version() {
    let newest = CHANGELOG
        .lines()
        .find_map(|line| line.strip_prefix("## ["))
        .and_then(|rest| rest.split(']').next());
    assert_eq!(newest, Some(VERSION));
}

#[test]
fn changelog_describes_the_current_version_in_both_languages() {
    let section = changelog_section(VERSION)
        .unwrap_or_else(|| panic!("CHANGELOG.md has no section for version {VERSION}"));
    let english = section.find("\n### English\n").expect("English part");
    let german = section.find("\n### Deutsch\n").expect("German part");
    assert!(english < german);
    assert!(section[english..german].contains("\n- "));
    assert!(section[german..].contains("\n- "));
}
