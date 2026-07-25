// Flood simulation: a rising water plane over the city. Lower-lying areas
// near the coast (Gulf of Khambhat) flood first. We estimate elevation from
// distance to coastline + a noise term so the flood is plausible.
import * as THREE from 'three';
import { lngLatToLocal, BHAVNAGAR_CENTER } from './geo';
import type { MapData } from './mapData';

export interface FloodState {
  level: number; // current water height (m)
  maxLevel: number;
  mesh: THREE.Mesh;
  floodedBuildings: number;
  floodedRoads: number;
}

// Estimate elevation (meters above sea level) for a local point.
// Coastal points are low; inland rises. Adds gentle noise.
export function estimateElevation(x: number, z: number, coastlineDist: number): number {
  const base = Math.max(0, coastlineDist * 0.004); // ~4m per km from coast
  const noise = (Math.sin(x * 0.001) + Math.cos(z * 0.0013)) * 1.5;
  return Math.max(0, base + noise);
}

export class FloodSimulator {
  waterMesh: THREE.Mesh;
  maxLevel = 25; // meters
  level = 0;
  data: MapData;
  coastlineDistField: Map<string, number> = new Map();
  groundSize: { w: number; d: number; cx: number; cz: number };

  constructor(data: MapData) {
    this.data = data;
    const sw = lngLatToLocal(data.bounds.minLng, data.bounds.minLat);
    const ne = lngLatToLocal(data.bounds.maxLng, data.bounds.maxLat);
    const cx = (sw.x + ne.x) / 2;
    const cz = (sw.z + ne.z) / 2;
    const w = (ne.x - sw.x) + 400;
    const d = (ne.z - sw.z) + 400;
    this.groundSize = { w, d, cx, cz };

    const geo = new THREE.PlaneGeometry(w, d, 80, 80);
    // displace vertices to terrain
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i); // plane is in XY before rotation
      const dist = this.distanceToCoastline(x, z);
      const elev = estimateElevation(x, z, dist);
      pos.setZ(i, elev);
    }
    geo.computeVertexNormals();

    this.waterMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8, transparent: true, opacity: 0.7,
        roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
      })
    );
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(cx, this.level, cz);
    this.waterMesh.visible = false;
  }

  // crude distance to nearest water area polygon point
  private distanceToCoastline(x: number, z: number): number {
    let min = 999999;
    for (const area of this.data.waterAreas) {
      for (const p of area.polygon) {
        const lp = lngLatToLocal(p.lng, p.lat);
        const d = Math.hypot(lp.x - x, lp.z - z);
        if (d < min) min = d;
      }
    }
    // also waterways
    for (const ww of this.data.waterways) {
      for (const p of ww.nodes) {
        const lp = lngLatToLocal(p.lng, p.lat);
        const d = Math.hypot(lp.x - x, lp.z - z);
        if (d < min) min = d;
      }
    }
    return min === 999999 ? 5000 : min;
  }

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(this.maxLevel, level));
    this.waterMesh.position.y = this.level;
    this.waterMesh.visible = this.level > 0.1;
  }

  getImpact(): { floodedBuildings: number; floodedRoads: number; floodedKm: number } {
    let floodedBuildings = 0;
    let floodedRoads = 0;
    let floodedLen = 0;

    for (const b of this.data.buildings) {
      let cx = 0, cz = 0;
      for (const p of b.polygon) {
        const lp = lngLatToLocal(p.lng, p.lat);
        cx += lp.x; cz += lp.z;
      }
      cx /= b.polygon.length; cz /= b.polygon.length;
      const dist = this.distanceToCoastline(cx, cz);
      const elev = estimateElevation(cx, cz, dist);
      if (this.level > elev) floodedBuildings++;
    }

    for (const r of this.data.roads) {
      for (let i = 0; i < r.nodes.length - 1; i++) {
        const a = lngLatToLocal(r.nodes[i].lng, r.nodes[i].lat);
        const b = lngLatToLocal(r.nodes[i + 1].lng, r.nodes[i + 1].lat);
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const dist = this.distanceToCoastline(mx, mz);
        const elev = estimateElevation(mx, mz, dist);
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        if (this.level > elev) {
          floodedRoads++;
          floodedLen += segLen;
        }
      }
    }

    return { floodedBuildings, floodedRoads, floodedKm: floodedLen / 1000 };
  }
}
