// Fetch real map data for Bhavnagar from OpenStreetMap's Overpass API.
// Returns roads (with nodes), buildings (polygon), water/coastline, and waterways.
import { BHAVNAGAR_CENTER } from './geo';

export interface RoadNode { id: number; lng: number; lat: number; }
export interface Road {
  id: number;
  name: string;
  type: string; // highway tag value
  nodes: { lng: number; lat: number }[];
}
export interface Building {
  id: number;
  polygon: { lng: number; lat: number }[];
  height: number;
  levels: number;
  name: string;
  amenity: string;
}
export interface WaterArea {
  id: number;
  polygon: { lng: number; lat: number }[];
  name: string;
}
export interface Waterway {
  id: number;
  nodes: { lng: number; lat: number }[];
  name: string;
}
export interface Poi {
  id: number;
  lng: number;
  lat: number;
  name: string;
  type: string; // amenity / shop / tourism / office etc
}
export interface MapData {
  roads: Road[];
  buildings: Building[];
  waterAreas: WaterArea[];
  waterways: Waterway[];
  pois: Poi[];
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

// ~16km radius around Bhavnagar
const RADIUS = 0.15; // degrees

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function buildQuery() {
  const c = BHAVNAGAR_CENTER;
  const s = c.lat - RADIUS;
  const n = c.lat + RADIUS;
  const w = c.lng - RADIUS;
  const e = c.lng + RADIUS;
  return `
[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service)$"](${s},${w},${n},${e});
  way["natural"="water"](${s},${w},${n},${e});
  way["waterway"](${s},${w},${n},${e});
  relation["natural"="water"](${s},${w},${n},${e});
  way["landuse"="reservoir"](${s},${w},${n},${e});
  node["amenity"~"^(hospital|school|college|university|police|fire_station|bus_station|railway_station|fuel|marketplace|library|post_office|clinic|pharmacy|bank|restaurant|place_of_worship)$"](${s},${w},${n},${e});
  node["tourism"~"^(hotel|museum|attraction|viewpoint)$"](${s},${w},${n},${e});
  node["railway"~"^(station|halt)$"](${s},${w},${n},${e});
  node["place"~"^(suburb|neighbourhood|locality)$"](${s},${w},${n},${e});
);
out geom;
out body geom;`;
}

export async function fetchMapData(onProgress?: (msg: string) => void): Promise<MapData> {
  const query = buildQuery();
  let lastErr: unknown = null;

  const localBuildingsPromise = fetch(import.meta.env.BASE_URL + 'buildings.geojson')
    .then(r => {
      if (!r.ok) throw new Error('Network response was not ok');
      return r.json();
    })
    .catch(e => {
      console.warn('Failed to load local buildings.geojson, falling back to empty buildings array.', e);
      return null;
    });

  for (const url of OVERPASS_URLS) {
    try {
      onProgress?.(`Fetching map data from ${url.split('/')[2]}...`);
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onProgress?.('Parsing map data...');
      const json = await res.json();
      const localBuildingsData = await localBuildingsPromise;
      return parseOverpass(json, localBuildingsData);
    } catch (err) {
      lastErr = err;
      onProgress?.(`Failed: ${(err as Error).message}. Trying next server...`);
    }
  }
  throw new Error(`All Overpass servers failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

function parseOverpass(json: any, localBuildingsGeojson?: any): MapData {
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const waterAreas: WaterArea[] = [];
  const waterways: Waterway[] = [];
  const pois: Poi[] = [];

  const bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };

  function updateBounds(lng: number, lat: number) {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  }

  const elements: any[] = json.elements || [];
  for (const el of elements) {
    if (el.type === 'way' && el.geometry) {
      const pts = el.geometry.map((g: any) => ({ lng: g.lon, lat: g.lat }));
      pts.forEach((p: any) => updateBounds(p.lng, p.lat));
      const tags = el.tags || {};
      if (tags.highway) {
        roads.push({
          id: el.id,
          name: tags.name || tags.ref || '',
          type: tags.highway,
          nodes: pts,
        });
      } else if (tags.building !== undefined) {
        const levels = parseInt(tags['building:levels'] || '0', 10) || (tags.building === 'yes' ? 1 : 0);
        const heightM = parseFloat(tags.height || '0') || 0;
        buildings.push({
          id: el.id,
          polygon: pts,
          height: heightM,
          levels: levels || (heightM ? Math.round(heightM / 3.2) : 1),
          name: tags.name || '',
          amenity: tags.amenity || '',
        });
      } else if (tags.natural === 'water' || tags.landuse === 'reservoir') {
        waterAreas.push({ id: el.id, polygon: pts, name: tags.name || '' });
      } else if (tags.waterway) {
        waterways.push({ id: el.id, nodes: pts, name: tags.name || '' });
      }
    } else if (el.type === 'node' && el.lon !== undefined && el.lat !== undefined) {
      const tags = el.tags || {};
      const name = tags.name || tags.brand || '';
      const type = tags.amenity || tags.tourism || tags.railway || tags.shop || tags.place || '';
      if (name && type) {
        pois.push({ id: el.id, lng: el.lon, lat: el.lat, name, type });
      }
    } else if (el.type === 'relation' && el.members) {
      // relation water bodies - merge member ways
      const tags = el.tags || {};
      if (tags.natural === 'water') {
        const allPts: { lng: number; lat: number }[] = [];
        for (const m of el.members) {
          if (m.geometry) {
            for (const g of m.geometry) allPts.push({ lng: g.lon, lat: g.lat });
          }
        }
        if (allPts.length) {
          allPts.forEach((p) => updateBounds(p.lng, p.lat));
          waterAreas.push({ id: el.id, polygon: allPts, name: tags.name || '' });
        }
      }
    }
  }

  if (localBuildingsGeojson && localBuildingsGeojson.features) {
    for (const f of localBuildingsGeojson.features) {
      if (f.geometry && f.geometry.type === 'Polygon' && f.geometry.coordinates.length > 0) {
        const ring = f.geometry.coordinates[0];
        const pts = ring.map((c: number[]) => ({ lng: c[0], lat: c[1] }));
        pts.forEach((p: any) => updateBounds(p.lng, p.lat));
        
        const heightM = f.properties?.height || 0;
        buildings.push({
          id: f.id || Math.random(),
          polygon: pts,
          height: heightM,
          levels: heightM ? Math.round(heightM / 3.2) : 1,
          name: f.properties?.names?.primary || '',
          amenity: '',
        });
      } else if (f.geometry && f.geometry.type === 'MultiPolygon') {
        for (const poly of f.geometry.coordinates) {
          if (poly.length > 0) {
            const ring = poly[0];
            const pts = ring.map((c: number[]) => ({ lng: c[0], lat: c[1] }));
            pts.forEach((p: any) => updateBounds(p.lng, p.lat));
            const heightM = f.properties?.height || 0;
            buildings.push({
              id: f.id || Math.random(),
              polygon: pts,
              height: heightM,
              levels: heightM ? Math.round(heightM / 3.2) : 1,
              name: f.properties?.names?.primary || '',
              amenity: '',
            });
          }
        }
      }
    }
  }

  // Fallback: if no bounds (empty), use center
  if (!isFinite(bounds.minLng)) {
    Object.assign(bounds, {
      minLng: BHAVNAGAR_CENTER.lng - RADIUS,
      minLat: BHAVNAGAR_CENTER.lat - RADIUS,
      maxLng: BHAVNAGAR_CENTER.lng + RADIUS,
      maxLat: BHAVNAGAR_CENTER.lat + RADIUS,
    });
  }

  return { roads, buildings, waterAreas, waterways, pois, bounds };
}
