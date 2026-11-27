import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attachHandTorch, createHandTorch, FireSparks, torchFirePosition } from './fire-render';

describe('handheld torch attachment', () => {
  it('moves from the procedural arm to the authored hand when the asset loads', () => {
    const character = new THREE.Group();
    const elbow = new THREE.Group();
    elbow.name = 'elbowL';
    character.add(elbow);
    const torch = createHandTorch();
    attachHandTorch(character, torch.group);
    expect(torch.group.parent).toBe(elbow);
    const authored = new THREE.Group();
    authored.name = 'authored-character';
    const hand = new THREE.Bone();
    hand.name = 'hand_l';
    authored.add(hand);
    character.add(authored);
    hand.rotation.z = Math.PI / 2;
    attachHandTorch(character, torch.group);
    expect(torch.group.parent).toBe(hand);
    expect(torch.light.parent).toBe(torch.group);
    torch.group.updateWorldMatrix(true, false);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(torch.group.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.y).toBeCloseTo(1);
  });

  it('converts the rendered hand flame back to global coordinates', () => {
    const scene = new THREE.Scene();
    const origin = new THREE.Vector3(20_000_000, 0, 9_000_000);
    scene.position.copy(origin).negate();
    const torch = createHandTorch();
    torch.group.position.set(20_000_001.25, 4, 9_000_000.5);
    scene.add(torch.group);
    const position = torchFirePosition(torch.fire, origin);
    expect(position.x).toBeCloseTo(20_000_001.25, 5);
    expect(position.y).toBeCloseTo(4.52, 5);
    expect(position.z).toBeCloseTo(9_000_000.5, 5);
  });

  describe('fire sparks', () => {
    it('keeps distant particles near their sources with sub-meter precision', () => {
      const scene = new THREE.Scene();
      const sparks = new FireSparks(scene);
      const origins = [new THREE.Vector3(20_000_001.25, 4, 9_000_000.5), new THREE.Vector3(20_000_003.75, 5, 9_000_002)];
      sparks.update(origins, 0.5);
      const points = scene.children[0] as THREE.Points;
      const positions = points.geometry.getAttribute('position');
      expect(points.position.equals(origins[0])).toBe(true);
      expect(positions.getX(0)).toBeCloseTo(Math.sin(1) * 0.35 * 0.12, 6);
      expect(positions.getX(4)).toBeCloseTo(2.5 + Math.sin(1) * 0.48 * 0.12, 6);
      expect(positions.getY(4)).toBeCloseTo(1 + 0.48 * 0.6, 6);
      expect(points.geometry.drawRange.count).toBe(8);
      sparks.update([], 1);
      expect(points.visible).toBe(false);
    });
  });
});
