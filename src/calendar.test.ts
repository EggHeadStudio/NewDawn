import { describe, expect, it } from 'vitest';
import { seasonForDay, weatherForDay } from './calendar';

describe('calendar and weather', () => {
  it('changes seasons every seven days and wraps after a year', () => {
    expect([1, 7, 8, 15, 22, 29].map(seasonForDay)).toEqual(['Spring', 'Spring', 'Summer', 'Autumn', 'Winter', 'Spring']);
  });
  it('produces deterministic weather and snow only in winter', () => {
    for (let day = 1; day <= 56; day++) {
      expect(weatherForDay(day, 1847)).toBe(weatherForDay(day, 1847));
      if (weatherForDay(day, 1847) === 'Snow') expect(seasonForDay(day)).toBe('Winter');
    }
  });
});
