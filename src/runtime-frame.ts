import { Vector3 } from 'three';
import { movePlanetPosition, nearestPlanetPosition, PlanetTangentFrame, planetPositionToGeographic } from './planet';
import { geographicDistanceMeters, transportBearing, type GeographicPosition } from './geography';

type Position = { x: number; y: number; z: number };

export class PlanetaryRuntimeFrame {
  tangent: PlanetTangentFrame;
  readonly renderOrigin = new Vector3();

  constructor(reference: { x: number; z: number }) {
    this.tangent = new PlanetTangentFrame(reference);
  }

  relocate(reference: { x: number; z: number }) {
    this.tangent = new PlanetTangentFrame(reference);
    return this.tangent;
  }

  move(position: { x: number; z: number }, geographic: GeographicPosition, bearing: number, distance: number) {
    if (geographicDistanceMeters(this.tangent.origin, geographic) >= 1000) {
      return movePlanetPosition(position, bearing, distance, geographic);
    }
    const local = this.tangent.toLocal(position);
    const heading = transportBearing(geographic, this.tangent.origin, bearing) * Math.PI / 180;
    const projected = this.tangent.toPlanet({
      x: local.x + Math.sin(heading) * distance,
      z: local.z + Math.cos(heading) * distance,
    });
    const next = nearestPlanetPosition(projected.x, projected.z, position.x, position.z);
    return { ...next, geographic: planetPositionToGeographic(next.x, next.z, geographic.altitude) };
  }

  updateRenderOrigin(reference: { x: number; z: number }) {
    this.renderOrigin.set(Math.trunc(reference.x / 1024) * 1024, 0, Math.trunc(reference.z / 1024) * 1024);
  }

  projectedToRender(position: Position, target = new Vector3()) {
    return target.set(position.x - this.renderOrigin.x, position.y, position.z - this.renderOrigin.z);
  }

  renderToProjected(position: Position, target = new Vector3()) {
    return target.set(position.x + this.renderOrigin.x, position.y, position.z + this.renderOrigin.z);
  }
}
