#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from third_party_licenses import cargo_metadata, runtime_packages

# Constants
DEPENDABOT_AUTHOR = r"dependabot\[bot\]"
LOCKFILE = "companion/Cargo.lock"
DEVELOPMENT_TYPE = "direct:development"
LANGUAGES = {"English": "### English", "Deutsch": "### Deutsch"}
ENTRY_TEMPLATES = {
    "English": "#### Changed\n- Updated third-party components: {list}.",
    "Deutsch": "#### Geändert\n- Fremdkomponenten aktualisiert: {list}.",
}


# Types
@dataclass(frozen=True)
class Update:
    name: str
    version: str
    dependency_type: str = ""


# Git
def git(*arguments, cwd=None):
    result = subprocess.run(["git", *arguments], cwd=cwd, check=True, capture_output=True, text=True, encoding="utf-8")
    return result.stdout


def latest_tag(cwd=None):
    try:
        return git("describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD", cwd=cwd).strip() or None
    except subprocess.CalledProcessError:
        return None


def dependabot_messages(since, cwd=None):
    revision_range = f"{since}..HEAD" if since else "HEAD"
    output = git(
        "log", "--reverse", f"--author={DEPENDABOT_AUTHOR}", "--format=%B%x1e", revision_range, "--", LOCKFILE, cwd=cwd
    )
    return [message.strip() for message in output.split("\x1e") if message.strip()]


# Commit messages
def parse_updates(message):
    updates = []
    current = None
    in_block = False
    for line in message.splitlines():
        stripped = line.strip()
        if stripped == "updated-dependencies:":
            in_block = True
            continue
        if not in_block:
            continue
        if stripped == "...":
            break
        match = re.match(r"^(-\s+)?([\w-]+):\s*(.*)$", stripped)
        if not match:
            continue
        key, value = match.group(2), match.group(3).strip().strip("'\"")
        if match.group(1):
            if current:
                updates.append(current)
            current = {}
        if current is not None:
            current[key] = value
    if current:
        updates.append(current)
    return [
        Update(update["dependency-name"], update["dependency-version"], update.get("dependency-type", ""))
        for update in updates
        if "dependency-name" in update and "dependency-version" in update
    ]


def collect_updates(messages):
    latest = {}
    for message in messages:
        for update in parse_updates(message):
            if update.dependency_type != DEVELOPMENT_TYPE:
                latest[update.name] = update
    return latest


def shipped_updates(updates, packages):
    versions = {}
    for package in packages:
        versions.setdefault(package.name, set()).add(package.version)
    result = []
    for name, update in updates.items():
        if name not in versions:
            continue
        version = update.version if update.version in versions[name] else sorted(versions[name])[-1]
        result.append(Update(name, version))
    return sorted(result, key=lambda update: update.name.lower())


# Changelog
def changelog_section(text, version):
    heading = f"## [{version}]"
    lines = []
    found = False
    for line in text.splitlines():
        if line.startswith(heading):
            found = True
            continue
        if found and line.startswith("## ["):
            break
        if found:
            lines.append(line)
    return "\n".join(lines) if found else None


def language_parts(section):
    parts = {}
    current = None
    for line in section.splitlines():
        language = next((name for name, heading in LANGUAGES.items() if line.strip() == heading), None)
        if language:
            current = language
            parts[current] = []
        elif current:
            parts[current].append(line)
    return {language: "\n".join(lines) for language, lines in parts.items()}


def mentions(text, update):
    pattern = r"(?<![\w-])`?" + re.escape(update.name) + r"`?\s+`?v?" + re.escape(update.version) + r"`?(?!\w|\.\d)"
    return re.search(pattern, text) is not None


def missing_entries(section, updates):
    parts = language_parts(section)
    missing = []
    for language in LANGUAGES:
        text = parts.get(language, "")
        missing.extend((language, update) for update in updates if not mentions(text, update))
    return missing


def format_list(updates):
    return ", ".join(f"{update.name} {update.version}" for update in updates)


def suggested_entry(updates):
    items = format_list(updates)
    return "\n\n".join(f"{LANGUAGES[language]}\n\n{template.format(list=items)}" for language, template in ENTRY_TEMPLATES.items())


# Main
def main(arguments=None):
    parser = argparse.ArgumentParser(
        description="List the Dependabot updates of shipped Rust crates since the last release and check the changelog."
    )
    parser.add_argument("--repository", type=Path, default=Path("."))
    parser.add_argument("--since", help="Git revision to start from (default: newest v* tag)")
    parser.add_argument("--platform", action="append", default=[])
    parser.add_argument("--check", metavar="VERSION", help="Fail if the changelog section of VERSION misses an update")
    parser.add_argument("--changelog", type=Path, default=Path("CHANGELOG.md"))
    options = parser.parse_args(arguments)

    repository = options.repository.resolve()
    since = options.since or latest_tag(repository)
    updates = collect_updates(dependabot_messages(since, repository))
    packages = runtime_packages(cargo_metadata(repository / "companion" / "Cargo.toml", options.platform)) if updates else []
    shipped = shipped_updates(updates, packages)
    start = since or "the first commit"

    if not shipped:
        print(f"No Dependabot updates of shipped components since {start}")
        return 0

    print(f"Dependabot updates of shipped components since {start}: {format_list(shipped)}")
    if not options.check:
        print(f"\nSuggested changelog entry:\n\n{suggested_entry(shipped)}")
        return 0

    changelog = options.changelog if options.changelog.is_absolute() else repository / options.changelog
    section = changelog_section(changelog.read_text(encoding="utf-8"), options.check)
    if section is None:
        print(f"CHANGELOG.md has no section for {options.check}", file=sys.stderr)
        return 1
    missing = missing_entries(section, shipped)
    if missing:
        for language, update in missing:
            print(f"Missing in {language}: {update.name} {update.version}", file=sys.stderr)
        print(f"\nAdd an entry to the section for {options.check}, for example:\n\n{suggested_entry(shipped)}", file=sys.stderr)
        return 1
    print(f"The changelog section for {options.check} mentions every update")
    return 0


if __name__ == "__main__":
    sys.exit(main())
