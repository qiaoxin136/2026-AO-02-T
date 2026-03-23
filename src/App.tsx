import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { APIProvider, Map, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import DeckGL from '@deck.gl/react';
import { MapView } from '@deck.gl/core';
import { TripsLayer } from '@deck.gl/geo-layers';
import { useTripsData } from './hooks/useTripsData';
import { useAnimation } from './hooks/useAnimation';
import { AnimationControls } from './components/AnimationControls';
import type { AnimationSpeed, Trip } from './types';
import './App.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

const VENDOR_COLORS: [number, number, number][] = [
  [253, 128, 93],
  [23, 184, 190],
  [255, 203, 71],
];

const MAP_CENTER = { lat: 26.0, lng: -80.19 };

// Spherical polygon area in square meters using projected Shoelace formula
function calculatePolygonArea(pts: google.maps.LatLngLiteral[]): number {
  if (pts.length < 3) return 0;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const latRef = toRad(pts.reduce((s, p) => s + p.lat, 0) / pts.length);
  const lngRef = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  const proj = pts.map(p => ({
    x: R * toRad(p.lng - lngRef) * Math.cos(latRef),
    y: R * toRad(p.lat - pts[0].lat),
  }));
  let area = 0;
  for (let i = 0, n = proj.length; i < n; i++) {
    const j = (i + 1) % n;
    area += proj[i].x * proj[j].y - proj[j].x * proj[i].y;
  }
  return Math.abs(area) / 2;
}

function AreaOverlay({ points, finished }: { points: google.maps.LatLngLiteral[]; finished: boolean }) {
  const map = useMap();
  const markersRef = useRef<google.maps.Marker[]>([]);
  const shapeRef = useRef<google.maps.Polygon | google.maps.Polyline | null>(null);

  useEffect(() => () => {
    markersRef.current.forEach(m => m.setMap(null));
    shapeRef.current?.setMap(null);
  }, []);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    shapeRef.current?.setMap(null);
    shapeRef.current = null;

    points.forEach((pt, i) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="#7c3aed" stroke="white" stroke-width="2"/>
        <text x="10" y="14" text-anchor="middle" font-size="9" font-weight="bold" font-family="sans-serif" fill="white">${i + 1}</text>
      </svg>`;
      markersRef.current.push(new window.google.maps.Marker({
        position: pt, map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          anchor: new window.google.maps.Point(10, 10),
          scaledSize: new window.google.maps.Size(20, 20),
        },
      }));
    });

    if (points.length >= 2) {
      if (finished && points.length >= 3) {
        shapeRef.current = new window.google.maps.Polygon({
          paths: points, map,
          fillColor: '#7c3aed', fillOpacity: 0.18,
          strokeColor: '#7c3aed', strokeWeight: 2, strokeOpacity: 0.9,
        });
      } else {
        shapeRef.current = new window.google.maps.Polyline({
          path: points, map, geodesic: true,
          strokeColor: '#7c3aed', strokeWeight: 2, strokeOpacity: 0.85,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
        });
      }
    }
  }, [points, finished, map]);

  return null;
}

// Haversine distance in meters between two LatLngLiteral points
function haversineDistance(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

function RulerOverlay({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      polylineRef.current?.setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    points.forEach((pt, i) => {
      const label = String(i + 1);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="11" fill="#ff6b35" stroke="white" stroke-width="2.5"/>
        <text x="13" y="17.5" text-anchor="middle" font-size="12" font-weight="bold" font-family="sans-serif" fill="white">${label}</text>
      </svg>`;
      markersRef.current.push(new window.google.maps.Marker({
        position: pt,
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          anchor: new window.google.maps.Point(13, 13),
          scaledSize: new window.google.maps.Size(26, 26),
        },
      }));
    });

    if (points.length === 2) {
      polylineRef.current = new window.google.maps.Polyline({
        path: points,
        map,
        strokeColor: '#ff6b35',
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        geodesic: true,
      });
    }
  }, [points, map]);

  return null;
}

interface SvMarkerData {
  position: google.maps.LatLng;
  heading: number;
}

// Enables tilt/rotate controls on the map instance after it loads.
function MapOptionsEnforcer() {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    map.setOptions({
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      rotateControl: true,
    });
  }, [map]);
  return null;
}

// Intercepts pegman drop: hides native overlay, calls onDrop with resolved position.
function HandlePegmanDrop({ onDrop }: { onDrop: (pos: google.maps.LatLng) => void }) {
  const map = useMap();
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (!map) return;
    const pano = map.getStreetView();
    let pegmanDropped = false;

    const visibleListener = pano.addListener('visible_changed', () => {
      if (pano.getVisible()) {
        pegmanDropped = true;
        pano.setVisible(false);
      }
    });

    const positionListener = pano.addListener('position_changed', () => {
      if (!pegmanDropped) return;
      pegmanDropped = false;
      const pos = pano.getPosition();
      if (pos) onDropRef.current(pos);
    });

    return () => {
      visibleListener.remove();
      positionListener.remove();
    };
  }, [map]);

  return null;
}

// Renders red dot + heading cone on the map, synced to street view.
function StreetViewMapMarker({ marker }: { marker: SvMarkerData | null }) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    markerRef.current = new window.google.maps.Marker({ map: null });
    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!markerRef.current || !map || !window.google?.maps) return;
    if (!marker) {
      markerRef.current.setMap(null);
      return;
    }
    const { position, heading } = marker;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="-32 -32 64 64">
      <g transform="rotate(${heading})">
        <path d="M0,0 L-15,-34 A38,38 0 0,1 15,-34 Z"
              fill="rgba(220,30,30,0.30)" stroke="rgba(220,30,30,0.75)" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
      <circle cx="0" cy="0" r="9" fill="#dd1e1e" stroke="white" stroke-width="2.5"/>
    </svg>`;

    markerRef.current.setPosition(position);
    markerRef.current.setIcon({
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      anchor: new window.google.maps.Point(32, 32),
      scaledSize: new window.google.maps.Size(64, 64),
    });
    markerRef.current.setMap(map);
  }, [marker, map]);

  return null;
}

interface DeckViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

// Renders TripsLayer using DeckGL React component synced to the Google Maps camera.
// This avoids GoogleMapsOverlay's WebGLOverlayView context-sharing issues in VECTOR mode.
function DeckOverlay({ trips, currentTime }: { trips: Trip[]; currentTime: number }) {
  const map = useMap();
  const [viewState, setViewState] = useState<DeckViewState>({
    longitude: MAP_CENTER.lng,
    latitude: MAP_CENTER.lat,
    zoom: 15.5, // deck.gl uses 512px tiles; google maps uses 256px: deck zoom = google zoom - 1
    pitch: 0,
    bearing: 0,
  });

  useEffect(() => {
    if (!map) return;
    const update = () => {
      const center = map.getCenter();
      if (!center) return;
      setViewState({
        longitude: center.lng(),
        latitude: center.lat(),
        zoom: (map.getZoom() ?? 16.5) - 1,
        pitch: map.getTilt() ?? 0,
        bearing: map.getHeading() ?? 0,
      });
    };
    update();
    const ls = [
      map.addListener('center_changed', update),
      map.addListener('zoom_changed', update),
      map.addListener('heading_changed', update),
      map.addListener('tilt_changed', update),
      map.addListener('bounds_changed', update),
    ];
    return () => ls.forEach(l => l.remove());
  }, [map]);

  const layer = useMemo(() => new TripsLayer<Trip>({
    id: 'trips',
    data: trips,
    getPath: d => d.path,
    getTimestamps: d => d.timestamps,
    getColor: d => VENDOR_COLORS[d.vendor] ?? [255, 255, 255],
    opacity: 1,
    widthMinPixels: 3,
    currentTime,
    fadeTrail: false,
  }), [trips, currentTime]);

  return (
    <DeckGL
      views={new MapView({ repeat: true })}
      viewState={viewState}
      layers={[layer]}
      style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', pointerEvents: 'none' }}
    />
  );
}

function StreetViewPanel({
  position,
  onMarkerChange,
}: {
  position: google.maps.LatLng | null;
  onMarkerChange: (data: SvMarkerData) => void;
}) {
  const panoRef = useRef<HTMLDivElement>(null);
  const panoInstanceRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const onMarkerChangeRef = useRef(onMarkerChange);
  onMarkerChangeRef.current = onMarkerChange;

  const notifyMarker = useCallback(() => {
    const pano = panoInstanceRef.current;
    if (!pano) return;
    const pos = pano.getPosition();
    const pov = pano.getPov();
    if (pos) onMarkerChangeRef.current({ position: pos, heading: pov.heading });
  }, []);

  // Initialize panorama once on mount
  useEffect(() => {
    if (!panoRef.current || !window.google?.maps) return;
    const pano = new window.google.maps.StreetViewPanorama(panoRef.current, {
      position: position ?? MAP_CENTER,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: true,
      fullscreenControl: false,
    });
    panoInstanceRef.current = pano;
    pano.addListener('position_changed', notifyMarker);
    pano.addListener('pov_changed', notifyMarker);
    notifyMarker();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to new position when prop changes
  useEffect(() => {
    if (!position || !panoInstanceRef.current || !window.google?.maps) return;
    const sv = new window.google.maps.StreetViewService();
    sv.getPanorama(
      { location: position, radius: 500 },
      (data: google.maps.StreetViewPanoramaData | null, status: google.maps.StreetViewStatus) => {
        if (status === window.google.maps.StreetViewStatus.OK && data?.location?.latLng) {
          panoInstanceRef.current?.setPosition(data.location.latLng);
        } else {
          panoInstanceRef.current?.setPosition(position);
        }
      }
    );
  }, [position]);

  return <div ref={panoRef} className="street-view-pano" />;
}

function MapApp() {
  const { trips, loading, error, timeRange } = useTripsData();
  const animation = useAnimation(timeRange);
  const [showControls, setShowControls] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);
  const [svPosition, setSvPosition] = useState<google.maps.LatLng | null>(null);
  const [svMarker, setSvMarker] = useState<SvMarkerData | null>(null);
  const [activeTool, setActiveTool] = useState<'coord' | 'ruler' | 'area' | null>(null);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [rulerPoints, setRulerPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const [areaPoints, setAreaPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const [areaFinished, setAreaFinished] = useState(false);

  const rulerDistance = useMemo(() => {
    if (rulerPoints.length < 2) return null;
    const meters = haversineDistance(rulerPoints[0], rulerPoints[1]);
    return { feet: meters * 3.28084, miles: meters / 1609.344 };
  }, [rulerPoints]);

  const areaMeasurement = useMemo(() => {
    if (areaPoints.length < 3) return null;
    const sqMeters = calculatePolygonArea(areaPoints);
    const sqFeet = sqMeters * 10.7639;
    return { sqFeet, acres: sqFeet / 43560, sqMiles: sqFeet / 27878400 };
  }, [areaPoints]);

  const selectTool = useCallback((tool: 'coord' | 'ruler' | 'area') => {
    setActiveTool(prev => {
      const next = prev === tool ? null : tool;
      if (next !== 'coord') setClickedCoord(null);
      if (next !== 'ruler') setRulerPoints([]);
      if (next !== 'area') { setAreaPoints([]); setAreaFinished(false); }
      return next;
    });
    setToolMenuOpen(false);
  }, []);

  const handleSpeedChange = useCallback((s: AnimationSpeed) => {
    animation.setSpeed(s);
  }, [animation]);

  const handlePegmanDrop = useCallback((pos: google.maps.LatLng) => {
    setSvPosition(pos);
    setShowStreetView(true);
  }, []);

  const handleStreetViewToggle = useCallback(() => {
    setShowStreetView(v => {
      if (v) setSvMarker(null); // clear marker on close
      return !v;
    });
  }, []);

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!e.detail.latLng) return;
    const pt = { lat: e.detail.latLng.lat, lng: e.detail.latLng.lng };
    if (activeTool === 'coord') {
      setClickedCoord(pt);
    } else if (activeTool === 'ruler') {
      setRulerPoints(prev => prev.length >= 2 ? [pt] : [...prev, pt]);
    } else if (activeTool === 'area' && !areaFinished) {
      setAreaPoints(prev => [...prev, pt]);
    }
  }, [activeTool, areaFinished]);

  if (error) {
    return <div className="status-msg error">Error loading data: {error}</div>;
  }

  return (
    <div className={`app-container ${showStreetView ? 'split' : ''}`}>
      {loading && <div className="status-msg loading">Loading trip data...</div>}

      <div className="map-area">
        <Map
          defaultCenter={MAP_CENTER}
          defaultZoom={16.5}
          mapTypeId="roadmap"
          disableDefaultUI={false}
          gestureHandling="greedy"
          renderingType="VECTOR"
          tiltInteractionEnabled={true}
          headingInteractionEnabled={true}
          rotateControl={true}
          defaultTilt={45}
          defaultHeading={0}
          streetViewControlOptions={{ position: 6 }}
          onClick={handleMapClick as (e: MapMouseEvent) => void}
          style={{ width: '100%', height: '100%', cursor: (activeTool && !(activeTool === 'area' && areaFinished)) ? 'crosshair' : '' }}
        >
          <MapOptionsEnforcer />
          <HandlePegmanDrop onDrop={handlePegmanDrop} />
          {showStreetView && <StreetViewMapMarker marker={svMarker} />}
          {activeTool === 'ruler' && <RulerOverlay points={rulerPoints} />}
          {activeTool === 'area' && <AreaOverlay points={areaPoints} finished={areaFinished} />}
        </Map>

        {!loading && trips.length > 0 && (
          <DeckOverlay trips={trips} currentTime={animation.currentTime} />
        )}

        <button
          className={`sv-toggle-btn ${showStreetView ? 'active' : ''}`}
          onClick={handleStreetViewToggle}
          title={showStreetView ? 'Close Street View' : 'Open Street View'}
        >
          {showStreetView ? (
            <svg viewBox="0 0 40 40" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
              <line x1="10" y1="10" x2="30" y2="30" stroke="#c0392b" strokeWidth="4" strokeLinecap="round"/>
              <line x1="30" y1="10" x2="10" y2="30" stroke="#c0392b" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 48 60" width="32" height="40" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="8" r="7" fill="#f5cba7" stroke="#c0824a" strokeWidth="1.2"/>
              <ellipse cx="24" cy="3" rx="9" ry="2.5" fill="#5d4037"/>
              <rect x="18" y="0.5" width="12" height="4" rx="1.5" fill="#5d4037"/>
              <circle cx="21" cy="8.5" r="2.5" fill="none" stroke="#444" strokeWidth="1"/>
              <circle cx="27" cy="8.5" r="2.5" fill="none" stroke="#444" strokeWidth="1"/>
              <line x1="23.5" y1="8.5" x2="24.5" y2="8.5" stroke="#444" strokeWidth="1"/>
              <line x1="18.5" y1="8.5" x2="17" y2="9.2" stroke="#444" strokeWidth="1"/>
              <line x1="29.5" y1="8.5" x2="31" y2="9.2" stroke="#444" strokeWidth="1"/>
              <path d="M21 11.5 Q24 13 27 11.5" fill="none" stroke="#7b5e3a" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M24 15 Q20 22 19 30" fill="none" stroke="#2c6fad" strokeWidth="4.5" strokeLinecap="round"/>
              <line x1="21" y1="18" x2="14" y2="26" stroke="#2c6fad" strokeWidth="3" strokeLinecap="round"/>
              <line x1="22" y1="18" x2="29" y2="22" stroke="#2c6fad" strokeWidth="3" strokeLinecap="round"/>
              <line x1="29" y1="22" x2="34" y2="36" stroke="#8B6914" strokeWidth="2.2" strokeLinecap="round"/>
              <ellipse cx="34.5" cy="37" rx="2" ry="1" fill="#8B6914"/>
              <line x1="19" y1="30" x2="14" y2="44" stroke="#1a237e" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="14" y1="44" x2="10" y2="50" stroke="#1a237e" strokeWidth="3" strokeLinecap="round"/>
              <line x1="19" y1="30" x2="23" y2="44" stroke="#1a237e" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="23" y1="44" x2="26" y2="50" stroke="#1a237e" strokeWidth="3" strokeLinecap="round"/>
              <ellipse cx="9" cy="51" rx="4" ry="2" fill="#333"/>
              <ellipse cx="26.5" cy="51" rx="4" ry="2" fill="#333"/>
            </svg>
          )}
        </button>

        {/* Consolidated tools button */}
        <div className="tools-group">
          <button
            className={`tools-main-btn ${activeTool ? 'active' : ''}`}
            onClick={() => setToolMenuOpen(v => !v)}
            title="Measurement tools"
          >
            {activeTool === 'coord' && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>}
            {activeTool === 'ruler' && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><line x1="6" y1="9" x2="6" y2="12"/><line x1="10" y1="10" x2="10" y2="12"/><line x1="14" y1="10" x2="14" y2="12"/><line x1="18" y1="9" x2="18" y2="12"/><line x1="2" y1="8" x2="2" y2="16"/><line x1="22" y1="8" x2="22" y2="16"/></svg>}
            {activeTool === 'area'  && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,3 21,9 18,20 6,20 3,9"/></svg>}
            {!activeTool && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
          </button>

          {toolMenuOpen && (
            <div className="tools-flyout">
              <button className={`tools-flyout-item ${activeTool === 'coord' ? 'active' : ''}`} onClick={() => selectTool('coord')} title="Coordinate picker">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
                <span>Coordinate</span>
              </button>
              <button className={`tools-flyout-item ${activeTool === 'ruler' ? 'active' : ''}`} onClick={() => selectTool('ruler')} title="Measure distance">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><line x1="6" y1="9" x2="6" y2="12"/><line x1="10" y1="10" x2="10" y2="12"/><line x1="14" y1="10" x2="14" y2="12"/><line x1="18" y1="9" x2="18" y2="12"/><line x1="2" y1="8" x2="2" y2="16"/><line x1="22" y1="8" x2="22" y2="16"/></svg>
                <span>Ruler</span>
              </button>
              <button className={`tools-flyout-item ${activeTool === 'area' ? 'active' : ''}`} onClick={() => selectTool('area')} title="Measure area">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,3 21,9 18,20 6,20 3,9"/></svg>
                <span>Area</span>
              </button>
            </div>
          )}
        </div>

        {/* Tool output displays */}
        {activeTool === 'coord' && clickedCoord && (
          <div className="tool-display">
            <span className="coord-label">Lat</span>
            <strong className="val-coord">{clickedCoord.lat.toFixed(6)}</strong>
            <span className="coord-label">Lng</span>
            <strong className="val-coord">{clickedCoord.lng.toFixed(6)}</strong>
            <button className="coord-close" onClick={() => setClickedCoord(null)}>✕</button>
          </div>
        )}

        {activeTool === 'ruler' && (
          <div className="tool-display">
            {rulerPoints.length === 0 && <span className="ruler-hint">Click point 1 on map</span>}
            {rulerPoints.length === 1 && <span className="ruler-hint">Click point 2 on map</span>}
            {rulerDistance && (
              <>
                <span className="coord-label">Distance</span>
                <strong className="val-ruler">{rulerDistance.feet.toLocaleString('en-US', { maximumFractionDigits: 1 })} ft</strong>
                <strong className="val-ruler">{rulerDistance.miles.toFixed(3)} mi</strong>
                <button className="coord-close" onClick={() => setRulerPoints([])}>↺</button>
              </>
            )}
          </div>
        )}

        {activeTool === 'area' && (
          <div className="tool-display">
            {areaPoints.length === 0 && <span className="ruler-hint">Click to add points</span>}
            {areaPoints.length > 0 && !areaFinished && (
              <>
                <span className="ruler-hint">{areaPoints.length} point{areaPoints.length !== 1 ? 's' : ''} added</span>
                {areaPoints.length >= 3 && (
                  <button className="area-finish-btn" onClick={() => setAreaFinished(true)}>Finish polygon</button>
                )}
                <button className="coord-close" onClick={() => { setAreaPoints([]); setAreaFinished(false); }}>✕</button>
              </>
            )}
            {areaFinished && areaMeasurement && (
              <>
                <span className="coord-label">Area</span>
                <strong className="val-area">{areaMeasurement.sqFeet.toLocaleString('en-US', { maximumFractionDigits: 1 })} ft²</strong>
                <strong className="val-area">{areaMeasurement.acres.toFixed(4)} acres</strong>
                <strong className="val-area">{areaMeasurement.sqMiles.toFixed(6)} mi²</strong>
                <button className="coord-close" onClick={() => { setAreaPoints([]); setAreaFinished(false); }}>↺</button>
              </>
            )}
          </div>
        )}

        {!loading && (
          <div className="controls-wrapper">
            <button
              className={`controls-toggle ${showControls ? 'active' : ''}`}
              onClick={() => setShowControls(v => !v)}
              title={showControls ? 'Hide controls' : 'Show controls'}
            >
              {showControls ? '⏷ Controls' : '⏶ Controls'}
            </button>

            {showControls && (
              <AnimationControls
                currentTime={animation.currentTime}
                isPlaying={animation.isPlaying}
                speed={animation.speed}
                minTime={animation.minTime}
                maxTime={animation.maxTime}
                onTogglePlay={animation.togglePlay}
                onStepForward={animation.stepForward}
                onStepBackward={animation.stepBackward}
                onSpeedChange={handleSpeedChange}
                onSeek={animation.seek}
              />
            )}
          </div>
        )}
      </div>

      {showStreetView && (
        <div className="street-view-panel">
          <StreetViewPanel position={svPosition} onMarkerChange={setSvMarker} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <MapApp />
    </APIProvider>
  );
}
