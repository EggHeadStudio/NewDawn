import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { authoredAnimation, poseSawArm, visibleCharacterTool } from './authored-character';

describe('authored character animation selection', () => {
  it('selects locomotion and action clips without changing movement rules', () => {
    expect(authoredAnimation(0, false, undefined, false)).toBe('Idle_Loop');
    expect(authoredAnimation(1, false, undefined, false)).toBe('Walk_Loop');
    expect(authoredAnimation(1, true, undefined, false)).toBe('Sprint_Loop');
    expect(authoredAnimation(1, false, 'attack', false)).toBe('Sword_Attack');
    expect(authoredAnimation(0, false, 'saw', false)).toBe('Fixing_Kneeling');
    expect(authoredAnimation(0, false, 'hurt', false)).toBe('Hit_Chest');
    expect(authoredAnimation(0, false, 'build', false)).toBe('PickUp_Table');
  });

  it('shows the selected tool except when an action requires a different tool', () => {
    expect(visibleCharacterTool(undefined, null)).toBeNull();
    expect(visibleCharacterTool(undefined, 'saw')).toBe('saw');
    expect(visibleCharacterTool('gather', 'stick')).toBe('stick');
    expect(visibleCharacterTool('attack', 'chop')).toBe('chop');
    expect(visibleCharacterTool('build', 'saw')).toBe('chop');
    expect(visibleCharacterTool('mine', 'stick')).toBe('mine');
    expect(visibleCharacterTool('saw', null)).toBe('saw');
  });

  it('keeps the saw attached and aims its blade at the cut for reachable and distant targets', () => {
    const root = new THREE.Group();
    root.position.set(8, 2, -4);
    root.rotation.y = 0.7;
    const upper = new THREE.Bone();
    const lower = new THREE.Bone();
    const hand = new THREE.Bone();
    const saw = new THREE.Group();
    lower.position.y = -0.3;
    hand.position.y = -0.3;
    root.add(upper);
    upper.add(lower);
    lower.add(hand);
    hand.add(saw);
    for (const target of [new THREE.Vector3(8.35, 1.7, -3.8), new THREE.Vector3(20, 1, 0)]) {
      poseSawArm(upper, lower, hand, saw, target, 0.5);
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(saw.getWorldQuaternion(new THREE.Quaternion()));
      expect(blade.dot(target.clone().sub(wrist).normalize())).toBeGreaterThan(0.999);
      expect(saw.position.length()).toBe(0);
      expect(upper.quaternion.toArray().every(Number.isFinite)).toBe(true);
      expect(lower.quaternion.toArray().every(Number.isFinite)).toBe(true);
    }
  });
});
