import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import { APIProvider, Map, useMap, AdvancedMarker,  type MapMouseEvent } from '@vis.gl/react-google-maps';
import DeckGL from '@deck.gl/react';
import { MapView } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import { useTripsData } from './hooks/useTripsData';
import { usePhotosData } from './hooks/usePhotosData';
import { useAnimation } from './hooks/useAnimation';
import { AnimationControls } from './components/AnimationControls';
import { StoragePhoto } from './components/StoragePhoto';
import type { AnimationSpeed, Trip, LocationRecord } from './types';
import './App.css';

import { WaterLateral } from "./components/WaterLateral";
import { SewerLateral } from "./components/SewerLateral";
import { Complaints } from "./components/complaints";
import { wMain } from "./components/wMain";
import { Photo } from "./components/Photo";

import { sGravity } from "./components/sGravity";
import { sMH } from "./components/sMH";
import { Drain } from "./components/swDrain";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

const VENDOR_COLORS: [number, number, number][] = [
  [65,  105, 225], // vendor 0 — royal blue
  [46,  139,  87], // vendor 1 — green
  [255, 140,   0], // vendor 2 — orange
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

function photoTypeColor(type: string | undefined | null): string {
  switch (String(type ?? '').toLowerCase()) {
    case 'water':      return '#4169e1'; // royal blue
    case 'wastewater': return '#2e8b57'; // green
    case 'stormwater': return '#ff8c00'; // orange
    default:           return '#9e9e9e'; // grey
  }
}

// Renders clickable dot markers for each location record on the map.
function PhotoMarkers({
  photos,
  onPhotoClick,
}: {
  photos: LocationRecord[];
  onPhotoClick: (photo: LocationRecord) => void;
}) {
  return photos.map(photo => (
    <AdvancedMarker
      key={String(photo.id ?? `${photo.lat},${photo.lng}`)}
      position={{ lat: photo.lat, lng: photo.lng }}
      onClick={() => onPhotoClick(photo)}
    >
      <div
        className="photo-marker"
        style={{
          background: photoTypeColor(photo.type),
          ...(photo.joint === false && ['wastewater', 'stormwater'].includes(String(photo.type ?? '').toLowerCase()) && { width: '24px', height: '24px' }),
        }}
      />
    </AdvancedMarker>
  ));
}

// Clickable markers for the Complaints layer (replaces deck.gl GeoJsonLayer for interactivity).
type ComplaintProps = Record<string, unknown>;

function ComplaintsMarkers({ onComplaintClick }: { onComplaintClick: (props: ComplaintProps) => void }) {
  return Complaints.features.map(f => {
    const [lng, lat] = f.geometry.coordinates as number[];
    const resolved = f.properties.Status === 'true';
    return (
      <AdvancedMarker
        key={f.id}
        position={{ lat, lng }}
        onClick={() => onComplaintClick(f.properties as ComplaintProps)}
        title={f.properties.Address ?? ''}
      >
        <div className={`complaint-marker ${resolved ? 'resolved' : 'open'}`} />
      </AdvancedMarker>
    );
  });
}

function ComplaintPopup({ properties, onClose }: { properties: ComplaintProps; onClose: () => void }) {
  return (
    <div className="complaint-popup">
      <div className="complaint-popup-header">
        <span className="complaint-popup-title">Complaint</span>
        <button className="complaint-popup-close" onClick={onClose}>✕</button>
      </div>
      <table className="complaint-attr-table">
        <tbody>
          {Object.entries(properties).filter(([k]) => k !== 'FID' && k !== 'Id').map(([k, v]) => (
            <tr key={k}>
              <td className="complaint-attr-key">{k}</td>
              <td className="complaint-attr-val">{String(v ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Hoverable AdvancedMarkers for the static Photo GeoJSON layer.
const PHOTO_SKIP = new Set(['FID', 'Id']);
type PhotoHoverState = { props: Record<string, unknown>; x: number; y: number } | null;

function PhotoStaticMarkers({ onHover }: { onHover: (state: PhotoHoverState) => void }) {
  return Photo.features.map((f, i) => {
    const [lng, lat] = f.geometry.coordinates as number[];
    const props = f.properties as Record<string, unknown>;
    return (
      <AdvancedMarker key={i} position={{ lat, lng }}>
        <div
          className="photo-static-marker"
          onMouseEnter={e => onHover({ props, x: e.clientX, y: e.clientY })}
          onMouseMove={e  => onHover({ props, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onHover(null)}
        />
      </AdvancedMarker>
    );
  });
}

const SKIP_POPUP_KEYS = new Set(['lat', 'lng', 'photos', '__typename']);

function formatAttrValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

// Full-screen lightbox with prev / next navigation
function Lightbox({
  urls,
  startIndex,
  onClose,
}: {
  urls: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, urls.length - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [urls.length, onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      {/* stop click-through on the image itself */}
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        <StoragePhoto path={urls[idx]} alt={`photo ${idx + 1}`} className="lightbox-img" />
        {urls.length > 1 && (
          <div className="lightbox-counter">{idx + 1} / {urls.length}</div>
        )}
        {idx > 0 && (
          <button className="lightbox-arrow lightbox-prev" onClick={() => setIdx(i => i - 1)}>&#8249;</button>
        )}
        {idx < urls.length - 1 && (
          <button className="lightbox-arrow lightbox-next" onClick={() => setIdx(i => i + 1)}>&#8250;</button>
        )}
      </div>
      <button className="lightbox-close" onClick={onClose}>✕</button>
    </div>
  );
}

// Floating card: photo gallery hero + attribute table below.
function PhotoPopup({
  photo,
  onClose,
}: {
  photo: LocationRecord;
  onClose: () => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const photoUrls: string[] = Array.isArray(photo.photos) ? photo.photos : [];

  const attrs = Object.entries(photo).filter(
    ([k, v]) => !SKIP_POPUP_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  );

  return (
    <>
      <div className="photo-popup">
        {/* Header */}
        <div className="photo-popup-header">
          <span className="photo-popup-title">
            {photo.type ?? 'Location'}
            {photoUrls.length > 0 && (
              <span className="photo-popup-count"> · {photoUrls.length} photo{photoUrls.length !== 1 ? 's' : ''}</span>
            )}
          </span>
          <button className="photo-popup-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Photo gallery */}
        {photoUrls.length > 0 && (
          <div className="photo-gallery">
            {photoUrls.map((url, i) => (
              <div key={i} className="photo-thumb-wrap" onClick={() => setLightboxIdx(i)}>
                <StoragePhoto path={url} alt={`photo ${i + 1}`} className="photo-thumb" />
                <div className="photo-thumb-overlay">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coordinates */}
        <div className="photo-popup-coords">
          <span>📍 {photo.lat.toFixed(6)}, {photo.lng.toFixed(6)}</span>
        </div>

        {/* Attribute table */}
        {attrs.length > 0 && (
          <table className="photo-attr-table">
            <tbody>
              {attrs.map(([key, value]) => (
                <tr key={key}>
                  <td className="photo-attr-key">{key}</td>
                  <td className="photo-attr-val">{formatAttrValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {lightboxIdx !== null && (
        <Lightbox urls={photoUrls} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </>
  );
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
function DeckOverlay({ trips, currentTime, extraLayers }: { trips: Trip[]; currentTime: number; extraLayers: Layer[] }) {
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
    widthMinPixels: 5,
    currentTime,
    fadeTrail: false,
  }), [trips, currentTime]);

  return (
    <DeckGL
      views={new MapView({ repeat: true })}
      viewState={viewState}
      layers={[...extraLayers, layer]}
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
  const { photos } = usePhotosData();
  const animation = useAnimation(timeRange);
  const [showControls, setShowControls] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);
  const [showCostTracking, setShowCostTracking] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showComplaints, setShowComplaints] = useState(false);
  const [showPhotoLayer, setShowPhotoLayer] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dailyLightbox, setDailyLightbox] = useState<{ urls: string[]; idx: number } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<LocationRecord | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintProps | null>(null);
  const [hoveredPhotoStatic, setHoveredPhotoStatic] = useState<PhotoHoverState>(null);
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

  // Static GeoJSON layers rendered in DeckGL
  const layers01 = useMemo<Layer[]>(() => [
    new GeoJsonLayer({
      id: 'smh',
      data: sMH as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      getFillColor: [255, 255, 255, 0],
      getLineColor: [71, 135, 120, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.5,
      getPointRadius: 1,
    }),
    new GeoJsonLayer({
      id: 'wmain',
      data: wMain as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      opacity: 0.5,
      getFillColor: [211, 211, 211, 200],
      getLineColor: [31, 81, 255, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.2,
      getPointRadius: 3,
      getDashArray: [10, 8],
      dashJustified: true,
      dashGapPickable: true,
      extensions: [new PathStyleExtension({ dash: true })],
    }),
    new GeoJsonLayer({
      id: 'sgravity',
      data: sGravity as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      opacity: 0.5,
      getFillColor: [211, 211, 211, 200],
      getLineColor: [50, 205, 50, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.2,
      getPointRadius: 3,
      getDashArray: [10, 8],
      dashJustified: true,
      dashGapPickable: true,
      extensions: [new PathStyleExtension({ dash: true })],
    }),
    new GeoJsonLayer({
      id: 'drain',
      data: Drain as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      opacity: 0.5,
      getFillColor: [211, 211, 211, 200],
      getLineColor: [255, 127, 80, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.2,
      getPointRadius: 3,
      getDashArray: [10, 8],
      dashJustified: true,
      dashGapPickable: true,
      extensions: [new PathStyleExtension({ dash: true })],
    }),
    new GeoJsonLayer({
      id: 'waterlateral',
      data: WaterLateral as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      opacity: 0.5,
      getFillColor: [211, 211, 211, 200],
      getLineColor: [31, 81, 255, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.2,
      getPointRadius: 3,
      getDashArray: [10, 8],
      dashJustified: true,
      dashGapPickable: true,
      extensions: [new PathStyleExtension({ dash: true })],
    }),
    new GeoJsonLayer({
      id: 'sewerlateral',
      data: SewerLateral as any,
      stroked: true,
      filled: true,
      pointType: 'circle+text',
      pickable: true,
      opacity: 0.5,
      getFillColor: [211, 211, 211, 200],
      getLineColor: [50, 205, 50, 255],
      getText: (f: any) => f.properties.Id,
      getLineWidth: 0.2,
      getPointRadius: 3,
      getDashArray: [10, 8],
      dashJustified: true,
      dashGapPickable: true,
      extensions: [new PathStyleExtension({ dash: true })],
    }),
  ], []);

  // Records for the selected date (Daily Report)
  const dailyRecords = useMemo(
    () => photos.filter(p => p.date === selectedDate),
    [photos, selectedDate],
  );

  // PDF download for Daily Report
  const downloadDailyPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const colW = pageW - margin * 2;
    let y = margin;

    const LINE = 6;
    const SECTION_GAP = 4;

    const checkPage = (needed: number) => {
      if (y + needed > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Daily Report — ${selectedDate || 'No date selected'}`, margin, y);
    y += LINE + 2;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`${dailyRecords.length} record${dailyRecords.length !== 1 ? 's' : ''}`, margin, y);
    doc.setTextColor(0);
    y += LINE + SECTION_GAP;

    // Resolve all photo URLs up front (getUrl for storage paths)
    const { getUrl } = await import('aws-amplify/storage');
    const resolveUrl = async (path: string): Promise<string | null> => {
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      try {
        const result = await getUrl({ path, options: { expiresIn: 3600 } });
        return result.url.href;
      } catch { return null; }
    };

    for (const rec of dailyRecords) {
      const attrRows: [string, string][] = [
        ['Track',       String(rec.track       ?? '—')],
        ['Type',        String(rec.type        ?? '—')],
        ['Time',        String(rec.time        ?? '—')],
        ['Diameter',    rec.diameter != null ? `${rec.diameter} in` : '—'],
        ['Length',      rec.length   != null ? `${Number(rec.length).toFixed(1)} ft` : '—'],
        ['Username',    String(rec.username    ?? '—')],
        ['Description', String(rec.description ?? '—')],
        ['Joint',       rec.joint != null ? (rec.joint ? 'Yes' : 'No') : '—'],
        ['Lat / Lng',   `${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}`],
      ].filter(([, v]) => v !== '—') as [string, string][];

      // Card header
      checkPage(LINE * 2);
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, colW, LINE + 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${rec.type ?? 'Record'}${rec.track != null ? `  ·  Track ${rec.track}` : ''}${rec.time ? `  ·  ${rec.time}` : ''}`, margin + 2, y + LINE - 1);
      y += LINE + 3;

      // Attributes
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (const [k, v] of attrRows) {
        checkPage(LINE);
        doc.setFont('helvetica', 'bold');
        doc.text(`${k}:`, margin + 2, y);
        doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(v, colW - 40);
        doc.text(wrapped, margin + 35, y);
        y += LINE * wrapped.length;
      }

      // Photos
      const recPhotos: string[] = Array.isArray(rec.photos) ? rec.photos : [];
      if (recPhotos.length > 0) {
        checkPage(LINE);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Photos:', margin + 2, y);
        y += LINE;

        for (const photoPath of recPhotos) {
          const url = await resolveUrl(photoPath);
          if (!url) continue;
          try {
            // Fetch image and convert to data URL
            const resp = await fetch(url);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result as string);
              reader.onerror = rej;
              reader.readAsDataURL(blob);
            });
            // Fit image to page width
            const imgW = colW;
            const imgH = Math.min(80, imgW * 0.6);
            checkPage(imgH + 4);
            doc.addImage(dataUrl, 'JPEG', margin, y, imgW, imgH);
            y += imgH + 4;
          } catch { /* skip images that fail to load */ }
        }
      }

      y += SECTION_GAP;
      // Divider
      checkPage(2);
      doc.setDrawColor(200);
      doc.line(margin, y, margin + colW, y);
      y += SECTION_GAP;
    }

    doc.save(`daily-report-${selectedDate || 'unknown'}.pdf`);
  }, [dailyRecords, selectedDate]);

  // MH counts (joint === false)
  const mhWastewater = useMemo(
    () => photos.filter(p => String(p.type ?? '').toLowerCase() === 'wastewater' && p.joint === false).length,
    [photos],
  );
  const mhStormwater = useMemo(
    () => photos.filter(p => String(p.type ?? '').toLowerCase() === 'stormwater' && p.joint === false).length,
    [photos],
  );

  // Aggregate length by type only (Table 3)
  const costRows3 = useMemo(() => {
    type AggRow3 = { type: string; count: number; totalLength: number };
    const agg: Record<string, AggRow3> = {};
    for (const p of photos) {
      const type   = String(p.type ?? '—');
      const length = Number(p.length ?? 0);
      if (!agg[type]) agg[type] = { type, count: 0, totalLength: 0 };
      agg[type].count       += 1;
      agg[type].totalLength += length;
    }
    return Object.values(agg).sort((a, b) => a.type.localeCompare(b.type));
  }, [photos]);

  // Aggregate length by track × type (Table 2)
  const costRows2 = useMemo(() => {
    type AggRow2 = { track: number; type: string; count: number; totalLength: number };
    const agg: Record<string, AggRow2> = {};
    for (const p of photos) {
      const track  = p.track ?? 0;
      const type   = String(p.type ?? '—');
      const length = Number(p.length ?? 0);
      const key = `${track}|${type}`;
      if (!agg[key]) agg[key] = { track, type, count: 0, totalLength: 0 };
      agg[key].count       += 1;
      agg[key].totalLength += length;
    }
    return Object.values(agg).sort(
      (a, b) => a.track - b.track || a.type.localeCompare(b.type),
    );
  }, [photos]);

  // Aggregate length by track × type × diameter (Table 1)
  const costRows = useMemo(() => {
    type AggRow = { track: number; type: string; diameter: number; count: number; totalLength: number };
    const agg: Record<string, AggRow> = {};
    for (const p of photos) {
      const track    = p.track    ?? 0;
      const type     = String(p.type     ?? '—');
      const diameter = p.diameter ?? 0;
      const length   = Number(p.length   ?? 0);
      const key = `${track}|${type}|${diameter}`;
      if (!agg[key]) agg[key] = { track, type, diameter, count: 0, totalLength: 0 };
      agg[key].count       += 1;
      agg[key].totalLength += length;
    }
    return Object.values(agg).sort(
      (a, b) => a.track - b.track || a.type.localeCompare(b.type) || a.diameter - b.diameter,
    );
  }, [photos]);

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
          mapId="aab5d655d42e65dc77f350e8"
          disableDefaultUI={false}
          gestureHandling="greedy"
          renderingType="VECTOR"
          tiltInteractionEnabled={true}
          headingInteractionEnabled={true}
          rotateControl={true}
          defaultTilt={0}
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
          <PhotoMarkers photos={photos} onPhotoClick={setSelectedPhoto} />
          {showComplaints && <ComplaintsMarkers onComplaintClick={setSelectedComplaint} />}
          {showPhotoLayer && <PhotoStaticMarkers onHover={setHoveredPhotoStatic} />}
        </Map>

        <DeckOverlay trips={trips} currentTime={animation.currentTime} extraLayers={layers01} />

        {selectedPhoto && (
          <PhotoPopup photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
        )}

        {selectedComplaint && (
          <ComplaintPopup properties={selectedComplaint} onClose={() => setSelectedComplaint(null)} />
        )}

        {/* Photo-static hover tooltip (fixed to viewport coords) */}
        {hoveredPhotoStatic && (() => {
          const name = hoveredPhotoStatic.props.Name as string | undefined;
          const imgSrc = name
            ? `https://washington-utilities-files.s3.us-east-2.amazonaws.com/field-photos/${name}.png`
            : null;
          return (
            <div
              className="photo-hover-tooltip"
              style={{ left: hoveredPhotoStatic.x + 14, top: hoveredPhotoStatic.y - 10 }}
            >
              {imgSrc && (
                <img src={imgSrc} alt={name} className="photo-hover-img" />
              )}
              {Object.entries(hoveredPhotoStatic.props)
                .filter(([k]) => !PHOTO_SKIP.has(k))
                .map(([k, v]) => (
                  <div key={k} className="photo-hover-row">
                    <span className="photo-hover-key">{k}</span>
                    <span className="photo-hover-val">{String(v ?? '')}</span>
                  </div>
                ))}
            </div>
          );
        })()}

        {/* Top-centre button group */}
        <div className="top-center-btns">
          {/* Layer toggle embedded in top bar */}
          <div className="layer-toggle-group">
            <button
              className={`top-center-btn ${showLayerPanel ? 'active' : ''}`}
              onClick={() => setShowLayerPanel(v => !v)}
              title="Toggle layers"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <rect x="1" y="3"  width="18" height="2.5" rx="1"/>
                <rect x="1" y="9"  width="18" height="2.5" rx="1"/>
                <rect x="1" y="15" width="18" height="2.5" rx="1"/>
              </svg>
              Layers
            </button>

            {showLayerPanel && (
              <div className="layer-panel">
                <label className="layer-panel-item">
                  <input
                    type="checkbox"
                    checked={showComplaints}
                    onChange={e => {
                      setShowComplaints(e.target.checked);
                      if (!e.target.checked) setSelectedComplaint(null);
                    }}
                  />
                  <span className="layer-panel-dot" style={{ background: '#50c878' }} />
                  <span className="layer-panel-dot" style={{ background: '#dc143c' }} />
                  Complaints
                </label>
                <label className="layer-panel-item">
                  <input
                    type="checkbox"
                    checked={showPhotoLayer}
                    onChange={e => {
                      setShowPhotoLayer(e.target.checked);
                      if (!e.target.checked) setHoveredPhotoStatic(null);
                    }}
                  />
                  <span className="layer-panel-dot" style={{ background: '#cc5500' }} />
                  Photo Layer
                </label>
              </div>
            )}
          </div>

          <button
            className={`top-center-btn ${showCostTracking ? 'active' : ''}`}
            onClick={() => setShowCostTracking(v => !v)}
          >
            💰 Cost Tracking
          </button>
          <button
            className={`top-center-btn ${showDailyReport ? 'active' : ''}`}
            onClick={() => setShowDailyReport(v => !v)}
          >
            📅 Daily Report
          </button>
        </div>

        {/* Cost Tracking modal */}
        {showCostTracking && (
          <div className="cost-tracking-overlay" onClick={() => setShowCostTracking(false)}>
            <div className="cost-tracking-modal" onClick={e => e.stopPropagation()}>
              <div className="cost-tracking-header">
                <span className="cost-tracking-title">Cost Tracking</span>
                <button className="cost-tracking-close" onClick={() => setShowCostTracking(false)}>✕</button>
              </div>
              <div className="cost-tracking-body">
                <p className="cost-table-label">Table 1 — Length by Track / Type / Diameter</p>
                <div className="cost-table-wrap">
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Track</th>
                        <th>Type</th>
                        <th>Diameter (in)</th>
                        <th>Count</th>
                        <th>Total Length (ft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costRows.map(row => (
                        <tr key={`${row.track}|${row.type}|${row.diameter}`}>
                          <td>{row.track}</td>
                          <td>{row.type}</td>
                          <td>{row.diameter}</td>
                          <td>{row.count}</td>
                          <td>{row.totalLength.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="cost-table-total-label">Total</td>
                        <td>{costRows.reduce((s, r) => s + r.count, 0)}</td>
                        <td>{costRows.reduce((s, r) => s + r.totalLength, 0).toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Table 2 */}
                <p className="cost-table-label" style={{ marginTop: '22px' }}>Table 2 — Length by Track / Type</p>
                <div className="cost-table-wrap">
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Track</th>
                        <th>Type</th>
                        <th>Count</th>
                        <th>Total Length (ft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costRows2.map(row => (
                        <tr key={`${row.track}|${row.type}`}>
                          <td>{row.track}</td>
                          <td>{row.type}</td>
                          <td>{row.count}</td>
                          <td>{row.totalLength.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="cost-table-total-label">Total</td>
                        <td>{costRows2.reduce((s, r) => s + r.count, 0)}</td>
                        <td>{costRows2.reduce((s, r) => s + r.totalLength, 0).toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Table 3 */}
                <p className="cost-table-label" style={{ marginTop: '22px' }}>Table 3 — Length by Type</p>
                <div className="cost-table-wrap">
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Count</th>
                        <th>Total Length (ft)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costRows3.map(row => (
                        <tr key={row.type}>
                          <td>{row.type}</td>
                          <td>{row.count}</td>
                          <td>{row.totalLength.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="cost-table-total-label">Total</td>
                        <td>{costRows3.reduce((s, r) => s + r.count, 0)}</td>
                        <td>{costRows3.reduce((s, r) => s + r.totalLength, 0).toFixed(1)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* MH counts */}
                <div className="cost-mh-counts">
                  <div className="cost-mh-row">
                    Number of MH in Wastewater System = <strong>{mhWastewater}</strong>
                  </div>
                  <div className="cost-mh-row">
                    Number of MH in Stormwater System = <strong>{mhStormwater}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Report modal */}
        {showDailyReport && (
          <div className="daily-overlay" onClick={() => { setShowDailyReport(false); setDailyLightbox(null); }}>
            <div className="daily-modal" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="daily-header">
                <span className="daily-title">📅 Daily Report</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="daily-download-btn"
                    onClick={downloadDailyPdf}
                    disabled={dailyRecords.length === 0}
                    title="Download PDF"
                  >
                    ⬇ Download
                  </button>
                  <button className="daily-close" onClick={() => { setShowDailyReport(false); setDailyLightbox(null); }}>✕</button>
                </div>
              </div>

              {/* Date picker */}
              <div className="daily-datepicker-row">
                <label className="daily-date-label" htmlFor="daily-date-input">Date</label>
                <input
                  id="daily-date-input"
                  type="date"
                  className="daily-date-input"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                />
                <span className="daily-record-count">
                  {dailyRecords.length} record{dailyRecords.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Records */}
              <div className="daily-body">
                {dailyRecords.length === 0 ? (
                  <div className="daily-empty">No records found for this date.</div>
                ) : (
                  dailyRecords.map(rec => {
                    const recPhotos: string[] = Array.isArray(rec.photos) ? rec.photos : [];
                    const attrRows: [string, string][] = [
                      ['Track',       String(rec.track       ?? '—')],
                      ['Type',        String(rec.type        ?? '—')],
                      ['Time',        String(rec.time        ?? '—')],
                      ['Diameter',    rec.diameter != null ? `${rec.diameter} in` : '—'],
                      ['Length',      rec.length   != null ? `${Number(rec.length).toFixed(1)} ft` : '—'],
                      ['Username',    String(rec.username    ?? '—')],
                      ['Description', String(rec.description ?? '—')],
                      ['Joint',       rec.joint != null ? (rec.joint ? 'Yes' : 'No') : '—'],
                      ['Lat / Lng',   `${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}`],
                    ].filter(([, v]) => v !== '—') as [string, string][];

                    return (
                      <div key={String(rec.id)} className="daily-record-card">
                        {/* Card header */}
                        <div className="daily-card-header">
                          <span className="daily-card-type">{rec.type ?? 'Record'}</span>
                          {rec.track != null && <span className="daily-card-tag">Track {rec.track}</span>}
                          {rec.time  && <span className="daily-card-tag">{rec.time}</span>}
                        </div>

                        {/* Attributes */}
                        <table className="daily-attr-table">
                          <tbody>
                            {attrRows.map(([k, v]) => (
                              <tr key={k}>
                                <td className="daily-attr-key">{k}</td>
                                <td className="daily-attr-val">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Photos */}
                        {recPhotos.length > 0 && (
                          <div className="daily-photo-strip">
                            {recPhotos.map((url, i) => (
                              <div
                                key={i}
                                className="daily-photo-wrap"
                                onClick={() => setDailyLightbox({ urls: recPhotos, idx: i })}
                              >
                                <StoragePhoto path={url} alt={`photo ${i + 1}`} className="daily-photo-thumb" />
                                <div className="daily-photo-overlay">🔍</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Daily Report lightbox */}
        {dailyLightbox && (
          <Lightbox
            urls={dailyLightbox.urls}
            startIndex={dailyLightbox.idx}
            onClose={() => setDailyLightbox(null)}
          />
        )}

        <button
          className={`sv-toggle-btn ${showStreetView ? 'active' : ''}`}
          onClick={handleStreetViewToggle}
          title={showStreetView ? 'Close Street View' : 'Open Street View'}
        >
          {showStreetView ? (
            /* Close ✕ */
            <svg viewBox="0 0 40 40" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
              <line x1="10" y1="10" x2="30" y2="30" stroke="#c0392b" strokeWidth="4" strokeLinecap="round"/>
              <line x1="30" y1="10" x2="10" y2="30" stroke="#c0392b" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          ) : (
            /* Taiji (Yin-Yang) symbol */
            <span style={{ fontSize: '34px', lineHeight: 1, display: 'block' }}>☯</span>
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
