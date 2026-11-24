import type { Weather } from './calendar';

function smoothstep(min: number, max: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

export function environmentLighting(minutes: number, weather: Weather) {
  const solarHeight = Math.sin((minutes - 360) / 720 * Math.PI);
  const daylight = smoothstep(-0.18, 0.22, solarHeight);
  const sunlight = Math.max(0, solarHeight) * smoothstep(-0.02, 0.16, solarHeight);
  const twilight = (1 - smoothstep(0.02, 0.3, Math.abs(solarHeight))) * smoothstep(-0.2, 0, solarHeight);
  const cloud = weather === 'Storm' ? 0.38 : weather === 'Cloudy' ? 0.57
    : weather === 'Rain' ? 0.64 : weather === 'Snow' ? 0.78 : 1;
  const moon = weather === 'Storm' ? 0.42 : weather === 'Cloudy' ? 0.6
    : weather === 'Rain' ? 0.65 : weather === 'Snow' ? 1.15 : 1;
  return {
    daylight,
    twilight,
    sunlight: sunlight * 3 * cloud,
    hemisphere: 0.24 * moon * (1 - daylight) + (0.5 + 1.45 * cloud) * daylight,
    moonlight: 0.34 * moon * (1 - daylight),
    skyBrightness: 0.045 * moon * (1 - daylight) + (0.39 + 0.31 * cloud) * daylight,
  };
}
