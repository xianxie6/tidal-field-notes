import * as THREE from 'three';

/** A ribbed fin membrane with a curved trailing edge, rooted along the body. */
export function createFinMembrane(vertices: number[], fullness = 0.12): THREE.BufferGeometry {
  const root = new THREE.Vector3().fromArray(vertices, 0);
  const tip = new THREE.Vector3().fromArray(vertices, 3);
  const end = new THREE.Vector3().fromArray(vertices, 6);
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const rays = 18;
  const rings = 5;
  const edge = new THREE.Vector3();
  const point = new THREE.Vector3();
  const bulge = tip.clone().sub(root).multiplyScalar(fullness);
  for (let ray = 0; ray <= rays; ray += 1) {
    const u = ray / rays;
    edge.lerpVectors(tip, end, u).addScaledVector(bulge, Math.sin(u * Math.PI));
    for (let ring = 0; ring <= rings; ring += 1) {
      const v = ring / rings;
      point.lerpVectors(root, edge, v);
      point.x += Math.sin(u * Math.PI * 6) * 0.009 * v * v;
      positions.push(point.x, point.y, point.z);
      uv.push(u, v);
      if (ray < rays && ring < rings) {
        const a = ray * (rings + 1) + ring;
        const b = a + rings + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
