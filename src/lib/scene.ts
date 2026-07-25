import * as THREE from 'three';
import { lngLatToLocal, localToLngLat, BHAVNAGAR_CENTER } from './geo';
import type { MapData, Road, Building, Poi } from './mapData';

export interface SceneLayers {
  ground: THREE.Mesh;
  roads: THREE.LineSegments;
  roadGlow: THREE.LineSegments;
  buildings: THREE.Mesh;
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
  // First pass: count total vertices needed for roofs and walls
  let totalTriangles = 0;
  
  const buildingData: { pts: THREE.Vector2[], h: number, col: THREE.Color, roofIndices: number[][] }[] = [];
  
  for (const b of buildings) {
    if (b.polygon.length < 3) continue;
    
    // Convert to Vector2 points in local space
    const pts = b.polygon.map(p => {
      const l = lngLatToLocal(p.lng, p.lat);
      return new THREE.Vector2(l.x, l.z); // Triangulate in XZ plane
    });
    
    // Remove duplicate last point if it exists (GeoJSON polygons are closed)
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
      pts.pop();
    }
    
    if (pts.length < 3) continue;
    
    // Ensure counter-clockwise winding for consistent normals
    if (THREE.ShapeUtils.isClockWise(pts)) {
      pts.reverse();
    }
    
    let roofIndices: number[][] = [];
    try {
      roofIndices = THREE.ShapeUtils.triangulateShape(pts, []);
    } catch (e) {
      continue; // Skip invalid polygons
    }
    
    const h = Math.max(3, b.height || b.levels * 3.2 || 5);
    
    // Calculate area roughly using the bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    const area = (maxX - minX) * (maxZ - minZ);
    
    const col = new THREE.Color();
    if (area > 800 || h > 20) {
      // Large commercial/industrial/apartment (cooler, bluish glass)
      col.setHSL(0.55 + Math.random() * 0.1, 0.4, 0.6 + Math.random() * 0.15);
    } else if (area < 150 && h <= 10) {
      // Small residential (warmer, terracotta/slate)
      col.setHSL(0.05 + Math.random() * 0.05, 0.35, 0.65 + Math.random() * 0.1);
    } else {
      // Medium buildings (neutral)
      col.setHSL(0.1, 0.15, 0.8 + Math.random() * 0.1);
    }
    
    totalTriangles += roofIndices.length; // Roof triangles
    totalTriangles += pts.length * 2;     // Wall triangles (2 per segment)
    
    buildingData.push({ pts, h, col, roofIndices });
  }
  
  // Allocate buffers
  const numVertices = totalTriangles * 3;
  const positions = new Float32Array(numVertices * 3);
  const normals = new Float32Array(numVertices * 3);
  const colors = new Float32Array(numVertices * 3);
  
  let i = 0; // index in Float32Array (i.e. vertex count * 3)
  
  for (const b of buildingData) {
    const { pts, h, col, roofIndices } = b;
    
    // Add roof triangles
    for (const tri of roofIndices) {
      for (const idx of tri) {
        const p = pts[idx];
        positions[i] = p.x;
        positions[i+1] = h;
        positions[i+2] = p.y;
        
        normals[i] = 0;
        normals[i+1] = 1;
        normals[i+2] = 0;
        
        colors[i] = col.r;
        colors[i+1] = col.g;
        colors[i+2] = col.b;
        
        i += 3;
      }
    }
    
    // Add wall triangles
    const wallCol = col.clone().multiplyScalar(0.65); // Darken walls slightly for fake shading
    
    for (let j = 0; j < pts.length; j++) {
      const p1 = pts[j];
      const p2 = pts[(j + 1) % pts.length];
      
      const dx = p2.x - p1.x;
      const dz = p2.y - p1.y;
      
      let nx = -dz;
      let nz = dx;
      const len = Math.sqrt(nx*nx + nz*nz);
      if (len > 0) { nx /= len; nz /= len; }
      
      const v1x = p1.x, v1y = 0, v1z = p1.y;
      const v2x = p2.x, v2y = 0, v2z = p2.y;
      const v3x = p2.x, v3y = h, v3z = p2.y;
      const v4x = p1.x, v4y = h, v4z = p1.y;
      
      // Triangle 1: (v1, v2, v3)
      positions[i]   = v1x; positions[i+1] = v1y; positions[i+2] = v1z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
      
      positions[i]   = v2x; positions[i+1] = v2y; positions[i+2] = v2z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
      
      positions[i]   = v3x; positions[i+1] = v3y; positions[i+2] = v3z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
      
      // Triangle 2: (v1, v3, v4)
      positions[i]   = v1x; positions[i+1] = v1y; positions[i+2] = v1z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
      
      positions[i]   = v3x; positions[i+1] = v3y; positions[i+2] = v3z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
      
      positions[i]   = v4x; positions[i+1] = v4y; positions[i+2] = v4z;
      normals[i]     = nx;  normals[i+1]   = 0;   normals[i+2]   = nz;
      colors[i]      = wallCol.r; colors[i+1] = wallCol.g; colors[i+2] = wallCol.b;
      i += 3;
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
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
