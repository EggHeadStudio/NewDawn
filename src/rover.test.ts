import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createVehicle } from './assets';
import { geographicToPlanetPosition } from './planet';
import { World } from './world';
import {
  canExitRover, commitRoverDrive, createRoverVisual, getRoverVisual, proposeRoverDrive,
  roverWheelSamplePoints, ROVER_DIMENSIONS,
  type RoverDriveState, type RoverFour, type RoverPose, type RoverVisualFrame, type RoverWheel,
} from './rover';

const keys: RoverWheel[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
const pose: RoverPose = { x: 0, y: 0, z: 0, yaw: 0 };
const flat = (height = 0): RoverFour<number> => ({
  frontLeft: height, frontRight: height, rearLeft: height, rearRight: height,
});
const frame = (overrides: Partial<RoverVisualFrame> = {}): RoverVisualFrame => ({
  pose: { ...pose },
  wheelGroundY: flat(),
  steeringYawRad: 0,
  steeringTurnRad: 0,
  signedProjectedTravel: 0,
  speedMps: 0,
  dt: 1 / 30,
  ...overrides,
});
const named = (root: THREE.Object3D, name: string) => {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};
const wheel = (root: THREE.Object3D, key: RoverWheel) => named(root, `rover-${key}-wheel`) as THREE.Mesh;
const pivot = (root: THREE.Object3D, key: RoverWheel) => named(root, `rover-${key}-steering`);
const body = (root: THREE.Object3D) => named(root, 'rover-body');

describe('rover drive proposal', () => {
  it('only permits exiting at low speed in either direction', () => {
    expect([0, 0.3, -0.3].every(canExitRover)).toBe(true);
    expect([0.31, -0.31, Number.NaN, Infinity].some(canExitRover)).toBe(false);
  });

  it('keeps the existing acceleration, speed limits and neutral drag', () => {
    let state: RoverDriveState = { speedMps: 0, steerYawRad: 0 };
    for (let i = 0; i < 30; i++) state = commitRoverDrive(proposeRoverDrive(state, { throttle: 1, steer: 0 }, 1 / 30), false);
    expect(state.speedMps).toBeCloseTo(5);
    for (let i = 0; i < 30; i++) state = commitRoverDrive(proposeRoverDrive(state, { throttle: 1, steer: 0 }, 1 / 30), false);
    expect(state.speedMps).toBe(6);
    const coasting = proposeRoverDrive(state, { throttle: 0, steer: 0 }, 1 / 30);
    expect(coasting.speedMps).toBeCloseTo(6 * Math.exp(-1.5 / 30));
    expect(coasting.signedMeters).toBeCloseTo(coasting.speedMps / 30);

    state = { speedMps: 0, steerYawRad: 0 };
    for (let i = 0; i < 30; i++) state = commitRoverDrive(proposeRoverDrive(state, { throttle: -1, steer: 0 }, 1 / 30), false);
    expect(state.speedMps).toBe(-2.5);
    expect(proposeRoverDrive(state, { throttle: -1, steer: 0 }, 1 / 30).signedMeters).toBeLessThan(0);
  });

  it('steers smoothly in the correct direction in forward and reverse', () => {
    const forward = proposeRoverDrive({ speedMps: 4, steerYawRad: 0 }, { throttle: 0, steer: 1 }, 1 / 30);
    const reverse = proposeRoverDrive({ speedMps: -2, steerYawRad: 0 }, { throttle: 0, steer: 1 }, 1 / 30);
    const parked = proposeRoverDrive({ speedMps: 0, steerYawRad: 0 }, { throttle: 0, steer: 1 }, 1 / 30);
    expect(forward.steerYawRad).toBeLessThan(0);
    expect(forward.steerYawRad).toBeGreaterThan(-0.55);
    expect(forward.turnRad).toBeLessThan(0);
    expect(reverse.turnRad).toBeGreaterThan(0);
    expect(parked.steerYawRad).toBeLessThan(0);
    expect(parked.turnRad).toBe(0);
    expect(parked.signedMeters).toBe(0);

    const clamped = proposeRoverDrive({ speedMps: 0, steerYawRad: 0 }, { throttle: 4, steer: 5 }, 1 / 30);
    const normal = proposeRoverDrive({ speedMps: 0, steerYawRad: 0 }, { throttle: 1, steer: 1 }, 1 / 30);
    expect(clamped).toEqual(normal);
  });

  it('does not mutate the input and stops on a blocked or partially blocked proposal', () => {
    const state = { speedMps: 2, steerYawRad: -0.2 };
    const proposal = proposeRoverDrive(state, { throttle: 1, steer: -1 }, 1 / 30);
    expect(state).toEqual({ speedMps: 2, steerYawRad: -0.2 });
    expect(commitRoverDrive(proposal, true)).toEqual({ speedMps: 0, steerYawRad: proposal.steerYawRad });
    expect(commitRoverDrive(proposal, false)).toEqual({
      speedMps: proposal.speedMps, steerYawRad: proposal.steerYawRad,
    });
    expect(proposeRoverDrive(state, { throttle: 1, steer: 1 }, 0)).toEqual({
      ...state, turnRad: 0, signedMeters: 0,
    });
    expect(proposeRoverDrive(state, { throttle: 1, steer: 1 }, Number.NaN)).toEqual({
      ...state, turnRad: 0, signedMeters: 0,
    });
  });
});

describe('rover visual', () => {
  it('keeps the legacy factory API and uses bounded opaque, shared geometry', () => {
    const root = createVehicle();
    const visual = getRoverVisual(root);
    expect(visual?.root).toBe(root);
    expect(root.userData.vehicle).toBe(true);
    expect(root.userData.wheels).toHaveLength(4);
    expect(root.userData.wheels.every((part: unknown) => part instanceof THREE.Mesh)).toBe(true);

    let meshCount = 0;
    let triangles = 0;
    const materials = new Set<THREE.Material>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    expect(meshCount).toBeLessThanOrEqual(18);
    expect(triangles).toBeLessThanOrEqual(6000);
    expect(materials.size).toBeLessThanOrEqual(7);
    expect([...materials].every(material => !material.transparent)).toBe(true);
    expect(wheel(root, 'frontLeft').geometry).toBe(wheel(root, 'rearRight').geometry);

    for (const steeringYawRad of [-0.55, 0, 0.55]) {
      visual!.update(frame({ steeringYawRad }));
      const bounds = new THREE.Box3().setFromObject(root);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-ROVER_DIMENSIONS.halfLength);
      expect(bounds.max.x).toBeLessThanOrEqual(ROVER_DIMENSIONS.halfLength);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-ROVER_DIMENSIONS.halfWidth);
      expect(bounds.max.z).toBeLessThanOrEqual(ROVER_DIMENSIONS.halfWidth);
      expect(bounds.min.y).toBeGreaterThan(-0.02);
      expect(bounds.max.y).toBeGreaterThan(1.7);
    }

    // The existing positive rotateY loop also rolls the new legacy meshes forward.
    const tire = wheel(root, 'rearLeft');
    root.updateMatrixWorld(true);
    const contactBefore = tire.localToWorld(new THREE.Vector3(0, 0, -ROVER_DIMENSIONS.wheelRadius));
    const distance = 0.01;
    root.position.x += distance;
    for (const legacy of root.userData.wheels as THREE.Mesh[]) legacy.rotateY(distance / ROVER_DIMENSIONS.wheelRadius);
    root.updateMatrixWorld(true);
    const contactAfter = tire.localToWorld(new THREE.Vector3(0, 0, -ROVER_DIMENSIONS.wheelRadius));
    expect(contactAfter.x).toBeCloseTo(contactBefore.x, 5);
    expect(root.userData.wheels.every((part: THREE.Mesh) => Number.isFinite(part.quaternion.w))).toBe(true);
    visual!.dispose();
  });

  it('samples the four projected wheel centres in place at any root yaw', () => {
    const points: RoverFour<{ x: number; z: number }> = {
      frontLeft: { x: 0, z: 0 }, frontRight: { x: 0, z: 0 },
      rearLeft: { x: 0, z: 0 }, rearRight: { x: 0, z: 0 },
    };
    const left = points.frontLeft;
    roverWheelSamplePoints({ x: 100, y: 7, z: -50, yaw: 0 }, points);
    expect(points.frontLeft).toBe(left);
    expect(points.frontLeft.x).toBeCloseTo(100 + ROVER_DIMENSIONS.wheelbase / 2);
    expect(points.frontLeft.z).toBeCloseTo(-50 - ROVER_DIMENSIONS.track / 2);
    expect(points.rearRight.x).toBeCloseTo(100 - ROVER_DIMENSIONS.wheelbase / 2);
    expect(points.rearRight.z).toBeCloseTo(-50 + ROVER_DIMENSIONS.track / 2);
    roverWheelSamplePoints({ x: 10_000_000, y: 7, z: -50, yaw: Math.PI / 2 }, points);
    expect(points.frontLeft.x).toBeCloseTo(10_000_000 - ROVER_DIMENSIONS.track / 2);
    expect(points.frontLeft.z).toBeCloseTo(-50 - ROVER_DIMENSIONS.wheelbase / 2);
    expect(points.rearRight.x).toBeCloseTo(10_000_000 + ROVER_DIMENSIONS.track / 2);
    expect(points.rearRight.z).toBeCloseTo(-50 + ROVER_DIMENSIONS.wheelbase / 2);
  });

  it('keeps projected wheel offsets finite at the seam, high latitudes and both poles', () => {
    const points: RoverFour<{ x: number; z: number }> = {
      frontLeft: { x: 0, z: 0 }, frontRight: { x: 0, z: 0 },
      rearLeft: { x: 0, z: 0 }, rearRight: { x: 0, z: 0 },
    };
    const yaw = 0.83;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const latitude of [-90, -85, -60, 0, 60, 85, 90]) {
      for (const longitude of [-179.999999, 0, 179.999999]) {
        const centre = geographicToPlanetPosition(latitude, longitude);
        roverWheelSamplePoints({ ...centre, y: 0, yaw }, points);
        for (const key of keys) {
          const dx = points[key].x - centre.x, dz = points[key].z - centre.z;
          const localX = cos * dx - sin * dz;
          const localZ = sin * dx + cos * dz;
          expect(localX).toBeCloseTo((key.startsWith('front') ? 1 : -1) * ROVER_DIMENSIONS.wheelbase / 2, 7);
          expect(localZ).toBeCloseTo((key.endsWith('Left') ? -1 : 1) * ROVER_DIMENSIONS.track / 2, 7);
        }
      }
    }
    // This verifies the active projected frame only, not polar physical contact.
  });

  it('accepts real terrain samples, including edited ground and projected polar copies', () => {
    const world = new World(1847, 1);
    const visual = createRoverVisual();
    const points: RoverFour<{ x: number; z: number }> = {
      frontLeft: { x: 0, z: 0 }, frontRight: { x: 0, z: 0 },
      rearLeft: { x: 0, z: 0 }, rearRight: { x: 0, z: 0 },
    };
    const ground = flat();
    const before = world.heightAt(1.175, -0.75);
    try {
      world.editTerrain(0, 0, 2, 'raise');
      expect(world.heightAt(1.175, -0.75)).toBeGreaterThan(before);
      for (const latitude of [-90, -85, -60, 0, 60, 85, 90]) {
        for (const longitude of [0, -179.999999, 179.999999]) {
          const centre = geographicToPlanetPosition(latitude, longitude);
          const placed = { ...centre, y: world.heightAt(centre.x, centre.z), yaw: 0.83 };
          roverWheelSamplePoints(placed, points);
          for (const key of keys) ground[key] = world.heightAt(points[key].x, points[key].z);
          visual.reset(placed, ground);
          visual.root.updateMatrixWorld(true);
          for (const key of keys) {
            const centreY = wheel(visual.root, key).getWorldPosition(new THREE.Vector3()).y;
            expect(Number.isFinite(ground[key])).toBe(true);
            expect(centreY - ROVER_DIMENSIONS.wheelRadius).toBeCloseTo(ground[key], 7);
          }
        }
      }
    } finally {
      visual.dispose();
      world.dispose();
    }
    // The test samples heights; it does not render or validate geographic contact.
  });

  it('smooths body pitch and roll while the four tire centres follow the supplied heights', () => {
    const visual = createRoverVisual();
    const placed = { x: 20, y: 4, z: -7, yaw: 0.7 };
    visual.reset(placed, flat(4));
    const halfLength = ROVER_DIMENSIONS.wheelbase / 2;
    const halfTrack = ROVER_DIMENSIONS.track / 2;
    const height = (x: number, z: number) => 4 + 0.2 * x + 0.1 * z;
    const ground: RoverFour<number> = {
      frontLeft: height(halfLength, -halfTrack),
      frontRight: height(halfLength, halfTrack),
      rearLeft: height(-halfLength, -halfTrack),
      rearRight: height(-halfLength, halfTrack),
    };
    visual.update(frame({ pose: placed, wheelGroundY: ground }));
    const chassis = body(visual.root);
    expect(chassis.rotation.z).toBeGreaterThan(0);
    expect(chassis.rotation.z).toBeLessThan(Math.atan(0.2));
    expect(chassis.rotation.x).toBeLessThan(0);
    expect(chassis.rotation.x).toBeGreaterThan(-Math.atan(0.1));
    expect(visual.root.rotation.x).toBe(0);
    expect(visual.root.rotation.y).toBeCloseTo(placed.yaw);
    expect(visual.root.rotation.z).toBe(0);

    visual.root.updateMatrixWorld(true);
    for (const key of keys) {
      const centre = wheel(visual.root, key).getWorldPosition(new THREE.Vector3());
      expect(centre.y - ROVER_DIMENSIONS.wheelRadius).toBeCloseTo(ground[key]);
    }
    for (let i = 0; i < 120; i++) visual.update(frame({ pose: placed, wheelGroundY: ground }));
    expect(chassis.rotation.z).toBeCloseTo(Math.atan(0.2));
    expect(chassis.rotation.x).toBeCloseTo(-Math.atan(0.1));
    visual.dispose();
  });

  it('steers the front tires and rolls them from accepted travel, including reverse and turns', () => {
    const visual = createRoverVisual();
    visual.update(frame({ steeringYawRad: -0.3, signedProjectedTravel: ROVER_DIMENSIONS.wheelRadius }));
    expect(pivot(visual.root, 'frontLeft').rotation.y).toBeCloseTo(-0.3);
    expect(pivot(visual.root, 'frontRight').rotation.y).toBeCloseTo(-0.3);
    expect(pivot(visual.root, 'rearLeft').rotation.y).toBe(0);
    expect(pivot(visual.root, 'rearRight').rotation.y).toBe(0);
    for (const key of keys) expect(wheel(visual.root, key).rotation.y).toBeCloseTo(1);
    visual.update(frame({ signedProjectedTravel: -ROVER_DIMENSIONS.wheelRadius }));
    for (const key of keys) expect(wheel(visual.root, key).rotation.y).toBeCloseTo(0);

    visual.reset(pose, flat());
    visual.update(frame({ signedProjectedTravel: ROVER_DIMENSIONS.wheelRadius, steeringTurnRad: -0.1 }));
    const left = wheel(visual.root, 'frontLeft').rotation.y;
    const right = wheel(visual.root, 'frontRight').rotation.y;
    expect(left).toBeGreaterThan(right); // right turn: left/outside tire travels farther
    expect((left + right) / 2).toBeCloseTo(1);
    expect(wheel(visual.root, 'rearLeft').rotation.y).toBeCloseTo(left);
    expect(wheel(visual.root, 'rearRight').rotation.y).toBeCloseTo(right);
    visual.dispose();
  });

  it('rolls a tire contact point backward relative to forward translation', () => {
    const visual = createRoverVisual();
    const tire = wheel(visual.root, 'rearLeft');
    const distance = 0.01;
    visual.update(frame({ pose: { ...pose, x: distance }, signedProjectedTravel: distance }));
    visual.root.updateMatrixWorld(true);
    const initialContact = tire.localToWorld(new THREE.Vector3(0, 0, -ROVER_DIMENSIONS.wheelRadius));
    expect(initialContact.x).toBeCloseTo(-ROVER_DIMENSIONS.wheelbase / 2, 5);
    expect(initialContact.y).toBeCloseTo(0, 3);
    visual.dispose();
  });

  it('does not mistake blocking, reprojection or a loaded position for wheel travel', () => {
    const visual = createRoverVisual();
    visual.update(frame({ signedProjectedTravel: 0.2 }));
    const before = wheel(visual.root, 'frontLeft').rotation.y;
    visual.update(frame({
      pose: { x: 20_000_000, y: 10, z: -8_000_000, yaw: Math.PI },
      wheelGroundY: flat(10), steeringTurnRad: 0.2, signedProjectedTravel: 0,
    }));
    expect(wheel(visual.root, 'frontLeft').rotation.y).toBe(before);
    const loaded = { x: -12, y: 3, z: 15, yaw: 1.2 };
    visual.reset(loaded, flat(3));
    expect(visual.root.position.toArray()).toEqual([loaded.x, loaded.y, loaded.z]);
    expect(visual.root.rotation.y).toBeCloseTo(loaded.yaw);
    for (const key of keys) {
      expect(wheel(visual.root, key).rotation.y).toBe(0);
      expect(pivot(visual.root, key).rotation.y).toBe(0);
    }
    expect(body(visual.root).rotation.x).toBe(0);
    expect(body(visual.root).rotation.z).toBe(0);
    visual.dispose();
  });

  it('adds bounded acceleration/turn lean and settles when motion ends', () => {
    const visual = createRoverVisual();
    visual.update(frame({ speedMps: 6, steeringTurnRad: -0.03 }));
    const chassis = body(visual.root);
    expect(chassis.rotation.z).toBeGreaterThan(0);
    expect(chassis.rotation.x).toBeLessThan(0);
    expect(Math.abs(chassis.rotation.z)).toBeLessThan(0.5);
    expect(Math.abs(chassis.rotation.x)).toBeLessThan(0.42);
    for (let i = 0; i < 150; i++) visual.update(frame());
    expect(chassis.rotation.z).toBeCloseTo(0, 5);
    expect(chassis.rotation.x).toBeCloseTo(0, 5);
    visual.dispose();
  });

  it('disposes each owned shared resource once without affecting another rover', () => {
    const first = createRoverVisual();
    const second = createRoverVisual();
    const scene = new THREE.Scene();
    scene.add(first.root, second.root);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    first.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    const geometrySpies = [...geometries].map(geometry => vi.spyOn(geometry, 'dispose'));
    const materialSpies = [...materials].map(material => vi.spyOn(material, 'dispose'));
    expect(wheel(first.root, 'frontLeft').geometry).not.toBe(wheel(second.root, 'frontLeft').geometry);
    first.dispose();
    first.dispose();
    expect(first.root.parent).toBeNull();
    expect(second.root.parent).toBe(scene);
    expect(getRoverVisual(first.root)).toBeUndefined();
    expect(getRoverVisual(second.root)).toBe(second);
    for (const spy of [...geometrySpies, ...materialSpies]) expect(spy).toHaveBeenCalledTimes(1);
    second.update(frame({ signedProjectedTravel: 0.2 }));
    expect(wheel(second.root, 'frontLeft').rotation.y).not.toBe(0);
    second.dispose();
    vi.restoreAllMocks();
  });
});
