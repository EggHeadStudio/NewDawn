import * as THREE from 'three';

export type VegetationQuality = 'low' | 'medium' | 'high';
export type TreeDetail = 'near' | 'mid';

const distances: Record<VegetationQuality, number> = { low: 12, medium: 24, high: 32 };

export function treeDetail(distance: number, current: TreeDetail, quality: VegetationQuality): TreeDetail {
  const boundary = distances[quality];
  return current === 'near' ? (distance > boundary + 3 ? 'mid' : 'near')
    : (distance < boundary - 3 ? 'near' : 'mid');
}

export function coverCount(total: number, detail: TreeDetail, quality: VegetationQuality): number {
  const fraction = detail === 'near'
    ? (quality === 'low' ? 0.8 : 1)
    : (quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 0.85);
  return Math.ceil(total * fraction);
}

export function computeFullCoverBounds(mesh: THREE.InstancedMesh) {
  const count = mesh.count;
  mesh.count = mesh.instanceMatrix.count;
  mesh.computeBoundingSphere();
  mesh.count = count;
}

export function makeMidFoliage(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const indices = source.index;
  if (!position || !indices || indices.count % 3 !== 0) throw new Error('Indexed foliage geometry required');
  const parent = new Int32Array(position.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (value: number) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  for (let i = 0; i < indices.count; i += 3) {
    const root = find(indices.getX(i));
    parent[find(indices.getX(i + 1))] = root;
    parent[find(indices.getX(i + 2))] = root;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < indices.count; i += 3) {
    const root = find(indices.getX(i));
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const kept: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const root = find(indices.getX(i));
    let hash = Math.imul(root ^ (root >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    if ((sizes.get(root) ?? 0) >= 30 || hash % 2 === 0) {
      kept.push(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
    }
  }
  if (!kept.length) throw new Error('Tree foliage LOD contains no triangles');
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) result.setAttribute(name, attribute);
  result.setIndex(new THREE.BufferAttribute(position.count > 65535 ? new Uint32Array(kept) : new Uint16Array(kept), 1));
  result.boundingBox = source.boundingBox?.clone() ?? null;
  result.boundingSphere = source.boundingSphere?.clone() ?? null;
  return result;
}
