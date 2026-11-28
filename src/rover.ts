import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Dimensions are in the current projected gameplay frame. The root is at the
 * ground below the centre of the rover; forward is +X and right is +Z.
 */
export const ROVER_DIMENSIONS = Object.freeze({
  wheelbase: 2.35,
  track: 1.5,
  wheelRadius: 0.34,
  wheelWidth: 0.28,
  halfLength: 1.9,
  // Includes the outward sweep of the front tires at full steering lock.
  halfWidth: 1.05,
});

export type RoverWheel = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
export type RoverFour<T> = Record<RoverWheel, T>;
export type RoverPose = { x: number; y: number; z: number; yaw: number };
export type RoverDriveState = { speedMps: number; steerYawRad: number };
export type RoverDriveInput = { throttle: number; steer: number };
export type RoverDriveProposal = RoverDriveState & { turnRad: number; signedMeters: number };

export function canExitRover(speedMps: number): boolean {
  return Number.isFinite(speedMps) && Math.abs(speedMps) <= 0.3;
}

export interface RoverVisualFrame {
  pose: RoverPose;
  /** Absolute support heights in the same projected frame as pose. */
  wheelGroundY: Readonly<RoverFour<number>>;
  /** Three.js yaw sign; a right turn is negative. */
  steeringYawRad: number;
  /** Accepted steering turn, excluding geographic heading transport. */
  steeringTurnRad: number;
  /** Signed accepted path length in the visible/projected frame. */
  signedProjectedTravel: number;
  /** Speed after collision resolution, in physical metres per second. */
  speedMps: number;
  dt: number;
}

export interface RoverVisual {
  readonly root: THREE.Group;
  update(frame: RoverVisualFrame): void;
  reset(pose: RoverPose, wheelGroundY: Readonly<RoverFour<number>>): void;
  dispose(): void;
}

const MAX_STEER = 0.55;
const MAX_PITCH = 0.5;
const MAX_ROLL = 0.42;
const WHEEL_LAYOUT: ReadonlyArray<{
  key: RoverWheel;
  x: number;
  z: number;
  front: boolean;
}> = [
  { key: 'frontLeft', x: ROVER_DIMENSIONS.wheelbase / 2, z: -ROVER_DIMENSIONS.track / 2, front: true },
  { key: 'frontRight', x: ROVER_DIMENSIONS.wheelbase / 2, z: ROVER_DIMENSIONS.track / 2, front: true },
  { key: 'rearLeft', x: -ROVER_DIMENSIONS.wheelbase / 2, z: -ROVER_DIMENSIONS.track / 2, front: false },
  { key: 'rearRight', x: -ROVER_DIMENSIONS.wheelbase / 2, z: ROVER_DIMENSIONS.track / 2, front: false },
];

/**
 * A proposal only: the caller remains responsible for movement and collision.
 * The existing acceleration, speed limits and no-throttle drag are preserved.
 * Positive steering input is driver-right. Only non-negative finite dt advances
 * the state; gameplay supplies the existing 30 Hz fixed step.
 */
export function proposeRoverDrive(
  state: RoverDriveState,
  input: RoverDriveInput,
  dt: number,
): RoverDriveProposal {
  if (!Number.isFinite(dt) || dt <= 0) return { ...state, turnRad: 0, signedMeters: 0 };
  const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
  const targetSteer = -THREE.MathUtils.clamp(input.steer, -1, 1) * MAX_STEER;
  let speedMps = THREE.MathUtils.clamp(state.speedMps + throttle * 5 * dt, -2.5, 6);
  if (Math.abs(throttle) < 0.08) speedMps *= Math.exp(-1.5 * dt);
  const steerYawRad = THREE.MathUtils.lerp(state.steerYawRad, targetSteer, 1 - Math.exp(-8 * dt));
  const turnRad = Math.abs(speedMps) > 0.1
    ? speedMps / ROVER_DIMENSIONS.wheelbase * Math.tan(steerYawRad) * dt
    : 0;
  return { speedMps, steerYawRad, turnRad, signedMeters: speedMps * dt };
}

/** A blocking contact stops the vehicle, including after a partially accepted move. */
export function commitRoverDrive(proposal: RoverDriveProposal, blocked: boolean): RoverDriveState {
  return { speedMps: blocked ? 0 : proposal.speedMps, steerYawRad: proposal.steerYawRad };
}

/**
 * Reuse the caller's four point objects. No render-origin offset, geographic
 * conversion, terrain lookup, or mutation of the pose is performed here.
 */
export function roverWheelSamplePoints(pose: RoverPose, out: RoverFour<{ x: number; z: number }>): void {
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  for (const wheel of WHEEL_LAYOUT) {
    out[wheel.key].x = pose.x + cos * wheel.x + sin * wheel.z;
    out[wheel.key].z = pose.z - sin * wheel.x + cos * wheel.z;
  }
}

type BodyPart = 'paint' | 'trim' | 'glass' | 'metal' | 'headlights' | 'taillights';
type BodyParts = Record<BodyPart, THREE.BufferGeometry[]>;

/** Merge static details by material, keeping both scene nodes and draws bounded. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map(original => {
    const geometry = original.index ? original.toNonIndexed() : original;
    if (geometry !== original) original.dispose();
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
    }
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    return geometry;
  });
  const merged = mergeGeometries(prepared);
  prepared.forEach(geometry => geometry.dispose());
  if (!merged) throw new Error('Unable to build rover geometry');
  return merged;
}

function box(
  parts: THREE.BufferGeometry[],
  width: number, height: number, depth: number,
  x: number, y: number, z: number,
  rotationZ = 0,
): void {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rotationZ) geometry.rotateZ(rotationZ);
  geometry.translate(x, y, z);
  parts.push(geometry);
}

function beam(
  parts: THREE.BufferGeometry[],
  x1: number, y1: number, x2: number, y2: number,
  z: number, thickness: number, depth: number,
): void {
  box(parts, Math.hypot(x2 - x1, y2 - y1), thickness, depth,
    (x1 + x2) / 2, (y1 + y2) / 2, z, Math.atan2(y2 - y1, x2 - x1));
}

function extrudedProfile(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function bodyShell(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.75, 0.52);
  for (const x of [-ROVER_DIMENSIONS.wheelbase / 2, ROVER_DIMENSIONS.wheelbase / 2]) {
    shape.lineTo(x - 0.42, 0.52);
    shape.quadraticCurveTo(x - 0.40, 0.79, x, 0.79);
    shape.quadraticCurveTo(x + 0.40, 0.79, x + 0.42, 0.52);
  }
  shape.lineTo(1.75, 0.52);
  shape.lineTo(1.75, 0.98);
  shape.lineTo(1.58, 1.10);
  shape.lineTo(0.52, 1.15);
  shape.lineTo(-1.5, 1.15);
  shape.lineTo(-1.75, 1.02);
  shape.closePath();
  return extrudedProfile(shape, 1.36);
}

function cabinGlass(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.49, 1.14);
  shape.lineTo(0.52, 1.14);
  shape.lineTo(0.13, 1.70);
  shape.lineTo(-1.19, 1.70);
  shape.closePath();
  return extrudedProfile(shape, 1.16);
}

function hood(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.44, 1.14);
  shape.lineTo(1.62, 1.09);
  shape.lineTo(1.48, 1.21);
  shape.lineTo(0.44, 1.24);
  shape.closePath();
  return extrudedProfile(shape, 1.2);
}

/** An opaque, outward-facing arch strip; no alpha cards are needed. */
function fenderArch(x: number, side: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const segments = 14;
  const start = 0.28;
  const span = Math.PI - 2 * start;
  const z = side * 0.686;
  const vertex = (radius: number, angle: number) => [
    x + Math.cos(angle) * radius,
    ROVER_DIMENSIONS.wheelRadius + Math.sin(angle) * radius,
    z,
  ];
  for (let i = 0; i < segments; i++) {
    const a = start + span * i / segments;
    const b = start + span * (i + 1) / segments;
    const innerA = vertex(0.405, a), outerA = vertex(0.47, a);
    const innerB = vertex(0.405, b), outerB = vertex(0.47, b);
    if (side > 0) vertices.push(...innerA, ...outerA, ...outerB, ...innerA, ...outerB, ...innerB);
    else vertices.push(...innerA, ...outerB, ...outerA, ...innerA, ...innerB, ...outerB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBodyParts(): BodyParts {
  const parts: BodyParts = { paint: [], trim: [], glass: [], metal: [], headlights: [], taillights: [] };
  parts.paint.push(bodyShell(), hood());
  parts.glass.push(cabinGlass());

  // Roof and framed, dark windows give the cabin an actual vehicle silhouette.
  box(parts.paint, 1.52, 0.10, 1.25, -0.54, 1.74, 0);
  for (const side of [-1, 1]) {
    const z = side * 0.60;
    beam(parts.paint, 0.52, 1.15, 0.13, 1.70, z, 0.085, 0.075);
    beam(parts.paint, -1.49, 1.15, -1.19, 1.70, z, 0.085, 0.075);
    beam(parts.paint, -0.54, 1.15, -0.56, 1.70, z, 0.070, 0.075);
    box(parts.trim, 1.94, 0.045, 0.045, -0.48, 1.16, z);

    // Doors, handles, side steps and small mirrors sit inside the wheel track.
    box(parts.trim, 0.025, 0.42, 0.025, -0.53, 0.90, side * 0.688);
    box(parts.trim, 1.42, 0.08, 0.13, -0.20, 0.50, side * 0.72);
    for (const x of [-1.12, -0.15]) {
      box(parts.metal, 0.14, 0.035, 0.025, x, 1.08, side * 0.697);
    }
    box(parts.trim, 0.10, 0.04, 0.15, 0.43, 1.38, side * 0.69);
    box(parts.trim, 0.19, 0.12, 0.14, 0.44, 1.40, side * 0.82);
    parts.trim.push(fenderArch(-ROVER_DIMENSIONS.wheelbase / 2, side));
    parts.trim.push(fenderArch(ROVER_DIMENSIONS.wheelbase / 2, side));

    box(parts.trim, 0.04, 0.18, 0.29, 1.75, 0.88, side * 0.46);
    box(parts.headlights, 0.025, 0.12, 0.24, 1.78, 0.88, side * 0.46);
    box(parts.trim, 0.04, 0.22, 0.20, -1.75, 0.88, side * 0.53);
    box(parts.taillights, 0.025, 0.16, 0.15, -1.78, 0.88, side * 0.53);
  }

  // Chassis, bumpers, grille and roof rails.
  box(parts.trim, 3.25, 0.14, 0.96, 0, 0.52, 0);
  box(parts.trim, 0.13, 0.18, 1.42, 1.82, 0.54, 0);
  box(parts.trim, 0.13, 0.18, 1.42, -1.82, 0.54, 0);
  box(parts.trim, 0.035, 0.25, 0.60, 1.77, 0.80, 0);
  for (const y of [0.72, 0.77, 0.82, 0.87]) {
    box(parts.metal, 0.02, 0.012, 0.50, 1.795, y, 0);
  }
  for (const z of [-0.47, 0.47]) {
    box(parts.trim, 1.42, 0.045, 0.045, -0.55, 1.83, z);
  }
  for (const x of [-1.05, -0.05]) {
    box(parts.metal, 0.055, 0.035, 0.98, x, 1.86, 0);
  }
  // Windscreen wipers and a rear plate are opaque, not transparent overlays.
  for (const z of [-0.25, 0.25]) {
    box(parts.trim, 0.025, 0.025, 0.37, 0.475, 1.22, z);
  }
  box(parts.metal, 0.025, 0.09, 0.31, -1.795, 0.67, 0);
  return parts;
}

function tireGeometry(): THREE.BufferGeometry {
  const r = ROVER_DIMENSIONS.wheelRadius;
  const halfWidth = ROVER_DIMENSIONS.wheelWidth / 2;
  const profile = [
    new THREE.Vector2(0, -halfWidth),
    new THREE.Vector2(r * 0.65, -halfWidth),
    new THREE.Vector2(r * 0.87, -halfWidth),
    new THREE.Vector2(r * 0.98, -halfWidth * 0.72),
    new THREE.Vector2(r, -halfWidth * 0.3),
    new THREE.Vector2(r, halfWidth * 0.3),
    new THREE.Vector2(r * 0.98, halfWidth * 0.72),
    new THREE.Vector2(r * 0.87, halfWidth),
    new THREE.Vector2(r * 0.65, halfWidth),
    new THREE.Vector2(0, halfWidth),
  ];
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(profile, 20)];
  for (let i = 0; i < 20; i++) {
    const angle = i * Math.PI * 2 / 20;
    const tread = new THREE.BoxGeometry(0.009, 0.21, 0.046);
    tread.rotateY(angle);
    tread.translate(Math.cos(angle) * (r - 0.005), 0, -Math.sin(angle) * (r - 0.005));
    parts.push(tread);
  }
  return mergeParts(parts);
}

function rimGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const ring = new THREE.TorusGeometry(0.145, 0.012, 4, 16);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, side * 0.135, 0);
    parts.push(ring);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.BoxGeometry(0.028, 0.012, 0.27);
      spoke.rotateY(i * Math.PI / 3);
      spoke.translate(0, side * 0.14, 0);
      parts.push(spoke);
    }
    const cap = new THREE.CylinderGeometry(0.05, 0.05, 0.018, 12);
    cap.translate(0, side * 0.14, 0);
    parts.push(cap);
  }
  return mergeParts(parts);
}

const visualByRoot = new WeakMap<THREE.Group, RoverVisual>();

/**
 * Returns the controller for a root made by createRoverVisual (including through
 * the legacy createVehicle factory), until that controller has been disposed.
 */
export function getRoverVisual(root: THREE.Group): RoverVisual | undefined {
  return visualByRoot.get(root);
}

export function createRoverVisual(): RoverVisual {
  const root = new THREE.Group();
  root.name = 'rover';
  root.userData.vehicle = true;
  const body = new THREE.Group();
  body.name = 'rover-body';
  root.add(body);

  const materials: Record<BodyPart | 'tire', THREE.MeshStandardMaterial> = {
    paint: new THREE.MeshStandardMaterial({ color: '#945441', roughness: 0.67, metalness: 0.18 }),
    trim: new THREE.MeshStandardMaterial({ color: '#293130', roughness: 0.86, metalness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: '#344a50', roughness: 0.26, metalness: 0.22 }),
    metal: new THREE.MeshStandardMaterial({ color: '#a4aaa2', roughness: 0.55, metalness: 0.58 }),
    headlights: new THREE.MeshStandardMaterial({
      color: '#eee3bd', emissive: '#665437', emissiveIntensity: 0.25, roughness: 0.42,
    }),
    taillights: new THREE.MeshStandardMaterial({
      color: '#943d31', emissive: '#5d1a13', emissiveIntensity: 0.18, roughness: 0.55,
    }),
    tire: new THREE.MeshStandardMaterial({ color: '#242a29', roughness: 0.95 }),
  };
  const geometries = new Set<THREE.BufferGeometry>();
  const parts = makeBodyParts();
  for (const key of Object.keys(parts) as BodyPart[]) {
    const geometry = mergeParts(parts[key]);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `rover-${key}`;
    mesh.castShadow = key === 'paint' || key === 'trim' || key === 'glass';
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  const tire = tireGeometry();
  const rim = rimGeometry();
  geometries.add(tire);
  geometries.add(rim);
  const wheels = WHEEL_LAYOUT.map(layout => {
    const pivot = new THREE.Group();
    pivot.name = `rover-${layout.key}-steering`;
    pivot.position.set(layout.x, ROVER_DIMENSIONS.wheelRadius, layout.z);
    root.add(pivot);
    const wheel = new THREE.Mesh(tire, materials.tire);
    wheel.name = `rover-${layout.key}-wheel`;
    // Local +Y maps to -Z, so the legacy positive rotateY also rolls forward.
    wheel.rotation.x = -Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(rim, materials.metal);
    hub.name = `rover-${layout.key}-rim`;
    wheel.add(hub);
    return { ...layout, pivot, wheel, spin: 0 };
  });
  // The old main loop calls rotateY() on these meshes. Once the new controller
  // is wired, that loop must be removed so spin has a single owner.
  root.userData.wheels = wheels.map(wheel => wheel.wheel);

  let previousSpeed = 0;
  let disposed = false;

  const applyPose = (pose: RoverPose) => {
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.set(0, pose.yaw, 0);
  };

  const applyWheelHeights = (pose: RoverPose, ground: Readonly<RoverFour<number>>, steering: number) => {
    for (const wheel of wheels) {
      wheel.pivot.position.y = ground[wheel.key] - pose.y + ROVER_DIMENSIONS.wheelRadius;
      wheel.pivot.rotation.y = wheel.front ? steering : 0;
    }
  };

  const slope = { mean: 0, pitch: 0, roll: 0 };
  const sampleSurface = (ground: Readonly<RoverFour<number>>) => {
    const front = (ground.frontLeft + ground.frontRight) / 2;
    const rear = (ground.rearLeft + ground.rearRight) / 2;
    const left = (ground.frontLeft + ground.rearLeft) / 2;
    const right = (ground.frontRight + ground.rearRight) / 2;
    slope.mean = (front + rear) / 2;
    slope.pitch = Math.atan2(front - rear, ROVER_DIMENSIONS.wheelbase);
    slope.roll = Math.atan2(left - right, ROVER_DIMENSIONS.track);
  };

  const visual: RoverVisual = {
    root,
    reset(pose, ground) {
      if (disposed) return;
      applyPose(pose);
      sampleSurface(ground);
      body.position.y = slope.mean - pose.y;
      body.rotation.set(
        THREE.MathUtils.clamp(slope.roll, -MAX_ROLL, MAX_ROLL),
        0,
        THREE.MathUtils.clamp(slope.pitch, -MAX_PITCH, MAX_PITCH),
      );
      applyWheelHeights(pose, ground, 0);
      for (const wheel of wheels) {
        wheel.spin = 0;
        wheel.wheel.rotation.set(-Math.PI / 2, 0, 0);
      }
      previousSpeed = 0;
    },
    update(frame) {
      if (disposed) return;
      const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? frame.dt : 0;
      applyPose(frame.pose);
      applyWheelHeights(frame.pose, frame.wheelGroundY,
        THREE.MathUtils.clamp(frame.steeringYawRad, -MAX_STEER, MAX_STEER));

      sampleSurface(frame.wheelGroundY);
      const acceleration = dt ? THREE.MathUtils.clamp((frame.speedMps - previousSpeed) / dt, -8, 8) : 0;
      const turnRate = dt ? THREE.MathUtils.clamp(frame.steeringTurnRad / dt, -2, 2) : 0;
      const targetPitch = THREE.MathUtils.clamp(slope.pitch + acceleration * 0.009, -MAX_PITCH, MAX_PITCH);
      const targetRoll = THREE.MathUtils.clamp(slope.roll + frame.speedMps * turnRate * 0.014, -MAX_ROLL, MAX_ROLL);
      const blend = 1 - Math.exp(-7 * dt);
      body.position.y = THREE.MathUtils.lerp(body.position.y, slope.mean - frame.pose.y, blend);
      body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, targetPitch, blend);
      body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, targetRoll, blend);
      if (dt) previousSpeed = frame.speedMps;

      if (frame.signedProjectedTravel !== 0) {
        for (const wheel of wheels) {
          // A -Z axle requires positive rotation for forward +X travel. The
          // inner/outer differential is approximate, not a rigid-body solver.
          const travel = frame.signedProjectedTravel + wheel.z * frame.steeringTurnRad;
          wheel.spin = (wheel.spin + travel / ROVER_DIMENSIONS.wheelRadius) % (2 * Math.PI);
          wheel.wheel.rotation.set(-Math.PI / 2, wheel.spin, 0);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visualByRoot.delete(root);
      root.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      Object.values(materials).forEach(material => material.dispose());
    },
  };
  visualByRoot.set(root, visual);
  visual.reset(
    { x: 0, y: 0, z: 0, yaw: 0 },
    { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
  );
  return visual;
}
