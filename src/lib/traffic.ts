// Traffic simulator: builds a road network graph from OSM roads, then moves
// vehicles along edges. Renders vehicles as instanced small boxes.
import * as THREE from 'three';
import { lngLatToLocal } from './geo';
import type { Road } from './mapData';

export interface TrafficEdge {
  from: number; // node index
  to: number;
  length: number;
  dir: THREE.Vector3; // unit direction
}
export interface TrafficNode {
  x: number; z: number;
  edges: number[]; // edge indices
}
export interface TrafficNetwork {
  nodes: TrafficNode[];
  edges: TrafficEdge[];
}

const tmpV = new THREE.Vector3();

export function buildTrafficNetwork(roads: Road[]): TrafficNetwork {
  const nodes: TrafficNode[] = [];
  const edges: TrafficEdge[] = [];
  const nodeMap = new Map<string, number>(); // key "x,z" rounded -> index

  function getOrCreateNode(x: number, z: number): number {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    let idx = nodeMap.get(key);
    if (idx === undefined) {
      idx = nodes.length;
      nodes.push({ x, z, edges: [] });
      nodeMap.set(key, idx);
    }
    return idx;
  }

  for (const road of roads) {
    for (let i = 0; i < road.nodes.length - 1; i++) {
      const a = lngLatToLocal(road.nodes[i].lng, road.nodes[i].lat);
      const b = lngLatToLocal(road.nodes[i + 1].lng, road.nodes[i + 1].lat);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) continue;
      const fromIdx = getOrCreateNode(a.x, a.z);
      const toIdx = getOrCreateNode(b.x, b.z);
      const dir = new THREE.Vector3((b.x - a.x) / len, 0, (b.z - a.z) / len);
      const edgeIdx = edges.length;
      edges.push({ from: fromIdx, to: toIdx, length: len, dir });
      nodes[fromIdx].edges.push(edgeIdx);
    }
  }
  return { nodes, edges };
}

export interface Vehicle {
  edge: number;
  progress: number; // 0..1 along edge
  speed: number; // m/s
}

export class TrafficSimulator {
  network: TrafficNetwork;
  vehicles: Vehicle[] = [];
  mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  maxVehicles: number;

  constructor(network: TrafficNetwork, maxVehicles = 600) {
    this.network = network;
    this.maxVehicles = maxVehicles;
    const carShape = new THREE.Shape();
    carShape.moveTo(-2.0, 0.2); // rear bottom
    carShape.lineTo(-2.0, 0.8); // rear bumper
    carShape.lineTo(-1.2, 0.8); // trunk
    carShape.lineTo(-0.6, 1.4); // rear window
    carShape.lineTo(0.5, 1.4);  // roof
    carShape.lineTo(1.2, 0.8);  // windshield
    carShape.lineTo(2.0, 0.8);  // hood
    carShape.lineTo(2.0, 0.2);  // front bumper
    carShape.lineTo(-2.0, 0.2); // bottom

    const extrudeSettings = { depth: 1.6, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.1, bevelThickness: 0.1 };
    const carGeo = new THREE.ExtrudeGeometry(carShape, extrudeSettings);
    // Center it (depth is 1.6, so translate Z by -0.8)
    carGeo.translate(0, 0, -0.8);
    // The car is drawn in XY plane. Our traffic system uses +Z for forward.
    // Wait, the shape goes from X=-2 (rear) to X=+2 (front).
    // If we want +Z to be forward, we rotate Y by -90 degrees.
    carGeo.rotateY(-Math.PI / 2);

    this.mesh = new THREE.InstancedMesh(
      carGeo,
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x333300, roughness: 0.4, metalness: 0.5 }),
      maxVehicles
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    for (let i = 0; i < maxVehicles; i++) {
      this.vehicles.push({
        edge: Math.floor(Math.random() * Math.max(1, network.edges.length)),
        progress: Math.random(),
        speed: 6 + Math.random() * 8,
      });
    }
  }

  setVehicleCount(n: number) {
    this.mesh.count = Math.min(n, this.maxVehicles);
  }

  update(dt: number, congestion = 1) {
    const { nodes, edges } = this.network;
    const active = this.mesh.count;
    for (let i = 0; i < active; i++) {
      const v = this.vehicles[i];
      const edge = edges[v.edge];
      if (!edge) { v.edge = 0; continue; }
      v.progress += (v.speed * congestion * dt) / Math.max(1, edge.length);
      while (v.progress >= 1) {
        v.progress -= 1;
        // pick a random outgoing edge from the destination node
        const dest = nodes[edge.to];
        if (dest && dest.edges.length) {
          v.edge = dest.edges[Math.floor(Math.random() * dest.edges.length)];
        } else {
          // dead end - reverse
          v.edge = Math.floor(Math.random() * edges.length);
        }
        break;
      }
      const cur = edges[v.edge];
      const from = nodes[cur.from];
      const to = nodes[cur.to];
      tmpV.set(
        from.x + (to.x - from.x) * v.progress,
        0.8,
        from.z + (to.z - from.z) * v.progress
      );
      this.dummy.position.copy(tmpV);
      this.dummy.rotation.set(0, Math.atan2(cur.dir.x, cur.dir.z), 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
