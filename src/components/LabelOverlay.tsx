import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { lngLatToLocal, localToLngLat } from '@/lib/geo';
import type { MapData, Poi } from '@/lib/mapData';

export interface LabelItem {
  id: string;
  world: THREE.Vector3;
  text: string;
  kind: 'road' | 'water' | 'building' | 'poi';
  poiType?: string;
}

const POI_COLORS: Record<string, string> = {
  hospital: '#ef4444', clinic: '#f87171', pharmacy: '#fb7185',
  school: '#22c55e', college: '#16a34a', university: '#15803d',
  police: '#3b82f6', fire_station: '#f97316',
  bus_station: '#eab308', railway_station: '#a855f7', station: '#a855f7', halt: '#c084fc',
  fuel: '#64748b', marketplace: '#14b8a6', library: '#0ea5e9',
  post_office: '#6366f1', bank: '#10b981', restaurant: '#f59e0b',
  place_of_worship: '#d97706', hotel: '#ec4899', museum: '#8b5cf6',
  attraction: '#f43f5e', viewpoint: '#06b6d4',
};

function poiColor(type: string) {
  return POI_COLORS[type] || '#94a3b8';
}

const POI_ICONS: Record<string, string> = {
  hospital: 'H', clinic: 'H', pharmacy: 'Rx',
  school: 'S', college: 'C', university: 'U',
  police: 'P', fire_station: 'F',
  bus_station: 'B', railway_station: 'R', station: 'R', halt: 'R',
  fuel: '⛽', marketplace: 'M', library: 'L',
  post_office: 'PO', bank: '$', restaurant: '🍴',
  place_of_worship: '★', hotel: '🏨', museum: 'M',
  attraction: '★', viewpoint: '👁',
};

export function buildLabels(data: MapData): LabelItem[] {
  const items: LabelItem[] = [];

  // Named roads (label at midpoint of longest segment)
  const seenRoadNames = new Set<string>();
  for (const r of data.roads) {
    if (!r.name || seenRoadNames.has(r.name)) continue;
    seenRoadNames.add(r.name);
    // find longest segment midpoint
    let bestLen = 0, bestI = 0;
    for (let i = 0; i < r.nodes.length - 1; i++) {
      const a = r.nodes[i], b = r.nodes[i + 1];
      const len = Math.hypot(b.lng - a.lng, b.lat - a.lat);
      if (len > bestLen) { bestLen = len; bestI = i; }
    }
    const a = r.nodes[bestI], b = r.nodes[bestI + 1];
    const mid = { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 };
    const lp = lngLatToLocal(mid.lng, mid.lat);
    items.push({ id: `road-${r.id}`, world: new THREE.Vector3(lp.x, 2, lp.z), text: r.name, kind: 'road' });
  }

  // Named water bodies
  for (const w of data.waterAreas) {
    if (!w.name) continue;
    let cx = 0, cz = 0;
    for (const p of w.polygon) {
      const lp = lngLatToLocal(p.lng, p.lat);
      cx += lp.x; cz += lp.z;
    }
    cx /= w.polygon.length; cz /= w.polygon.length;
    items.push({ id: `water-${w.id}`, world: new THREE.Vector3(cx, 1, cz), text: w.name, kind: 'water' });
  }

  // Named buildings (only those with a name)
  for (const b of data.buildings) {
    if (!b.name) continue;
    let cx = 0, cz = 0;
    for (const p of b.polygon) {
      const lp = lngLatToLocal(p.lng, p.lat);
      cx += lp.x; cz += lp.z;
    }
    cx /= b.polygon.length; cz /= b.polygon.length;
    const h = Math.max(3, b.height || b.levels * 3.2 || 6);
    items.push({ id: `bldg-${b.id}`, world: new THREE.Vector3(cx, h + 1, cz), text: b.name, kind: 'building', poiType: b.amenity });
  }

  // POIs
  for (const p of data.pois) {
    const lp = lngLatToLocal(p.lng, p.lat);
    items.push({ id: `poi-${p.id}`, world: new THREE.Vector3(lp.x, 4, lp.z), text: p.name, kind: 'poi', poiType: p.type });
  }

  return items;
}

interface Props {
  labels: LabelItem[];
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  showLabels: boolean;
  showPois: boolean;
}

interface ScreenLabel extends LabelItem {
  x: number;
  y: number;
  behind: boolean;
  dist: number;
}

export default function LabelOverlay({ labels, camera, renderer, showLabels, showPois }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screenLabels, setScreenLabels] = useState<ScreenLabel[]>([]);
  const visibleRef = useRef({ showLabels, showPois });
  useEffect(() => { visibleRef.current = { showLabels, showPois }; }, [showLabels, showPois]);

  useEffect(() => {
    if (!camera || !renderer) return;
    let raf = 0;
    const tmp = new THREE.Vector3();
    const update = () => {
      raf = requestAnimationFrame(update);
      const { showLabels: sl, showPois: sp } = visibleRef.current;
      if (!sl && !sp) { setScreenLabels([]); return; }
      const canvas = renderer.domElement;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const out: ScreenLabel[] = [];
      for (const item of labels) {
        const isPoi = item.kind === 'poi';
        if (isPoi && !sp) continue;
        if (!isPoi && !sl) continue;
        tmp.copy(item.world).project(camera);
        const behind = tmp.z > 1;
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * h;
        const dist = camera.position.distanceTo(item.world);
        out.push({ ...item, x, y, behind, dist });
      }
      // cull far labels to avoid clutter
      const maxDist = 4500;
      const filtered = out.filter((l) => !l.behind && l.dist < maxDist);
      // sort by distance for z-ordering (closer drawn last = on top)
      filtered.sort((a, b) => b.dist - a.dist);
      setScreenLabels(filtered);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [labels, camera, renderer]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[5] overflow-hidden">
      {screenLabels.map((l) => {
        if (l.kind === 'poi') {
          const color = poiColor(l.poiType || '');
          const icon = POI_ICONS[l.poiType || ''] || '•';
          return (
            <div key={l.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: l.x, top: l.y, opacity: Math.min(1, 1 - l.dist / 4500) }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg border-2 border-white/40"
                style={{ backgroundColor: color }}>
                {icon}
              </div>
              <div className="mt-0.5 px-1.5 py-0.5 bg-slate-900/80 backdrop-blur rounded text-[10px] text-white whitespace-nowrap max-w-[140px] truncate">
                {l.text}
              </div>
            </div>
          );
        }
        // road / water / building labels
        const colorClass =
          l.kind === 'water' ? 'text-cyan-300 border-cyan-500/40' :
          l.kind === 'building' ? 'text-amber-200 border-amber-500/40' :
          'text-slate-200 border-slate-500/40';
        return (
          <div key={l.id} className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-slate-900/70 backdrop-blur rounded text-[10px] whitespace-nowrap max-w-[160px] truncate border"
            style={{ left: l.x, top: l.y, opacity: Math.min(1, 1 - l.dist / 4500) }}>
            <span className={colorClass}>{l.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export { poiColor, POI_ICONS, POI_COLORS, localToLngLat };
