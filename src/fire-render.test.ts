import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attachHandTorch, createHandTorch } from './fire-render';

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
});
