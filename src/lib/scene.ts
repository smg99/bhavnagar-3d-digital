import * as THREE from 'three';
import { lngLatToLocal, localToLngLat, BHAVNAGAR_CENTER } from './geo';
import type { MapData, Road, Building, Poi } from './mapData';

export interface SceneLayers {
  roads: THREE.LineSegments;
  roadGlow: THREE.LineSegments;
  buildings: THREE.InstancedMesh;
  ground: THREE.Mesh;
  water: THREE.Group;
  waterways: THREE.LineSegments;
  grid: THREE.GridHelper;
}

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 6,
  unclassified: 5, residential: 4, service: 3,
};
const ROAD_COLORS: Record<string, number> = {
  motorway: 0xf59e0b, trunk: 0xf59e0b, primary: 0xfbbf24,
  secondary: 0xfde68a, tertiary: 0xffffff, unclassified: 0xd4d4d4,
  residential: 0xa3a3a3, service: 0x737373,
};

function buildRoadGeometry(roads: Road[]) {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const road of roads) {
    const color = new THREE.Color(ROAD_COLORS[road.type] ?? 0xcccccc);
    for (let i = 0; i < road.nodes.length - 1; i++) {
      const a = lngLatToLocal(road.nodes[i].lng, road.nodes[i].lat);
      const b = lngLatToLocal(road.nodes[i + 1].lng, road.nodes[i + 1].lat);
      positions.push(a.x, 0.15, a.z, b.x, 0.15, b.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function buildRoadGlowGeometry(roads: Road[]) {
  // thicker, slightly transparent ribbon under roads for a lit-road look
  const positions: number[] = [];
  for (const road of roads) {
    for (let i = 0; i < road.nodes.length - 1; i++) {
      const a = lngLatToLocal(road.nodes[i].lng, road.nodes[i].lat);
      const b = lngLatToLocal(road.nodes[i + 1].lng, road.nodes[i + 1].lat);
      positions.push(a.x, 0.12, a.z, b.x, 0.12, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

function buildBuildings(buildings: Building[]) {
  // Use instanced boxes. Compute footprint center, width, depth, height.
  const dummy = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.7, metalness: 0.15 }),
    Math.max(1, buildings.length)
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const colorArr = new Float32Array(buildings.length * 3);
  const col = new THREE.Color();

  buildings.forEach((b, i) => {
    // centroid
    let cx = 0, cz = 0;
    for (const p of b.polygon) {
      const lp = lngLatToLocal(p.lng, p.lat);
      cx += lp.x; cz += lp.z;
    }
    cx /= b.polygon.length; cz /= b.polygon.length;

    // bounding box for width/depth
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of b.polygon) {
      const lp = lngLatToLocal(p.lng, p.lat);
      minX = Math.min(minX, lp.x); maxX = Math.max(maxX, lp.x);
      minZ = Math.min(minZ, lp.z); maxZ = Math.max(maxZ, lp.z);
    }
    const w = Math.max(2, maxX - minX);
    const d = Math.max(2, maxZ - minZ);
    const h = Math.max(3, b.height || b.levels * 3.2 || 6);

    dummy.position.set(cx, h / 2, cz);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    // color by height: short=light, tall=darker accent
    const t = Math.min(1, h / 40);
    col.setHSL(0.08, 0.15, 0.85 - t * 0.55);
    colorArr[i * 3] = col.r;
    colorArr[i * 3 + 1] = col.g;
    colorArr[i * 3 + 2] = col.b;
  });

  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater(data: MapData) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1e6fb0, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.6,
  });
  for (const area of data.waterAreas) {
    if (area.polygon.length < 3) continue;
    const shape = new THREE.Shape();
    area.polygon.forEach((p, i) => {
      const lp = lngLatToLocal(p.lng, p.lat);
      if (i === 0) shape.moveTo(lp.x, lp.z);
      else shape.lineTo(lp.x, lp.z);
    });
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.08;
    group.add(mesh);
  }
  return group;
}

function buildWaterways(data: MapData) {
  const positions: number[] = [];
  for (const ww of data.waterways) {
    for (let i = 0; i < ww.nodes.length - 1; i++) {
      const a = lngLatToLocal(ww.nodes[i].lng, ww.nodes[i].lat);
      const b = lngLatToLocal(ww.nodes[i + 1].lng, ww.nodes[i + 1].lat);
      positions.push(a.x, 0.1, a.z, b.x, 0.1, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0x2dd4bf, linewidth: 2 })
  );
}

export function buildSceneLayers(data: MapData): SceneLayers {
  // ground size from bounds
  const sw = lngLatToLocal(data.bounds.minLng, data.bounds.minLat);
  const ne = lngLatToLocal(data.bounds.maxLng, data.bounds.maxLat);
  const cx = (sw.x + ne.x) / 2;
  const cz = (sw.z + ne.z) / 2;
  const gw = (ne.x - sw.x) + 200;
  const gd = (ne.z - sw.z) + 200;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;

  const roads = new THREE.LineSegments(
    buildRoadGeometry(data.roads),
    new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 })
  );

  const roadGlow = new THREE.LineSegments(
    buildRoadGlowGeometry(data.roads),
    new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25 })
  );

  const buildings = buildBuildings(data.buildings);
  const water = buildWater(data);
  const waterways = buildWaterways(data);

  const grid = new THREE.GridHelper(Math.max(gw, gd), 40, 0x2a3a2a, 0x1a2a1a);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  grid.position.set(cx, 0.05, cz);

  return { roads, roadGlow, buildings, ground, water, waterways, grid };
}

// Build 3D pin markers for points of interest (schools, hospitals, etc.)
export function buildPoiMarkers(pois: Poi[]): THREE.Group {
  const group = new THREE.Group();
  const colorByType: Record<string, number> = {
    hospital: 0xef4444, clinic: 0xf87171, pharmacy: 0xfb7185,
    school: 0x22c55e, college: 0x16a34a, university: 0x15803d,
    police: 0x3b82f6, fire_station: 0xf97316,
    bus_station: 0xeab308, railway_station: 0xa855f7, station: 0xa855f7, halt: 0xc084fc,
    fuel: 0x64748b, marketplace: 0x14b8a6, library: 0x0ea5e9,
    post_office: 0x6366f1, bank: 0x10b981, restaurant: 0xf59e0b,
    place_of_worship: 0xd97706, hotel: 0xec4899, museum: 0x8b5cf6,
    attraction: 0xf43f5e, viewpoint: 0x06b6d4,
  };
  const pinGeo = new THREE.ConeGeometry(2.2, 8, 8);
  pinGeo.translate(0, 4, 0);
  for (const p of pois) {
    const lp = lngLatToLocal(p.lng, p.lat);
    const color = colorByType[p.type] ?? 0x94a3b8;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 });
    const pin = new THREE.Mesh(pinGeo, mat);
    pin.position.set(lp.x, 0.2, lp.z);
    group.add(pin);
  }
  return group;
}

// Re-export for planner click handling
export { lngLatToLocal, localToLngLat, BHAVNAGAR_CENTER };
