import { nearestPlanetPosition, PlanetTangentFrame } from './planet';
import { transportBearing } from './geography';

type Position = { x: number; y: number; z: number };

export class PlanetaryProjectile {
  readonly velocity: Position;
  private frame: PlanetTangentFrame;
  private localX = 0;
  private localZ = 0;
  private altitude: number;
  private position: { x: number; z: number };
  private readonly gravity: number;

  constructor(origin: Position, velocity: Position, frame = new PlanetTangentFrame(origin), gravity = 9.8) {
    this.frame = frame;
    this.velocity = { ...velocity };
    this.altitude = origin.y;
    this.position = { x: origin.x, z: origin.z };
    this.gravity = gravity;
    const local = frame.toLocal(origin);
    this.localX = local.x;
    this.localZ = local.z;
  }

  rebase(frame: PlanetTangentFrame) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0) {
      const bearing = Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
      const transported = transportBearing(this.frame.origin, frame.origin, bearing) * Math.PI / 180;
      this.velocity.x = Math.sin(transported) * speed;
      this.velocity.z = Math.cos(transported) * speed;
    }
    this.frame = frame;
    const local = frame.toLocal(this.position);
    this.localX = local.x;
    this.localZ = local.z;
  }

  step(dt: number): Position {
    this.velocity.y -= this.gravity * dt;
    this.localX += this.velocity.x * dt;
    this.localZ += this.velocity.z * dt;
    this.altitude += this.velocity.y * dt;
    const position = this.frame.toPlanet({ x: this.localX, z: this.localZ });
    this.position = nearestPlanetPosition(position.x, position.z, this.position.x, this.position.z);
    return { ...this.position, y: this.altitude };
  }
}
