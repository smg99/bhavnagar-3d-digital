// Town planner: lets user draw a flyover or metro line on the 3D map,
// then estimates impact (nearby buildings affected, roads crossed, cost estimate).
import * as THREE from 'three';
import { lngLatToLocal, localToLngLat } from './geo';
import type { MapData } from './mapData';

export type PlannerType = 'flyover' | 'metro';

export interface PlannerPoint { lng: number; lat: number; x: number; z: number; }

export interface PlannerEstimate {
  lengthM: number;
  buildingsAffected: number;
  roadsCrossed: number;
  estCostCr: number; // crore INR
  estMonths: number;
  populationServed: number;
}

export class TownPlanner {
  points: PlannerPoint[] = [];
  type: PlannerType = 'flyover';
  line: THREE.Line;
  pillars: THREE.Group;
  markers: THREE.Group;
  data: MapData;

  constructor(data: MapData) {
    this.data = data;
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 4 })
    );
    this.line.visible = false;
    this.pillars = new THREE.Group();
    this.pillars.visible = false;
    this.markers = new THREE.Group();
    this.markers.visible = false;
  }

  addPoint(x: number, z: number) {
    const { lng, lat } = localToLngLat(x, z);
    this.points.push({ lng, lat, x, z });
    this.redraw();
  }

  undo() {
    this.points.pop();
    this.redraw();
  }

  clear() {
    this.points = [];
    this.redraw();
  }

  private redraw() {
    // line
    const positions: number[] = [];
    const y = this.type === 'flyover' ? 12 : 8;
    for (const p of this.points) positions.push(p.x, y, p.z);
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry();
    this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.line.visible = this.points.length >= 2;

    // pillars at each point
    this.pillars.clear();
    const pillarGeo = new THREE.CylinderGeometry(0.6, 0.8, y, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xbfbfbf });
    for (const p of this.points) {
      const m = new THREE.Mesh(pillarGeo, pillarMat);
      m.position.set(p.x, y / 2, p.z);
      this.pillars.add(m);
    }
    this.pillars.visible = this.points.length > 0;

    // markers (spheres at points)
    this.markers.clear();
    const markerGeo = new THREE.SphereGeometry(1.5, 12, 12);
    const markerMat = new THREE.MeshStandardMaterial({
      color: this.type === 'flyover' ? 0xfacc15 : 0x22d3ee, emissive: 0x333333,
    });
    for (const p of this.points) {
      const m = new THREE.Mesh(markerGeo, markerMat);
      m.position.set(p.x, y + 1, p.z);
      this.markers.add(m);
    }
    this.markers.visible = this.points.length > 0;
  }

  setType(t: PlannerType) {
    this.type = t;
    this.redraw();
  }

  estimate(): PlannerEstimate {
    let lengthM = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      lengthM += Math.hypot(
        this.points[i + 1].x - this.points[i].x,
        this.points[i + 1].z - this.points[i].z
      );
    }

    // buildings within 15m of the line
    let buildingsAffected = 0;
    for (const b of this.data.buildings) {
      let cx = 0, cz = 0;
      for (const p of b.polygon) {
        const lp = lngLatToLocal(p.lng, p.lat);
        cx += lp.x; cz += lp.z;
      }
      cx /= b.polygon.length; cz /= b.polygon.length;
      if (this.distanceToLine(cx, cz) < 15) buildingsAffected++;
    }

    // roads crossed
    const roadsCrossed = new Set<number>();
    for (const r of this.data.roads) {
      for (let i = 0; i < r.nodes.length - 1; i++) {
        const a = lngLatToLocal(r.nodes[i].lng, r.nodes[i].lat);
        const b = lngLatToLocal(r.nodes[i + 1].lng, r.nodes[i + 1].lat);
        if (this.segmentsIntersect(a.x, a.z, b.x, b.z)) {
          roadsCrossed.add(r.id);
          break;
        }
      }
    }

    // cost: flyover ~50Cr/km, metro ~250Cr/km
    const perKm = this.type === 'flyover' ? 50 : 250;
    const estCostCr = (lengthM / 1000) * perKm;
    const estMonths = Math.max(6, Math.round(lengthM / 1000 * (this.type === 'flyover' ? 4 : 10)));
    const populationServed = Math.round(lengthM * 8 + buildingsAffected * 25);

    return { lengthM, buildingsAffected, roadsCrossed: roadsCrossed.size, estCostCr, estMonths, populationServed };
  }

  private distanceToLine(px: number, pz: number): number {
    let min = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      const ax = this.points[i].x, az = this.points[i].z;
      const bx = this.points[i + 1].x, bz = this.points[i + 1].z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cz = az + t * dz;
      const d = Math.hypot(px - cx, pz - cz);
      if (d < min) min = d;
    }
    return min;
  }

  private segmentsIntersect(ax: number, az: number, bx: number, bz: number): boolean {
    for (let i = 0; i < this.points.length - 1; i++) {
      const cx = this.points[i].x, cz = this.points[i].z;
      const dx = this.points[i + 1].x, dz = this.points[i + 1].z;
      if (segIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return true;
    }
    return false;
  }

  toGeoJSON() {
    return {
      type: 'LineString',
      coordinates: this.points.map((p) => [p.lng, p.lat]),
      properties: { type: this.type },
    };
  }
}

function segIntersect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number
): boolean {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
