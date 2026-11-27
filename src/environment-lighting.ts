import type { Weather } from './calendar';
import type { VegetationQuality } from './vegetation-lod';

function smoothstep(min: number, max: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

export function atmosphericFogRange(start: number, end: number, renderDistance: number,
  quality: VegetationQuality, weather: Weather, daylight: number, altitude: number) {
  const qualityScale = { low: 0.72, medium: 1, high: 1.28 }[quality];
  const weatherScale = { Clear: 1, Cloudy: 0.95, Rain: 0.86, Storm: 0.78, Snow: 0.84 }[weather];
  const heightScale = 1 + Math.max(0, Math.min(1, altitude / 1200)) * 0.08;
  const lightScale = 0.96 + 0.04 * Math.max(0, Math.min(1, daylight));
  const far = Math.min(end * qualityScale * heightScale * lightScale, renderDistance * 24 + 12) * weatherScale;
  return { near: Math.min(start * far / Math.max(end, 0.001), Math.max(0, far - 8)), far };
}

export const STARLIGHT_FILL = 0.9;

export function environmentLighting(minutes: number, weather: Weather, height?: number) {
  const solarHeight = height ?? Math.sin((minutes - 360) / 720 * Math.PI);
  const daylight = smoothstep(-0.18, 0.22, solarHeight);
  const sunlight = Math.max(0, solarHeight) * smoothstep(-0.02, 0.16, solarHeight);
  const twilight = (1 - smoothstep(0.02, 0.3, Math.abs(solarHeight))) * smoothstep(-0.2, 0, solarHeight);
  const cloud = weather === 'Storm' ? 0.38 : weather === 'Cloudy' ? 0.57
    : weather === 'Rain' ? 0.64 : weather === 'Snow' ? 0.78 : 1;
  const moon = weather === 'Storm' ? 0.42 : weather === 'Cloudy' ? 0.6
    : weather === 'Rain' ? 0.65 : weather === 'Snow' ? 1.15 : 1;
  // Artistic airglow and dark adaptation preserve some visibility under cloud.
  const sky = weather === 'Storm' ? 0.75 : weather === 'Cloudy' ? 0.85
    : weather === 'Rain' ? 0.8 : weather === 'Snow' ? 1.1 : 1;
  return {
    daylight,
    twilight,
    sunlight: sunlight * 3 * cloud,
    hemisphere: 0.55 * moon * (1 - daylight) + (0.5 + 1.45 * cloud) * daylight,
    moonlight: 1.35 * moon * (1 - daylight),
    starlight: STARLIGHT_FILL * sky * (1 - daylight),
    skyBrightness: 0.045 * moon * (1 - daylight) + (0.39 + 0.31 * cloud) * daylight,
  };
}

export function moonlitSceneLighting(lighting: ReturnType<typeof environmentLighting>, illumination: number, moonHeight: number) {
  const moonlight = lighting.moonlight * Math.max(0, Math.min(1, illumination)) * smoothstep(0, 0.08, moonHeight);
  return { moonlight, hemisphere: lighting.hemisphere + Math.max(2 * moonlight, lighting.starlight) };
}
