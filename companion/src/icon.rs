// Constants
const VIEWBOX: f32 = 64.0;
const CIRCLE_RADIUS: f32 = 31.0;
const STROKE_WIDTH: f32 = 11.0;
const BACKGROUND: [f32; 3] = [119.0, 92.0, 255.0];
const FIRST_STROKE: [f32; 3] = [255.0, 255.0, 255.0];
const SECOND_STROKE: [f32; 3] = [201.0, 191.0, 255.0];
const FIRST_LINE: [(f32, f32); 2] = [(19.0, 19.0), (45.0, 45.0)];
const SECOND_LINE: [(f32, f32); 2] = [(45.0, 19.0), (19.0, 45.0)];
const SAMPLES: u16 = 4;

// Icon
pub fn icon_pixels(size: u16) -> Vec<u8> {
    let scale = VIEWBOX / f32::from(size);
    let samples = f32::from(SAMPLES * SAMPLES);
    let mut pixels = Vec::with_capacity(usize::from(size) * usize::from(size) * 4);
    for y in 0..size {
        for x in 0..size {
            let mut color = [0.0_f32; 3];
            let mut coverage = 0.0_f32;
            for sample_y in 0..SAMPLES {
                for sample_x in 0..SAMPLES {
                    let point = (
                        (f32::from(x) + (f32::from(sample_x) + 0.5) / f32::from(SAMPLES)) * scale,
                        (f32::from(y) + (f32::from(sample_y) + 0.5) / f32::from(SAMPLES)) * scale,
                    );
                    if let Some(sample) = color_at(point) {
                        for (channel, value) in color.iter_mut().zip(sample) {
                            *channel += value;
                        }
                        coverage += 1.0;
                    }
                }
            }
            if coverage == 0.0 {
                pixels.extend_from_slice(&[0, 0, 0, 0]);
            } else {
                pixels.extend(color.map(|channel| to_byte(channel / coverage)));
                pixels.push(to_byte(coverage / samples * 255.0));
            }
        }
    }
    pixels
}

fn color_at((x, y): (f32, f32)) -> Option<[f32; 3]> {
    let center = VIEWBOX / 2.0;
    if (x - center).powi(2) + (y - center).powi(2) > CIRCLE_RADIUS.powi(2) {
        return None;
    }
    Some(if is_on_line((x, y), SECOND_LINE) {
        SECOND_STROKE
    } else if is_on_line((x, y), FIRST_LINE) {
        FIRST_STROKE
    } else {
        BACKGROUND
    })
}

fn is_on_line((x, y): (f32, f32), [(start_x, start_y), (end_x, end_y)]: [(f32, f32); 2]) -> bool {
    let (delta_x, delta_y) = (end_x - start_x, end_y - start_y);
    let length = delta_x.mul_add(delta_x, delta_y * delta_y);
    let position =
        ((x - start_x).mul_add(delta_x, (y - start_y) * delta_y) / length).clamp(0.0, 1.0);
    let (nearest_x, nearest_y) = (
        position.mul_add(delta_x, start_x),
        position.mul_add(delta_y, start_y),
    );
    (x - nearest_x).powi(2) + (y - nearest_y).powi(2) <= (STROKE_WIDTH / 2.0).powi(2)
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn to_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    fn pixel(pixels: &[u8], size: usize, x: usize, y: usize) -> &[u8] {
        let index = (y * size + x) * 4;
        &pixels[index..index + 4]
    }

    #[test]
    fn draws_a_round_two_tone_x() {
        let pixels = icon_pixels(64);
        assert_eq!(pixels.len(), 64 * 64 * 4);
        assert_eq!(pixel(&pixels, 64, 0, 0), [0, 0, 0, 0]);
        assert_eq!(pixel(&pixels, 64, 32, 6), [119, 92, 255, 255]);
        assert_eq!(pixel(&pixels, 64, 24, 24), [255, 255, 255, 255]);
        assert_eq!(pixel(&pixels, 64, 40, 24), [201, 191, 255, 255]);
        assert_eq!(pixel(&pixels, 64, 32, 32), [201, 191, 255, 255]);
    }

    #[test]
    fn smooths_the_edge() {
        let pixels = icon_pixels(32);
        let edge = pixel(&pixels, 32, 16, 0)[3];
        assert!(edge > 0 && edge < 255);
    }
}
