import * as THREE from 'three';

export interface CameraSettings {
  autoFollow: boolean;
  distance: number;
  rotationSpeed: number;
  smoothing: number;
}

export const defaultCameraSettings: CameraSettings = {
  autoFollow: true,
  distance: 12,
  rotationSpeed: 1,
  smoothing: 5,
};

/** The camera's horizontal offset from the focus point is (sin(yaw), cos(yaw)). */
export function cameraRelativeMovement(x: number, y: number, yaw: number) {
  const length = Math.hypot(x, y);
  if (length < 0.08) return new THREE.Vector2();
  const scale = 1 / Math.max(1, length);
  return new THREE.Vector2(
    (x * Math.cos(yaw) + y * Math.sin(yaw)) * scale,
    (-x * Math.sin(yaw) + y * Math.cos(yaw)) * scale,
  );
}

export function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function dampAngle(from: number, to: number, rate: number, dt: number) {
  return from + angleDelta(from, to) * (1 - Math.exp(-rate * dt));
}

export function clampCameraDistance(distance: number) {
  return THREE.MathUtils.clamp(distance, 5, 24);
}
