import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Cloud, CloudRain, CloudSun, CloudLightning, CloudDrizzle, CloudFog, Snowflake,
  Sun, Moon, Wind, Droplets, Thermometer, Eye, Activity, Waves, Building2,
  Train, Construction, Trash2, Save, Undo2, MapPin, Loader2, Gauge,
  Route, AlertTriangle, Layers, RotateCcw, Navigation, Tag, Compass, Info,
  LogIn, LogOut, User,
} from 'lucide-react';
import { fetchMapData, type MapData } from '@/lib/mapData';
import { buildSceneLayers, buildPoiMarkers } from '@/lib/scene';
import { lngLatToLocal, localToLngLat, BHAVNAGAR_CENTER } from '@/lib/geo';
import { buildTrafficNetwork, TrafficSimulator } from '@/lib/traffic';
import { FloodSimulator } from '@/lib/flood';
import { TownPlanner, type PlannerType, type PlannerEstimate } from '@/lib/planner';
import {
  fetchWeather, fetchAqi, weatherCodeToText, aqiCategory,
  type WeatherData, type AqiData,
} from '@/lib/weather';
import { saveScenario, listScenarios, deleteScenario, onAuthChange, signOut, supabase, type SavedScenario } from '@/lib/supabase';
import LabelOverlay, { buildLabels, type LabelItem } from '@/components/LabelOverlay';
import AuthModal from '@/components/AuthModal';

type Tab = 'overview' | 'traffic' | 'flood' | 'planner';

export default function DigitalTwin() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const trafficRef = useRef<TrafficSimulator | null>(null);
  const floodRef = useRef<FloodSimulator | null>(null);
  const plannerRef = useRef<TownPlanner | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const groundRef = useRef<THREE.Mesh | null>(null);
  const layersRef = useRef<ReturnType<typeof buildSceneLayers> | null>(null);
  const poiGroupRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const ambLightRef = useRef<THREE.AmbientLight | null>(null);

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('Initializing 3D engine...');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [aqi, setAqi] = useState<AqiData | null>(null);
  const [vehicleCount, setVehicleCount] = useState(300);
  const [congestion, setCongestion] = useState(1);
  const [floodLevel, setFloodLevel] = useState(0);
  const [floodImpact, setFloodImpact] = useState({ floodedBuildings: 0, floodedRoads: 0, floodedKm: 0 });
  const [plannerType, setPlannerType] = useState<PlannerType>('flyover');
  const [plannerEstimate, setPlannerEstimate] = useState<PlannerEstimate | null>(null);
  const [plannerActive, setPlannerActive] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [saving, setSaving] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [showLayers, setShowLayers] = useState({ roads: true, buildings: true, water: true, traffic: true, grid: false });
  const [showLabels, setShowLabels] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [isNight, setIsNight] = useState(false);
  const [theme, setTheme] = useState<'day' | 'night' | 'light'>('day');
  const [hoverCoord, setHoverCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [compassAngle, setCompassAngle] = useState(0);
  const [showLegend, setShowLegend] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Load map data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchMapData(setLoadMsg);
        if (!mounted) return;
        setMapData(data);
        setLoadMsg(`Loaded ${data.roads.length} roads, ${data.buildings.length} buildings, ${data.waterAreas.length} water bodies`);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Fetch weather + AQI
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [w, a] = await Promise.all([fetchWeather(), fetchAqi()]);
        if (mounted) { setWeather(w); setAqi(a); }
      } catch (e) { /* non-fatal */ }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Load saved scenarios
  useEffect(() => {
    listScenarios().then(setScenarios).catch(() => {});
  }, []);

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => {});
    const unsub = onAuthChange((s) => setSession(s));
    return unsub;
  }, []);
  const isSignedIn = !!session;
  const userEmail = session?.user?.email as string | undefined;

  // Three.js scene setup (runs once when mapData is ready)
  useEffect(() => {
    if (!mapData || !mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a);
    scene.fog = new THREE.Fog(0x0a0e1a, 10000, 20000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 1, 20000);
    camera.position.set(800, 1200, 1800);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 100;
    controls.maxDistance = 8000;
    controlsRef.current = controls;

    // Lights
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x223344, 0.6);
    scene.add(hemi);
    hemiLightRef.current = hemi;
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.1);
    sun.position.set(1000, 1500, 800);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3000;
    sun.shadow.camera.right = 3000;
    sun.shadow.camera.top = 3000;
    sun.shadow.camera.bottom = -3000;
    sun.shadow.camera.far = 6000;
    scene.add(sun);
    sunLightRef.current = sun;
    const amb = new THREE.AmbientLight(0x404060, 0.4);
    scene.add(amb);
    ambLightRef.current = amb;

    // Build layers
    const layers = buildSceneLayers(mapData);
    layersRef.current = layers;
    scene.add(layers.ground);
    scene.add(layers.grid);
    scene.add(layers.roads);
    scene.add(layers.roadGlow);
    scene.add(layers.buildings);
    scene.add(layers.water);
    scene.add(layers.waterways);
    groundRef.current = layers.ground;

    // POI markers
    const poiGroup = buildPoiMarkers(mapData.pois);
    scene.add(poiGroup);
    poiGroupRef.current = poiGroup;

    // Build label list for overlay
    setLabels(buildLabels(mapData));

    // Traffic
    const network = buildTrafficNetwork(mapData.roads);
    const traffic = new TrafficSimulator(network, 600);
    traffic.setVehicleCount(vehicleCount);
    scene.add(traffic.mesh);
    trafficRef.current = traffic;

    // Flood
    const flood = new FloodSimulator(mapData);
    scene.add(flood.waterMesh);
    floodRef.current = flood;

    // Planner
    const planner = new TownPlanner(mapData);
    scene.add(planner.line);
    scene.add(planner.pillars);
    scene.add(planner.markers);
    plannerRef.current = planner;

    // Resize
    const onResize = () => {
      if (!camera || !renderer || !mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // Click handler for planner
    const onClick = (e: MouseEvent) => {
      if (!plannerActive || !plannerRef.current || !camera) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, camera);
      const hits = raycasterRef.current.intersectObject(groundRef.current!, false);
      if (hits.length) {
        const p = hits[0].point;
        plannerRef.current.addPoint(p.x, p.z);
        setPlannerEstimate(plannerRef.current.estimate());
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    // Mouse move -> coordinate readout
    const onMove = (e: MouseEvent) => {
      if (!camera) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, camera);
      const hits = raycasterRef.current.intersectObject(groundRef.current!, false);
      if (hits.length) {
        const p = hits[0].point;
        setHoverCoord(localToLngLat(p.x, p.z));
      }
    };
    renderer.domElement.addEventListener('mousemove', onMove);

    // Animate
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.1, clock.getDelta());
      controls.update();
      if (showLayersRef.current.traffic && trafficRef.current) {
        trafficRef.current.update(dt, congestionRef.current);
      }
      // animate water shimmer
      if (floodRef.current && floodRef.current.waterMesh.visible) {
        const t = clock.elapsedTime;
        floodRef.current.waterMesh.position.y = floodRef.current.level + Math.sin(t * 0.8) * 0.15;
      }
      // compass: angle from camera azimuth
      const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      setCompassAngle((-az * 180) / Math.PI);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMove);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData]);

  // Keep refs in sync for animation loop
  const showLayersRef = useRef(showLayers);
  const congestionRef = useRef(congestion);
  useEffect(() => { showLayersRef.current = showLayers; }, [showLayers]);
  useEffect(() => { congestionRef.current = congestion; }, [congestion]);

  // Layer visibility
  useEffect(() => {
    const l = layersRef.current;
    if (!l) return;
    l.roads.visible = showLayers.roads;
    l.roadGlow.visible = showLayers.roads;
    l.buildings.visible = showLayers.buildings;
    l.water.visible = showLayers.water;
    l.waterways.visible = showLayers.water;
    l.grid.visible = showLayers.grid;
    if (trafficRef.current) trafficRef.current.mesh.visible = showLayers.traffic;
    if (poiGroupRef.current) poiGroupRef.current.visible = showPois;
  }, [showLayers, showPois]);

  // Theme lighting (day / night / light)
  useEffect(() => {
    const sun = sunLightRef.current;
    const hemi = hemiLightRef.current;
    const amb = ambLightRef.current;
    const scene = sceneRef.current;
    const ground = groundRef.current;
    if (!sun || !hemi || !amb || !scene) return;
    const groundMat = ground ? (ground.material as THREE.MeshStandardMaterial) : null;
    if (theme === 'night') {
      scene.background = new THREE.Color(0x05070f);
      if (scene.fog) (scene.fog as THREE.Fog).color.set(0x05070f);
      sun.color.set(0x6b7faa); sun.intensity = 0.35; sun.position.set(-400, 600, -400);
      hemi.color.set(0x1a2238); hemi.groundColor.set(0x0a0f1a); hemi.intensity = 0.3;
      amb.intensity = 0.15;
      if (groundMat) groundMat.color.set(0x12141c);
      if (trafficRef.current) {
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissive.set(0x444400);
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      }
    } else if (theme === 'light') {
      scene.background = new THREE.Color(0xeef2f7);
      if (scene.fog) (scene.fog as THREE.Fog).color.set(0xeef2f7);
      sun.color.set(0xffffff); sun.intensity = 1.4; sun.position.set(1000, 1500, 800);
      hemi.color.set(0xdfe7f0); hemi.groundColor.set(0xc9d6df); hemi.intensity = 0.9;
      amb.intensity = 0.6;
      if (groundMat) groundMat.color.set(0xcfd8dc);
      if (trafficRef.current) {
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissive.set(0x222200);
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
      }
    } else {
      scene.background = new THREE.Color(0x0a0e1a);
      if (scene.fog) (scene.fog as THREE.Fog).color.set(0x0a0e1a);
      sun.color.set(0xfff4e6); sun.intensity = 1.1; sun.position.set(1000, 1500, 800);
      hemi.color.set(0x88aaff); hemi.groundColor.set(0x223344); hemi.intensity = 0.6;
      amb.intensity = 0.4;
      if (groundMat) groundMat.color.set(0x3a4a3a);
      if (trafficRef.current) {
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissive.set(0x222200);
        (trafficRef.current.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
      }
    }
  }, [theme]);

  // Vehicle count
  useEffect(() => {
    if (trafficRef.current) trafficRef.current.setVehicleCount(vehicleCount);
  }, [vehicleCount]);

  // Flood level
  useEffect(() => {
    if (!floodRef.current) return;
    floodRef.current.setLevel(floodLevel);
    setFloodImpact(floodRef.current.getImpact());
  }, [floodLevel]);

  // Planner type
  useEffect(() => {
    if (plannerRef.current) {
      plannerRef.current.setType(plannerType);
      setPlannerEstimate(plannerRef.current.points.length >= 2 ? plannerRef.current.estimate() : null);
    }
  }, [plannerType]);

  const handleSaveScenario = useCallback(async () => {
    if (!plannerRef.current || plannerRef.current.points.length < 2) return;
    if (!isSignedIn) { setShowAuth(true); return; }
    setSaving(true);
    try {
      const name = scenarioName || `${plannerType} ${new Date().toLocaleString()}`;
      await saveScenario({
        name,
        type: plannerType,
        geojson: plannerRef.current.toGeoJSON(),
      });
      setScenarioName('');
      setScenarios(await listScenarios());
    } catch (e) {
      setError('Failed to save scenario. Please try signing in again.');
    } finally {
      setSaving(false);
    }
  }, [scenarioName, plannerType, isSignedIn]);

  const handleDeleteScenario = useCallback(async (id: string) => {
    if (!isSignedIn) { setShowAuth(true); return; }
    try {
      await deleteScenario(id);
      setScenarios(await listScenarios());
    } catch (e) {
      setAuthMsg('You can only delete your own scenarios.');
    }
  }, [isSignedIn]);

  const handleSignOut = useCallback(async () => {
    try { await signOut(); } catch {}
    setSession(null);
  }, []);

  const handleUndoPoint = useCallback(() => {
    if (plannerRef.current) {
      plannerRef.current.undo();
      setPlannerEstimate(plannerRef.current.points.length >= 2 ? plannerRef.current.estimate() : null);
    }
  }, []);

  const handleClearPlanner = useCallback(() => {
    if (plannerRef.current) {
      plannerRef.current.clear();
      setPlannerEstimate(null);
    }
  }, []);

  const resetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(800, 1200, 1800);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-400" />
        <p className="text-lg">{loadMsg}</p>
        <p className="text-sm text-slate-400">Building the digital twin of Bhavnagar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4 p-8">
        <AlertTriangle className="w-12 h-12 text-red-400" />
        <p className="text-lg text-red-300">Something went wrong</p>
        <p className="text-sm text-slate-400 max-w-md text-center">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-cyan-500 rounded-lg hover:bg-cyan-400">
          Retry
        </button>
      </div>
    );
  }

  const wInfo = weather ? weatherCodeToText(weather.weatherCode) : null;
  const aqiCat = aqi ? aqiCategory(aqi.usAqi) : null;

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden">
      {/* 3D Canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Label overlay */}
      <LabelOverlay labels={labels} camera={cameraRef.current} renderer={rendererRef.current} showLabels={showLabels} showPois={showPois} />

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuthed={() => {}} />}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-slate-950/90 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700">
            <Building2 className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-semibold">Bhavnagar Digital Twin</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 p-0.5">
            {([['day', 'Day', Sun, 'text-amber-400'], ['night', 'Night', Moon, 'text-indigo-300'], ['light', 'Light', Sun, 'text-sky-300']] as const).map(([val, label, Icon, color]) => (
              <button key={val} onClick={() => setTheme(val as 'day' | 'night' | 'light')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${theme === val ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <Icon className={`w-3.5 h-3.5 ${theme === val ? color : ''}`} /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowLegend((s) => !s)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm">
            <Info className="w-4 h-4" /> Legend
          </button>
          <button onClick={resetCamera} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm">
            <RotateCcw className="w-4 h-4" /> Reset View
          </button>
          {isSignedIn ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 text-slate-200 text-sm">
                <User className="w-4 h-4 text-cyan-400" />
                <span className="max-w-[140px] truncate">{userEmail}</span>
              </div>
              <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/80 backdrop-blur rounded-lg border border-cyan-500 text-white hover:bg-cyan-500 text-sm">
              <LogIn className="w-4 h-4" /> Sign in
            </button>
          )}
        </div>
      </div>

      {/* Weather + AQI widget (top-right under bar) */}
      <div className="absolute top-16 right-4 z-10 flex flex-col gap-2 w-64">
        {weather && wInfo && (
          <div className="bg-slate-900/85 backdrop-blur rounded-xl border border-slate-700 p-3 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wide">Live Weather</span>
              <span className="text-xs text-slate-500">{new Date(weather.time).toLocaleTimeString()}</span>
            </div>
            <div className="flex items-center gap-3">
              <WeatherIcon name={wInfo.icon} isDay={weather.isDay} />
              <div>
                <div className="text-2xl font-bold">{Math.round(weather.temperature)}°C</div>
                <div className="text-xs text-slate-300">{wInfo.label}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300"><Wind className="w-3.5 h-3.5" /> {Math.round(weather.windSpeed)} km/h</div>
              <div className="flex items-center gap-1.5 text-slate-300"><Droplets className="w-3.5 h-3.5" /> {weather.humidity}%</div>
              <div className="flex items-center gap-1.5 text-slate-300"><Cloud className="w-3.5 h-3.5" /> {weather.cloudCover}%</div>
              <div className="flex items-center gap-1.5 text-slate-300"><Navigation className="w-3.5 h-3.5" /> {weather.windDir}°</div>
            </div>
          </div>
        )}
        {aqi && aqiCat && (
          <div className="bg-slate-900/85 backdrop-blur rounded-xl border border-slate-700 p-3 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wide">Air Quality (AQI)</span>
              <Activity className="w-4 h-4" style={{ color: aqiCat.color }} />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold" style={{ color: aqiCat.color }}>{Math.round(aqi.usAqi)}</div>
              <div>
                <div className="text-sm font-medium" style={{ color: aqiCat.color }}>{aqiCat.label}</div>
                <div className="text-xs text-slate-400">US AQI</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="text-slate-300">PM2.5: <span className="font-medium">{aqi.pm25.toFixed(1)} µg/m³</span></div>
              <div className="text-slate-300">PM10: <span className="font-medium">{aqi.pm10.toFixed(1)} µg/m³</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Compass + coordinate readout (bottom-left) */}
      <div className="absolute bottom-28 left-4 z-10 flex items-end gap-3 pointer-events-none">
        <div className="relative w-16 h-16 bg-slate-900/80 backdrop-blur rounded-full border border-slate-700 flex items-center justify-center">
          <Compass className="absolute w-14 h-14 text-slate-500" />
          <div className="absolute font-bold text-xs text-red-400" style={{ transform: `rotate(${compassAngle}deg)`, transition: 'transform 0.1s' }}>
            <div className="flex flex-col items-center -mt-5">
              <span className="text-red-400">N</span>
              <div className="w-0.5 h-5 bg-red-400" />
            </div>
          </div>
        </div>
        {hoverCoord && (
          <div className="bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 font-mono">
            {hoverCoord.lat.toFixed(5)}, {hoverCoord.lng.toFixed(5)}
          </div>
        )}
      </div>

      {/* Legend panel */}
      {showLegend && (
        <div className="absolute top-32 left-4 z-20 bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-3 text-white text-xs w-56">
          <div className="font-semibold mb-2 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-cyan-400" /> Map Legend</div>
          <div className="space-y-1.5">
            <LegendRow color="#f59e0b" label="Motorway / Trunk" />
            <LegendRow color="#fbbf24" label="Primary road" />
            <LegendRow color="#fde68a" label="Secondary road" />
            <LegendRow color="#ffffff" label="Tertiary / Local" />
            <LegendRow color="#1e6fb0" label="Water body" />
            <LegendRow color="#ef4444" label="Hospital / Clinic" />
            <LegendRow color="#22c55e" label="School / College" />
            <LegendRow color="#3b82f6" label="Police station" />
            <LegendRow color="#f97316" label="Fire station" />
            <LegendRow color="#a855f7" label="Railway station" />
            <LegendRow color="#fbbf24" label="Traffic vehicle" />
          </div>
        </div>
      )}

      {/* Tab nav (left side) */}
      <div className="absolute left-4 top-16 z-10 flex flex-col gap-1">
        {([
          { id: 'overview', label: 'Overview', icon: Eye },
          { id: 'traffic', label: 'Traffic', icon: Route },
          { id: 'flood', label: 'Flood Sim', icon: Waves },
          { id: 'planner', label: 'Planner', icon: Construction },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setPlannerActive(t.id === 'planner'); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
              tab === t.id
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom control panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pb-4 px-4 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur rounded-xl border border-slate-700 p-4 max-w-5xl w-full">
          {tab === 'overview' && (
            <div className="text-white">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h2 className="font-semibold">City Overview & Layers</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  { key: 'roads', label: 'Roads' },
                  { key: 'buildings', label: 'Buildings' },
                  { key: 'water', label: 'Water Bodies' },
                  { key: 'traffic', label: 'Traffic' },
                  { key: 'grid', label: 'Grid' },
                ] as const).map((l) => (
                  <label key={l.key} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLayers[l.key as keyof typeof showLayers]}
                      onChange={(e) => setShowLayers({ ...showLayers, [l.key]: e.target.checked })}
                      className="accent-cyan-500"
                    />
                    {l.label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-700">
                <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="accent-cyan-500" />
                  <Tag className="w-3.5 h-3.5" /> Area / building names
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={showPois} onChange={(e) => setShowPois(e.target.checked)} className="accent-cyan-500" />
                  <MapPin className="w-3.5 h-3.5" /> POI markers
                </label>
              </div>
              {mapData && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-3 border-t border-slate-700 text-sm text-slate-300">
                  <div><span className="text-slate-500">Roads:</span> {mapData.roads.length}</div>
                  <div><span className="text-slate-500">Buildings:</span> {mapData.buildings.length}</div>
                  <div><span className="text-slate-500">Water:</span> {mapData.waterAreas.length}</div>
                  <div><span className="text-slate-500">Waterways:</span> {mapData.waterways.length}</div>
                  <div><span className="text-slate-500">POIs:</span> {mapData.pois.length}</div>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-3">
                Drag to rotate, scroll to zoom, right-drag to pan. Data: OpenStreetMap (Overpass), Open-Meteo.
              </p>
            </div>
          )}

          {tab === 'traffic' && (
            <div className="text-white">
              <div className="flex items-center gap-2 mb-3">
                <Route className="w-5 h-5 text-amber-400" />
                <h2 className="font-semibold">Traffic Simulator</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 flex justify-between">
                    <span>Number of vehicles</span>
                    <span className="font-mono text-cyan-300">{vehicleCount}</span>
                  </label>
                  <input type="range" min={0} max={600} value={vehicleCount}
                    onChange={(e) => setVehicleCount(Number(e.target.value))}
                    className="w-full accent-amber-500 mt-1" />
                </div>
                <div>
                  <label className="text-sm text-slate-300 flex justify-between">
                    <span>Speed (congestion factor)</span>
                    <span className="font-mono text-cyan-300">{congestion.toFixed(2)}x</span>
                  </label>
                  <input type="range" min={0.1} max={2} step={0.05} value={congestion}
                    onChange={(e) => setCongestion(Number(e.target.value))}
                    className="w-full accent-amber-500 mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm text-slate-400">
                <Gauge className="w-4 h-4" />
                Vehicles move along the real road network. Lower congestion = slower traffic (jam). Raise it to simulate free-flow.
              </div>
            </div>
          )}

          {tab === 'flood' && (
            <div className="text-white">
              <div className="flex items-center gap-2 mb-3">
                <Waves className="w-5 h-5 text-blue-400" />
                <h2 className="font-semibold">Flood Emergency Simulation</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 flex justify-between">
                    <span>Water level rise</span>
                    <span className="font-mono text-blue-300">{floodLevel.toFixed(1)} m</span>
                  </label>
                  <input type="range" min={0} max={25} step={0.5} value={floodLevel}
                    onChange={(e) => setFloodLevel(Number(e.target.value))}
                    className="w-full accent-blue-500 mt-1" />
                  <div className="flex gap-2 mt-2">
                    {[5, 10, 15, 20].map((v) => (
                      <button key={v} onClick={() => setFloodLevel(v)}
                        className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-600">
                        {v}m
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                    <div className="text-2xl font-bold text-red-400">{floodImpact.floodedBuildings}</div>
                    <div className="text-xs text-slate-400">Buildings flooded</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                    <div className="text-2xl font-bold text-orange-400">{floodImpact.floodedRoads}</div>
                    <div className="text-xs text-slate-400">Road segments</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2 text-center">
                    <div className="text-2xl font-bold text-amber-400">{floodImpact.floodedKm.toFixed(1)}</div>
                    <div className="text-xs text-slate-400">km of road</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Simulates Gulf of Khambhat coastal flooding. Low-lying coastal areas submerge first. Use this to plan evacuation routes and emergency shelter placement.
              </p>
            </div>
          )}

          {tab === 'planner' && (
            <div className="text-white">
              <div className="flex items-center gap-2 mb-3">
                <Construction className="w-5 h-5 text-yellow-400" />
                <h2 className="font-semibold">Town Planner — Infrastructure Estimator</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setPlannerType('flyover')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-sm border ${
                        plannerType === 'flyover' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'bg-slate-800 border-slate-600 text-slate-300'
                      }`}>
                      <Building2 className="w-4 h-4" /> Flyover
                    </button>
                    <button onClick={() => setPlannerType('metro')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-sm border ${
                        plannerType === 'metro' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-600 text-slate-300'
                      }`}>
                      <Train className="w-4 h-4" /> Metro
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    {plannerActive ? 'Click on the map to drop waypoints. Each click adds a point to the route.' : 'Planner inactive.'}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleUndoPoint} className="flex items-center gap-1 px-2 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600">
                      <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                    <button onClick={handleClearPlanner} className="flex items-center gap-1 px-2 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600">
                      <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
                      placeholder="Scenario name..."
                      className="flex-1 px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500" />
                    <button onClick={handleSaveScenario} disabled={saving || !plannerEstimate}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-lg">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </button>
                  </div>
                  {!isSignedIn && (
                    <p className="text-xs text-amber-400/80 mt-2">Sign in to save scenarios to your account.</p>
                  )}
                  {authMsg && <p className="text-xs text-red-400 mt-2">{authMsg}</p>}
                </div>

                <div className="md:col-span-2">
                  {plannerEstimate ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <EstimateCard icon={Route} label="Route length" value={`${(plannerEstimate.lengthM / 1000).toFixed(2)} km`} color="text-cyan-300" />
                      <EstimateCard icon={Building2} label="Buildings affected" value={`${plannerEstimate.buildingsAffected}`} color="text-orange-300" />
                      <EstimateCard icon={Layers} label="Roads crossed" value={`${plannerEstimate.roadsCrossed}`} color="text-yellow-300" />
                      <EstimateCard icon={Thermometer} label="Est. cost" value={`₹${plannerEstimate.estCostCr.toFixed(0)} Cr`} color="text-green-300" />
                      <EstimateCard icon={Activity} label="Est. build time" value={`${plannerEstimate.estMonths} months`} color="text-purple-300" />
                      <EstimateCard icon={MapPin} label="Population served" value={`${plannerEstimate.populationServed.toLocaleString()}`} color="text-blue-300" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg p-4">
                      Click on the map to draw a {plannerType} route, then see the impact estimate here.
                    </div>
                  )}
                </div>
              </div>

              {scenarios.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <h3 className="text-sm text-slate-400 mb-2">Saved Scenarios</h3>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {scenarios.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-2 py-1 bg-slate-800 rounded-lg border border-slate-600 text-xs">
                        <span className="text-slate-300">{s.name}</span>
                        <span className="text-slate-500">({s.type})</span>
                        <button onClick={() => s.id && handleDeleteScenario(s.id)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EstimateCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`font-bold text-lg ${color}`}>{value}</div>
    </div>
  );
}

function WeatherIcon({ name, isDay }: { name: string; isDay: boolean }) {
  const cls = "w-10 h-10 text-cyan-300";
  switch (name) {
    case 'sun': return isDay ? <Sun className={cls} /> : <CloudSun className={cls} />;
    case 'cloud-sun': return <CloudSun className={cls} />;
    case 'cloud': return <Cloud className={cls} />;
    case 'fog': return <CloudFog className={cls} />;
    case 'cloud-drizzle': return <CloudDrizzle className={cls} />;
    case 'cloud-rain': return <CloudRain className={cls} />;
    case 'cloud-lightning': return <CloudLightning className={cls} />;
    case 'snowflake': return <Snowflake className={cls} />;
    default: return <Cloud className={cls} />;
  }
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-slate-300">{label}</span>
    </div>
  );
}
