export const EARTH_RADIUS_METERS = 6_371_000;
export const EQUATORIAL_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS;

export interface GeographicPosition {
  planetId: 'new-dawn-earth';
  latitude: number;
  longitude: number;
  altitude: number;
  regionId: string;
}

export type ClimateZone =
  | 'polar-ice' | 'tundra' | 'alpine' | 'boreal' | 'temperate-deciduous'
  | 'temperate-mixed' | 'grassland' | 'steppe' | 'savanna' | 'hot-desert'
  | 'cold-desert' | 'tropical-rainforest' | 'tropical-seasonal' | 'wetland'
  | 'coastal';

export interface MapMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  kind: 'home' | 'landmark' | 'settlement';
}

export interface AtlasState {
  explored: string[];
  markers: MapMarker[];
  zoom: number;
  centerLatitude: number;
  centerLongitude: number;
  level: 'world' | 'continent' | 'region' | 'local';
}

export function normalizeLatitude(latitude: number) {
  return Math.max(-90, Math.min(90, latitude));
}

export function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function geographicDistanceMeters(a: Pick<GeographicPosition, 'latitude' | 'longitude'>,
  b: Pick<GeographicPosition, 'latitude' | 'longitude'>) {
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * Math.PI / 180;
  const deltaLon = normalizeLongitude(b.longitude - a.longitude) * Math.PI / 180;
  const hav = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(hav)));
}

export function geographicBearing(start: Pick<GeographicPosition, 'latitude' | 'longitude'>,
  destination: Pick<GeographicPosition, 'latitude' | 'longitude'>) {
  const lat1 = start.latitude * Math.PI / 180;
  const lat2 = destination.latitude * Math.PI / 180;
  const deltaLon = normalizeLongitude(destination.longitude - start.longitude) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function moveGeographic(start: Pick<GeographicPosition, 'latitude' | 'longitude' | 'altitude'>,
  bearingDegrees: number, distanceMeters: number): GeographicPosition {
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = start.latitude * Math.PI / 180;
  const lon1 = start.longitude * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  const latitude = normalizeLatitude(lat2 * 180 / Math.PI);
  const longitude = normalizeLongitude(lon2 * 180 / Math.PI);
  return {
    latitude,
    longitude,
    planetId: 'new-dawn-earth',
    altitude: start.altitude,
    regionId: regionIdForCoordinates(latitude, longitude),
  };
}

export function regionIdForCoordinates(latitude: number, longitude: number, level = 2) {
  const latBands = level === 2 ? 4 : level;
  const lonBands = level === 2 ? 8 : level * 2;
  const latIndex = Math.floor((normalizeLatitude(latitude) + 90) / 180 * latBands);
  const lonIndex = Math.floor((normalizeLongitude(longitude) + 180) / 360 * lonBands);
  return `region-${level}-${latIndex}-${lonIndex}`;
}

export function hierarchicalTileId(latitude: number, longitude: number, zoom = 4) {
  const clampedZoom = Math.max(0, Math.min(12, Math.floor(zoom)));
  const lat = normalizeLatitude(latitude);
  const lon = normalizeLongitude(longitude);
  const x = Math.floor((lon + 180) / 360 * 2 ** clampedZoom);
  const y = Math.floor((lat + 90) / 180 * 2 ** clampedZoom);
  return `${clampedZoom}/${x}/${y}`;
}

export function localOriginAt(latitude: number, longitude: number) {
  return { latitude: normalizeLatitude(latitude), longitude: normalizeLongitude(longitude) };
}

export function geographicToLocal(origin: { latitude: number; longitude: number },
  position: Pick<GeographicPosition, 'latitude' | 'longitude'>) {
  const east = geographicDistanceMeters(
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: origin.latitude, longitude: position.longitude },
  ) * (normalizeLongitude(position.longitude - origin.longitude) >= 0 ? 1 : -1);
  const north = geographicDistanceMeters(
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: position.latitude, longitude: origin.longitude },
  ) * (position.latitude >= origin.latitude ? 1 : -1);
  return { x: east, z: -north };
}

export function localToGeographic(origin: { latitude: number; longitude: number }, xMeters: number, zMeters: number) {
  const eastDistance = Math.abs(xMeters);
  const east = moveGeographic(
    { latitude: origin.latitude, longitude: origin.longitude, altitude: 0 },
    xMeters >= 0 ? 90 : 270,
    eastDistance,
  );
  return moveGeographic(east, zMeters >= 0 ? 180 : 0, Math.abs(zMeters));
}

export function climateZone(latitude: number, altitudeMeters: number, distanceToOceanKm: number, moisture: number,
  seed = 1847): ClimateZone {
  const absLatitude = Math.abs(normalizeLatitude(latitude));
  if (absLatitude >= 78) return 'polar-ice';
  if (absLatitude >= 66) return altitudeMeters > 700 ? 'alpine' : 'tundra';
  if (altitudeMeters >= 2200) return 'alpine';
  if (absLatitude >= 48) {
    if (moisture < 0.28) return 'cold-desert';
    if (moisture > 0.58) return 'boreal';
    return 'temperate-mixed';
  }
  if (absLatitude >= 35) {
    if (moisture < 0.22) return 'hot-desert';
    if (moisture < 0.42) return 'steppe';
    if (moisture > 0.68) return 'temperate-deciduous';
    return 'temperate-mixed';
  }
  if (absLatitude < 23.5) {
    if (moisture > 0.72) return 'tropical-rainforest';
    if (moisture > 0.42) return 'tropical-seasonal';
    if (moisture < 0.24) return 'hot-desert';
  }
  if (absLatitude < 32 && moisture < 0.18) return 'hot-desert';
  if (moisture > 0.78 && distanceToOceanKm < 80) return 'wetland';
  if (distanceToOceanKm < 18) return 'coastal';
  const seasonal = Math.sin(latitude * 0.06 + seed * 0.013);
  return seasonal > 0.45 ? 'grassland' : 'savanna';
}

export function seasonsForLatitude(latitude: number, day: number) {
  const reversed = normalizeLatitude(latitude) < 0;
  const offset = reversed ? 182 : 0;
  const yearPosition = ((day - 1 + offset) % 365 + 365) % 365;
  if (yearPosition < 80 || yearPosition >= 355) return 'Winter';
  if (yearPosition < 172) return 'Spring';
  if (yearPosition < 264) return 'Summer';
  return 'Autumn';
}

export function isAtlasState(value: unknown): value is AtlasState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return Array.isArray(state.explored) && state.explored.length <= 100000
    && state.explored.every(tile => typeof tile === 'string' && /^[0-9]{1,2}\/[0-9]+\/[0-9]+$/.test(tile))
    && Array.isArray(state.markers) && state.markers.length <= 100
    && state.markers.every(marker => {
      if (typeof marker !== 'object' || marker === null) return false;
      const m = marker as Record<string, unknown>;
      return typeof m.id === 'string' && m.id.length <= 64
        && typeof m.name === 'string' && m.name.length <= 32
        && typeof m.latitude === 'number' && typeof m.longitude === 'number' && typeof m.altitude === 'number'
        && typeof m.kind === 'string' && ['home', 'landmark', 'settlement'].includes(m.kind);
    })
    && typeof state.zoom === 'number' && state.zoom >= 1 && state.zoom <= 12
    && typeof state.centerLatitude === 'number' && typeof state.centerLongitude === 'number';
}
