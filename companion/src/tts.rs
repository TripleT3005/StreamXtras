// Constants
pub const MAX_TEXT_CHARS: usize = 500;

// Speech
pub fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
    let text = clean_text(text);
    if text.is_empty() {
        return Err("nothing to say".to_owned());
    }
    platform::synthesize(&text, voice.trim())
}

pub fn voices() -> Vec<String> {
    let mut voices = platform::voices();
    voices.sort();
    voices.dedup();
    voices
}

fn clean_text(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_TEXT_CHARS)
        .collect()
}

// Windows
#[cfg(windows)]
mod platform {
    use windows::Media::SpeechSynthesis::SpeechSynthesizer;
    use windows::Storage::Streams::DataReader;
    use windows::core::HSTRING;

    pub fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
        speak(text, voice).map_err(|error| error.to_string())
    }

    fn speak(text: &str, voice: &str) -> windows::core::Result<Vec<u8>> {
        let synthesizer = SpeechSynthesizer::new()?;
        if !voice.is_empty()
            && let Some(selected) = SpeechSynthesizer::AllVoices()?
                .into_iter()
                .find(|candidate| candidate.DisplayName().is_ok_and(|name| name == voice))
        {
            synthesizer.SetVoice(&selected)?;
        }
        let stream = synthesizer
            .SynthesizeTextToStreamAsync(&HSTRING::from(text))?
            .join()?;
        let size = u32::try_from(stream.Size()?).unwrap_or(u32::MAX);
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
        reader.LoadAsync(size)?.join()?;
        let mut bytes = vec![0; size as usize];
        reader.ReadBytes(&mut bytes)?;
        Ok(bytes)
    }

    pub fn voices() -> Vec<String> {
        SpeechSynthesizer::AllVoices()
            .map(|voices| {
                voices
                    .into_iter()
                    .filter_map(|voice| voice.DisplayName().ok())
                    .map(|name| name.to_string())
                    .collect()
            })
            .unwrap_or_default()
    }
}

// macOS
#[cfg(target_os = "macos")]
mod platform {
    use std::fs;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let path = std::env::temp_dir().join(format!("streamxtras-tts-{stamp}.wav"));
        let mut command = Command::new("say");
        command.args([
            "--file-format=WAVE",
            "--data-format=LEI16@22050",
            "-f",
            "-",
            "-o",
        ]);
        command.arg(&path);
        if !voice.is_empty() {
            command.args(["-v", voice]);
        }
        let result = super::run_with_input(&mut command, text)
            .and_then(|_| fs::read(&path).map_err(|error| error.to_string()));
        let _ = fs::remove_file(&path);
        result
    }

    pub fn voices() -> Vec<String> {
        Command::new("say")
            .args(["-v", "?"])
            .output()
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.split("  ").next())
                    .map(|name| name.trim().to_owned())
                    .filter(|name| !name.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    }
}

// Linux
#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::process::Command;

    pub fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
        let mut command = Command::new("espeak-ng");
        command.args(["--stdout", "--stdin"]);
        if !voice.is_empty() {
            command.args(["-v", voice]);
        }
        super::run_with_input(&mut command, text)
    }

    pub fn voices() -> Vec<String> {
        Command::new("espeak-ng")
            .arg("--voices")
            .output()
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .skip(1)
                    .filter_map(|line| line.split_whitespace().nth(1))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[cfg(unix)]
fn run_with_input(command: &mut std::process::Command, input: &str) -> Result<Vec<u8>, String> {
    use std::io::Write;
    use std::process::Stdio;

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("starting the speech program failed: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| error.to_string())?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(format!("the speech program failed: {}", output.status))
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_and_limits_the_text() {
        assert_eq!(clean_text("  Hello\n\tworld\u{0}! "), "Hello world !");
        assert_eq!(clean_text(&"a".repeat(800)).chars().count(), MAX_TEXT_CHARS);
        assert_eq!(synthesize(" \n ", ""), Err("nothing to say".to_owned()));
    }

    #[cfg(windows)]
    #[test]
    fn synthesizes_wave_audio_on_windows() {
        let audio = synthesize("Test", "").unwrap();
        assert!(audio.starts_with(b"RIFF"));
        assert_ne!(voices(), Vec::<String>::new());
    }
}
