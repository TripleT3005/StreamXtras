use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

// Constants
const MEDIA_DIRECTORY: &str = "media";
const MAX_STEM_LENGTH: usize = 40;

// Types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Sound,
    Image,
    Video,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MediaFormat {
    pub extension: &'static str,
    pub content_type: &'static str,
    pub kind: MediaKind,
}

#[derive(Debug, PartialEq, Eq)]
pub enum MediaError {
    UnsupportedFormat,
    NotFound,
    Io(String),
}

impl fmt::Display for MediaError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedFormat => write!(formatter, "unsupported file format"),
            Self::NotFound => write!(formatter, "file not found"),
            Self::Io(message) => write!(formatter, "{message}"),
        }
    }
}

const FORMATS: [MediaFormat; 9] = [
    MediaFormat {
        extension: "mp3",
        content_type: "audio/mpeg",
        kind: MediaKind::Sound,
    },
    MediaFormat {
        extension: "ogg",
        content_type: "audio/ogg",
        kind: MediaKind::Sound,
    },
    MediaFormat {
        extension: "wav",
        content_type: "audio/wav",
        kind: MediaKind::Sound,
    },
    MediaFormat {
        extension: "png",
        content_type: "image/png",
        kind: MediaKind::Image,
    },
    MediaFormat {
        extension: "gif",
        content_type: "image/gif",
        kind: MediaKind::Image,
    },
    MediaFormat {
        extension: "webp",
        content_type: "image/webp",
        kind: MediaKind::Image,
    },
    MediaFormat {
        extension: "jpg",
        content_type: "image/jpeg",
        kind: MediaKind::Image,
    },
    MediaFormat {
        extension: "mp4",
        content_type: "video/mp4",
        kind: MediaKind::Video,
    },
    MediaFormat {
        extension: "webm",
        content_type: "video/webm",
        kind: MediaKind::Video,
    },
];

// Formats
pub fn detect_format(bytes: &[u8]) -> Option<MediaFormat> {
    let is_riff =
        |kind: &[u8]| bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == kind;
    let extension = if bytes.starts_with(b"ID3")
        || (bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0)
    {
        "mp3"
    } else if bytes.starts_with(b"OggS") {
        "ogg"
    } else if is_riff(b"WAVE") {
        "wav"
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "gif"
    } else if is_riff(b"WEBP") {
        "webp"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        "mp4"
    } else if bytes.starts_with(&[0x1A, 0x45, 0xDF, 0xA3])
        && bytes[..bytes.len().min(64)]
            .windows(4)
            .any(|window| window == b"webm")
    {
        "webm"
    } else {
        return None;
    };
    format_for_extension(extension)
}

fn format_for_extension(extension: &str) -> Option<MediaFormat> {
    FORMATS
        .iter()
        .copied()
        .find(|format| format.extension == extension)
}

pub fn is_valid_file_name(name: &str) -> bool {
    let Some((stem, extension)) = name.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && stem.len() <= MAX_STEM_LENGTH + 20
        && stem
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && format_for_extension(extension).is_some()
}

fn sanitize_stem(name: &str) -> String {
    let stem = name
        .rsplit_once('.')
        .map_or(name, |(stem, _)| stem)
        .to_ascii_lowercase();
    let mut sanitized = String::new();
    for character in stem.chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            sanitized.push(character);
        } else if !sanitized.ends_with('-') {
            sanitized.push('-');
        }
    }
    let sanitized: String = sanitized
        .trim_matches('-')
        .chars()
        .take(MAX_STEM_LENGTH)
        .collect();
    let sanitized = sanitized.trim_end_matches('-');
    if sanitized.is_empty() {
        "file".to_owned()
    } else {
        sanitized.to_owned()
    }
}

// Storage
fn media_directory(config_dir: &Path) -> PathBuf {
    config_dir.join(MEDIA_DIRECTORY)
}

pub fn store(config_dir: &Path, original_name: &str, bytes: &[u8]) -> Result<Value, MediaError> {
    let format = detect_format(bytes).ok_or(MediaError::UnsupportedFormat)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let file = format!(
        "{}-{timestamp}.{}",
        sanitize_stem(original_name),
        format.extension
    );
    let directory = media_directory(config_dir);
    fs::create_dir_all(&directory)
        .and_then(|()| fs::write(directory.join(&file), bytes))
        .map_err(|error| MediaError::Io(error.to_string()))?;
    Ok(describe(&file, format, bytes.len() as u64))
}

pub fn list(config_dir: &Path) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(media_directory(config_dir)) else {
        return Vec::new();
    };
    let mut files: Vec<(String, u64)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let size = entry.metadata().ok()?.len();
            is_valid_file_name(&name).then_some((name, size))
        })
        .collect();
    files.sort();
    files
        .into_iter()
        .filter_map(|(file, size)| {
            let format = format_for_extension(file.rsplit_once('.')?.1)?;
            Some(describe(&file, format, size))
        })
        .collect()
}

pub fn read(config_dir: &Path, file: &str) -> Result<(Vec<u8>, &'static str), MediaError> {
    let format = validated_format(file)?;
    match fs::read(media_directory(config_dir).join(file)) {
        Ok(bytes) => Ok((bytes, format.content_type)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Err(MediaError::NotFound),
        Err(error) => Err(MediaError::Io(error.to_string())),
    }
}

pub fn delete(config_dir: &Path, file: &str) -> Result<(), MediaError> {
    validated_format(file)?;
    match fs::remove_file(media_directory(config_dir).join(file)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Err(MediaError::NotFound),
        Err(error) => Err(MediaError::Io(error.to_string())),
    }
}

fn validated_format(file: &str) -> Result<MediaFormat, MediaError> {
    if !is_valid_file_name(file) {
        return Err(MediaError::NotFound);
    }
    file.rsplit_once('.')
        .and_then(|(_, extension)| format_for_extension(extension))
        .ok_or(MediaError::NotFound)
}

fn describe(file: &str, format: MediaFormat, size: u64) -> Value {
    json!({
        "file": file,
        "value": format!("media/{file}"),
        "kind": match format.kind {
            MediaKind::Sound => "sound",
            MediaKind::Image => "image",
            MediaKind::Video => "video",
        },
        "size": size,
    })
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);

    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn directory(name: &str) -> Directory {
        let path =
            std::env::temp_dir().join(format!("streamxtras-media-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        Directory(path)
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
    const WAV: &[u8] = b"RIFF\x24\0\0\0WAVEfmt ";

    #[test]
    fn detects_formats_by_content() {
        let extension = |bytes: &[u8]| detect_format(bytes).map(|format| format.extension);
        assert_eq!(extension(b"ID3\x04\0"), Some("mp3"));
        assert_eq!(extension(&[0xFF, 0xFB, 0x90]), Some("mp3"));
        assert_eq!(extension(b"OggS\0\x02"), Some("ogg"));
        assert_eq!(extension(WAV), Some("wav"));
        assert_eq!(extension(PNG), Some("png"));
        assert_eq!(extension(b"GIF89a.."), Some("gif"));
        assert_eq!(extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(extension(b"\0\0\0\x20ftypisom\0\0"), Some("mp4"));
        assert_eq!(
            extension(b"\x1A\x45\xDF\xA3\x9F\x42\x82\x84webm"),
            Some("webm")
        );
        assert_eq!(extension(b"\x1A\x45\xDF\xA3\x9F\x42\x82\x88matroska"), None);
        assert_eq!(extension(b"<svg onload=alert(1)>"), None);
        assert_eq!(extension(b"MZ\x90\0"), None);
        assert_eq!(detect_format(WAV).unwrap().kind, MediaKind::Sound);
        assert_eq!(
            detect_format(b"\0\0\0\x18ftypmp42").unwrap().kind,
            MediaKind::Video
        );
    }

    #[test]
    fn sanitizes_names_and_validates_files() {
        assert_eq!(sanitize_stem("My Follow Sound!!.mp3"), "my-follow-sound");
        assert_eq!(sanitize_stem("../../evil.exe"), "evil");
        assert_eq!(sanitize_stem("###.png"), "file");
        assert!(is_valid_file_name("follow-123.mp3"));
        assert!(!is_valid_file_name("../config.json"));
        assert!(!is_valid_file_name("Follow.mp3"));
        assert!(!is_valid_file_name("follow.svg"));
        assert!(!is_valid_file_name(".mp3"));
    }

    #[test]
    fn stores_lists_reads_and_deletes_files() {
        let directory = directory("store");
        let stored = store(&directory.0, "Heart Image.webp", PNG).unwrap();
        let file = stored["file"].as_str().unwrap().to_owned();
        assert!(file.starts_with("heart-image-"));
        assert_eq!(
            file.rsplit_once('.').map(|(_, extension)| extension),
            Some("png")
        );
        assert_eq!(stored["value"], format!("media/{file}"));
        assert_eq!(stored["kind"], "image");

        let listed = list(&directory.0);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0]["file"], file.as_str());

        let (bytes, content_type) = read(&directory.0, &file).unwrap();
        assert_eq!((bytes.as_slice(), content_type), (PNG, "image/png"));

        delete(&directory.0, &file).unwrap();
        assert_eq!(list(&directory.0).len(), 0);
        assert_eq!(read(&directory.0, &file), Err(MediaError::NotFound));
    }

    #[test]
    fn rejects_unknown_formats_and_unsafe_names() {
        let directory = directory("reject");
        assert_eq!(
            store(&directory.0, "script.svg", b"<svg/>"),
            Err(MediaError::UnsupportedFormat)
        );
        assert_eq!(
            read(&directory.0, "../config.json"),
            Err(MediaError::NotFound)
        );
        assert_eq!(
            delete(&directory.0, "..\\twitch-token.json"),
            Err(MediaError::NotFound)
        );
    }
}
