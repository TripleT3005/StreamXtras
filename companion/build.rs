#[path = "src/icon.rs"]
#[allow(dead_code)]
mod icon;

use std::env;
use std::fs;
use std::path::PathBuf;

// Constants
const ICON_SIZES: [u16; 7] = [16, 20, 24, 32, 48, 64, 256];
const RT_ICON: u16 = 3;
const RT_GROUP_ICON: u16 = 14;
const RT_VERSION: u16 = 16;
const LANGUAGE_EN_US: u16 = 0x0409;
const CODE_PAGE_UNICODE: u16 = 1200;
const MEMORY_FLAGS: u16 = 0x1030;

// Build
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/icon.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");
    let is_windows = env::var("CARGO_CFG_TARGET_OS").is_ok_and(|os| os == "windows");
    let is_msvc = env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|target_env| target_env == "msvc");
    if !is_windows || !is_msvc {
        return;
    }
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let path = out_dir.join("streamxtras.res");
    fs::write(&path, resources()).expect("writing the resource file failed");
    println!("cargo:rustc-link-arg-bins={}", path.display());
}

// Resources
fn resources() -> Vec<u8> {
    let mut file = Vec::new();
    push_resource(&mut file, 0, 0, &[], 0, 0);
    let mut group = Vec::new();
    push_u16(&mut group, 0);
    push_u16(&mut group, 1);
    push_u16(&mut group, u16::try_from(ICON_SIZES.len()).unwrap_or(0));
    for (index, size) in ICON_SIZES.into_iter().enumerate() {
        let id = u16::try_from(index + 1).unwrap_or(u16::MAX);
        let image = icon_image(size);
        let dimension = u8::try_from(size).unwrap_or(0);
        group.extend_from_slice(&[dimension, dimension, 0, 0]);
        push_u16(&mut group, 1);
        push_u16(&mut group, 32);
        push_u32(&mut group, u32::try_from(image.len()).unwrap_or(0));
        push_u16(&mut group, id);
        push_resource(&mut file, RT_ICON, id, &image, MEMORY_FLAGS, LANGUAGE_EN_US);
    }
    push_resource(
        &mut file,
        RT_GROUP_ICON,
        1,
        &group,
        MEMORY_FLAGS,
        LANGUAGE_EN_US,
    );
    push_resource(
        &mut file,
        RT_VERSION,
        1,
        &version_info(),
        MEMORY_FLAGS,
        LANGUAGE_EN_US,
    );
    file
}

fn push_resource(file: &mut Vec<u8>, kind: u16, id: u16, data: &[u8], flags: u16, language: u16) {
    push_u32(file, u32::try_from(data.len()).unwrap_or(0));
    push_u32(file, 32);
    for value in [0xFFFF, kind, 0xFFFF, id] {
        push_u16(file, value);
    }
    push_u32(file, 0);
    push_u16(file, flags);
    push_u16(file, language);
    push_u32(file, 0);
    push_u32(file, 0);
    file.extend_from_slice(data);
    align(file);
}

fn icon_image(size: u16) -> Vec<u8> {
    let rgba = icon::icon_pixels(size);
    let width = usize::from(size);
    let mask_row = width.div_ceil(32) * 4;
    let mut image = Vec::new();
    push_u32(&mut image, 40);
    push_u32(&mut image, u32::from(size));
    push_u32(&mut image, u32::from(size) * 2);
    push_u16(&mut image, 1);
    push_u16(&mut image, 32);
    push_u32(&mut image, 0);
    push_u32(
        &mut image,
        u32::try_from(width * width * 4 + mask_row * width).unwrap_or(0),
    );
    image.extend_from_slice(&[0; 16]);
    for row in rgba.chunks(width * 4).rev() {
        for pixel in row.chunks(4) {
            image.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
    }
    image.resize(image.len() + mask_row * width, 0);
    image
}

// Version
fn version_info() -> Vec<u8> {
    let version = env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION is set by Cargo");
    let parts: Vec<u16> = version
        .split(['.', '-', '+'])
        .take(3)
        .map(|part| part.parse().unwrap_or(0))
        .collect();
    let part = |index: usize| u32::from(parts.get(index).copied().unwrap_or(0));
    let mut fixed = Vec::new();
    for value in [
        0xFEEF_04BD,
        0x0001_0000,
        (part(0) << 16) | part(1),
        part(2) << 16,
        (part(0) << 16) | part(1),
        part(2) << 16,
        0x3F,
        0,
        0x0004_0004,
        1,
        0,
        0,
        0,
    ] {
        push_u32(&mut fixed, value);
    }

    let strings = [
        ("CompanyName", "TripleT3005"),
        ("FileDescription", "StreamXtras"),
        ("FileVersion", version.as_str()),
        ("InternalName", "streamxtras"),
        ("LegalCopyright", "Copyright (c) TripleT3005"),
        ("OriginalFilename", "streamxtras.exe"),
        ("ProductName", "StreamXtras"),
        ("ProductVersion", version.as_str()),
    ];
    let entries: Vec<Vec<u8>> = strings
        .iter()
        .map(|(key, value)| {
            let text = utf16(value);
            block(
                key,
                &text,
                u16::try_from(text.len() / 2).unwrap_or(0),
                1,
                &[],
            )
        })
        .collect();
    let table = block(
        &format!("{LANGUAGE_EN_US:04x}{CODE_PAGE_UNICODE:04x}"),
        &[],
        0,
        1,
        &entries,
    );
    let string_info = block("StringFileInfo", &[], 0, 1, &[table]);
    let mut translation = Vec::new();
    push_u16(&mut translation, LANGUAGE_EN_US);
    push_u16(&mut translation, CODE_PAGE_UNICODE);
    let var_info = block(
        "VarFileInfo",
        &[],
        0,
        1,
        &[block("Translation", &translation, 4, 0, &[])],
    );
    block("VS_VERSION_INFO", &fixed, 52, 0, &[string_info, var_info])
}

fn block(key: &str, value: &[u8], value_length: u16, kind: u16, children: &[Vec<u8>]) -> Vec<u8> {
    let mut data = vec![0, 0];
    push_u16(&mut data, value_length);
    push_u16(&mut data, kind);
    data.extend_from_slice(&utf16(key));
    align(&mut data);
    data.extend_from_slice(value);
    for child in children {
        align(&mut data);
        data.extend_from_slice(child);
    }
    let length = u16::try_from(data.len()).unwrap_or(u16::MAX).to_le_bytes();
    data[0..2].copy_from_slice(&length);
    data
}

// Helpers
fn utf16(text: &str) -> Vec<u8> {
    text.encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

fn align(data: &mut Vec<u8>) {
    while !data.len().is_multiple_of(4) {
        data.push(0);
    }
}

fn push_u16(data: &mut Vec<u8>, value: u16) {
    data.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(data: &mut Vec<u8>, value: u32) {
    data.extend_from_slice(&value.to_le_bytes());
}
