import { describe, expect, it } from 'vitest';
import { angleDelta, cameraPitchView, cameraRelativeMovement, clampCameraDistance, clampCameraPitch, dampAngle } from './camera';

describe('third-person camera', () => {
  it('moves in screen coordinates for any camera yaw', () => {
    expect(cameraRelativeMovement(0, -1, 0).y).toBeCloseTo(-1);
    expect(cameraRelativeMovement(1, 0, 0).x).toBeCloseTo(1);
    expect(cameraRelativeMovement(0, -1, Math.PI / 2).x).toBeCloseTo(-1);
    expect(cameraRelativeMovement(1, 0, Math.PI / 2).y).toBeCloseTo(-1);
    expect(cameraRelativeMovement(0, 1, Math.PI).y).toBeCloseTo(-1);
  });
  it('preserves analog magnitude and clamps diagonal speed', () => {
    expect(cameraRelativeMovement(0, -0.5, 0).length()).toBeCloseTo(0.5);
    expect(cameraRelativeMovement(1, 1, 0).length()).toBeCloseTo(1);
    expect(cameraRelativeMovement(0.01, 0, 0).length()).toBe(0);
  });
  it('rotates through the shortest arc and clamps zoom', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 5, 1)).toBeGreaterThan(Math.PI - 0.1);
    expect(clampCameraDistance(1)).toBe(5);
    expect(clampCameraDistance(100)).toBe(24);
  });
  it('keeps the existing downward orbit but raises aim without putting the camera under the ground', () => {
    expect(cameraPitchView(0.48)).toEqual({ orbit: 0.48, aimSlope: 0 });
    expect(cameraPitchView(0.1)).toEqual({ orbit: 0.1, aimSlope: 0 });
    const upward = cameraPitchView(-1.15);
    expect(upward.orbit).toBe(0.1);
    expect(Math.atan(upward.aimSlope - Math.tan(upward.orbit))).toBeGreaterThan(Math.PI / 3);
    expect(clampCameraPitch(-100)).toBe(-1.15);
    expect(clampCameraPitch(100)).toBe(1.05);
    expect(cameraPitchView(-100)).toEqual(upward);
  });
});
