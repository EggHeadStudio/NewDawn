export const EARTH_RADIUS_METERS = 6_371_000;
export const EQUATORIAL_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS;

export interface GeographicPosition {
  planetId: 'new-dawn-earth';
  latitude: number;
  longitude: number;
  altitude: number;
  regionId: string;
}

type Vector3 = { x: number; y: number; z: number };

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

function unitPosition(latitude: number, longitude: number): Vector3 {
  const lat = normalizeLatitude(latitude) * Math.PI / 180;
  const lon = normalizeLongitude(longitude) * Math.PI / 180;
  return { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
}

function ecefPosition(position: Pick<GeographicPosition, 'latitude' | 'longitude' | 'altitude'>): Vector3 {
  const unit = unitPosition(position.latitude, position.longitude);
  const radius = EARTH_RADIUS_METERS + position.altitude;
  return { x: unit.x * radius, y: unit.y * radius, z: unit.z * radius };
}

function tangentBasis(latitude: number, longitude: number) {
  const lat = normalizeLatitude(latitude) * Math.PI / 180;
  const lon = normalizeLongitude(longitude) * Math.PI / 180;
  return {
    east: { x: -Math.sin(lon), y: Math.cos(lon), z: 0 },
    north: { x: -Math.sin(lat) * Math.cos(lon), y: -Math.sin(lat) * Math.sin(lon), z: Math.cos(lat) },
  };
}

function dot(a: Vector3, b: Vector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, angle: number): Vector3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const perpendicular = cross(axis, vector);
  const parallelScale = dot(axis, vector) * (1 - cosine);
  return {
    x: vector.x * cosine + perpendicular.x * sine + axis.x * parallelScale,
    y: vector.y * cosine + perpendicular.y * sine + axis.y * parallelScale,
    z: vector.z * cosine + perpendicular.z * sine + axis.z * parallelScale,
  };
}

function geographicFromEcef(position: Vector3): GeographicPosition {
  const radius = Math.hypot(position.x, position.y, position.z);
  const latitude = Math.atan2(position.z, Math.hypot(position.x, position.y)) * 180 / Math.PI;
  const longitude = Math.atan2(position.y, position.x) * 180 / Math.PI;
  return {
    planetId: 'new-dawn-earth',
    latitude,
    longitude: normalizeLongitude(longitude),
    altitude: radius - EARTH_RADIUS_METERS,
    regionId: regionIdForCoordinates(latitude, longitude),
  };
}

export function transportBearing(
  start: Pick<GeographicPosition, 'latitude' | 'longitude'>,
  destination: Pick<GeographicPosition, 'latitude' | 'longitude'>,
  bearingDegrees: number,
) {
  const startUp = unitPosition(start.latitude, start.longitude);
  const destinationUp = unitPosition(destination.latitude, destination.longitude);
  const axis = cross(startUp, destinationUp);
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);
  const alignment = dot(startUp, destinationUp);
  if (axisLength < 1e-12 && alignment < 0) return ((bearingDegrees % 360) + 360) % 360;
  const startBasis = tangentBasis(start.latitude, start.longitude);
  const bearing = bearingDegrees * Math.PI / 180;
  const heading = {
    x: startBasis.north.x * Math.cos(bearing) + startBasis.east.x * Math.sin(bearing),
    y: startBasis.north.y * Math.cos(bearing) + startBasis.east.y * Math.sin(bearing),
    z: startBasis.north.z * Math.cos(bearing) + startBasis.east.z * Math.sin(bearing),
  };
  let transported = heading;
  if (axisLength >= 1e-12) {
    axis.x /= axisLength;
    axis.y /= axisLength;
    axis.z /= axisLength;
    transported = rotateAroundAxis(heading, axis, Math.atan2(axisLength, alignment));
  }
  const destinationBasis = tangentBasis(destination.latitude, destination.longitude);
  const east = dot(transported, destinationBasis.east);
  const north = dot(transported, destinationBasis.north);
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
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
  const origin = unitPosition(start.latitude, start.longitude);
  const basis = tangentBasis(start.latitude, start.longitude);
  const north = Math.cos(bearing) * Math.sin(angular);
  const east = Math.sin(bearing) * Math.sin(angular);
  const radial = Math.cos(angular);
  const x = origin.x * radial + basis.north.x * north + basis.east.x * east;
  const y = origin.y * radial + basis.north.y * north + basis.east.y * east;
  const z = origin.z * radial + basis.north.z * north + basis.east.z * east;
  const latitude = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI;
  const longitude = normalizeLongitude(Math.atan2(y, x) * 180 / Math.PI);
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
  const latIndex = Math.min(latBands - 1, Math.floor((normalizeLatitude(latitude) + 90) / 180 * latBands));
  const lonIndex = Math.floor((normalizeLongitude(longitude) + 180) / 360 * lonBands);
  return `region-${level}-${latIndex}-${lonIndex}`;
}

export function hierarchicalTileId(latitude: number, longitude: number, zoom = 4) {
  const clampedZoom = Math.max(0, Math.min(12, Math.floor(zoom)));
  const lat = normalizeLatitude(latitude);
  const lon = normalizeLongitude(longitude);
  const x = Math.floor((lon + 180) / 360 * 2 ** clampedZoom);
  const y = Math.min(2 ** clampedZoom - 1, Math.floor((lat + 90) / 180 * 2 ** clampedZoom));
  return `${clampedZoom}/${x}/${y}`;
}

export function localOriginAt(latitude: number, longitude: number) {
  return { latitude: normalizeLatitude(latitude), longitude: normalizeLongitude(longitude) };
}

export function geographicToLocal(origin: { latitude: number; longitude: number },
  position: Pick<GeographicPosition, 'latitude' | 'longitude'>) {
  const originPosition = ecefPosition({ ...origin, altitude: 0 });
  const target = ecefPosition({ ...position, altitude: 0 });
  const basis = tangentBasis(origin.latitude, origin.longitude);
  const offset = { x: target.x - originPosition.x, y: target.y - originPosition.y, z: target.z - originPosition.z };
  return { x: dot(offset, basis.east), z: -dot(offset, basis.north) };
}

export function localToGeographic(origin: { latitude: number; longitude: number }, xMeters: number, zMeters: number) {
  // Orthographic tangent coordinates select the hemisphere facing the origin.
  const distance = Math.hypot(xMeters, zMeters);
  if (!Number.isFinite(distance) || distance > EARTH_RADIUS_METERS) {
    throw new RangeError('Tangent offset must lie within the local hemisphere');
  }
  const originPosition = ecefPosition({ ...origin, altitude: 0 });
  const basis = tangentBasis(origin.latitude, origin.longitude);
  const radialScale = Math.sqrt(1 - (distance / EARTH_RADIUS_METERS) ** 2);
  const offset = {
    x: basis.east.x * xMeters - basis.north.x * zMeters,
    y: basis.east.y * xMeters - basis.north.y * zMeters,
    z: basis.east.z * xMeters - basis.north.z * zMeters,
  };
  const position = {
    x: originPosition.x * radialScale + offset.x,
    y: originPosition.y * radialScale + offset.y,
    z: originPosition.z * radialScale + offset.z,
  };
  return geographicFromEcef(position);
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
