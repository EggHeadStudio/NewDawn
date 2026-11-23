export type Outfit = 'ember' | 'sage' | 'azure';

export const appearanceOptions = {
  body: ['masculine', 'feminine'],
  face: ['round', 'angular'],
  skin: ['light', 'warm', 'brown', 'deep'],
  hair: ['short', 'long', 'curly', 'braided', 'shaved'],
  hairColor: ['dark', 'brown', 'blond', 'red', 'silver'],
  facialHair: ['none', 'beard', 'moustache', 'braided'],
  hat: ['none', 'cap', 'beanie', 'hood', 'helmet'],
  clothing: ['shirt', 'jacket', 'tunic', 'fur'],
  outfit: ['ember', 'sage', 'azure'],
  height: ['short', 'medium', 'tall'],
} as const;

export type CharacterAppearance = {
  [K in keyof typeof appearanceOptions]: (typeof appearanceOptions)[K][number];
};

export const appearanceLabels: Record<keyof CharacterAppearance, string> = {
  body: 'Body', face: 'Face', skin: 'Skin tone', hair: 'Hairstyle',
  hairColor: 'Hair color', facialHair: 'Facial hair', hat: 'Hat',
  clothing: 'Clothing', outfit: 'Outfit color', height: 'Height',
};

export function defaultAppearance(outfit: Outfit = 'ember'): CharacterAppearance {
  return {
    body: 'masculine', face: 'round', skin: 'warm', hair: 'short',
    hairColor: 'brown', facialHair: 'none', hat: 'none',
    clothing: 'jacket', outfit, height: 'medium',
  };
}

export function isAppearance(value: unknown): value is CharacterAppearance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (Object.keys(appearanceOptions) as Array<keyof CharacterAppearance>).every(key =>
    typeof record[key] === 'string' && (appearanceOptions[key] as readonly string[]).includes(record[key] as string));
}

export function appearanceFromSeed(seed: number): CharacterAppearance {
  let state = (Math.trunc(seed) >>> 0) || 1;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const choose = <T>(values: readonly T[]): T => values[next() % values.length];
  return {
    body: choose(appearanceOptions.body), face: choose(appearanceOptions.face),
    skin: choose(appearanceOptions.skin), hair: choose(['short', 'long', 'curly'] as const),
    hairColor: choose(appearanceOptions.hairColor), facialHair: choose(['none', 'beard', 'moustache'] as const),
    hat: choose(['none', 'cap', 'beanie'] as const), clothing: choose(['shirt', 'jacket'] as const),
    outfit: choose(appearanceOptions.outfit), height: choose(appearanceOptions.height),
  };
}
