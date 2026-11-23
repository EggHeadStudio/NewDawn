import { seededNoise } from './world';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export type Weather = 'Clear' | 'Cloudy' | 'Rain' | 'Storm' | 'Snow';
export const DAYS_PER_SEASON = 7;

export function seasonForDay(day: number): Season {
  const seasons: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];
  return seasons[Math.floor((Math.max(1, day) - 1) / DAYS_PER_SEASON) % seasons.length];
}

export function weatherForDay(day: number, seed: number): Weather {
  const roll = seededNoise(day, 19, seed);
  if (roll < 0.4) return 'Clear';
  if (roll < 0.65) return 'Cloudy';
  if (seasonForDay(day) === 'Winter') return 'Snow';
  return roll < 0.9 ? 'Rain' : 'Storm';
}
