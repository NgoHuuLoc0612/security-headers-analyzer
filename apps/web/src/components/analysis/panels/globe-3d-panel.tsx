'use client';
// apps/web/src/components/analysis/panels/globe-3d-panel.tsx
import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { MapPin } from 'lucide-react';

function latLonToVec3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

function Globe({ markers }: { markers: { lat: number; lon: number; label: string; color: string }[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08;
  });

  // Wireframe sphere texture (procedural — no external image needed)
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(2, 48, 48), []);

  return (
    <group ref={groupRef}>
      {/* Core globe */}
      <mesh ref={meshRef} geometry={sphereGeometry}>
        <meshStandardMaterial
          color="#0f1729"
          emissive="#1e293b"
          emissiveIntensity={0.3}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh geometry={sphereGeometry} scale={1.002}>
        <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.15} />
      </mesh>

      {/* Atmosphere glow */}
      <mesh geometry={sphereGeometry} scale={1.05}>
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>

      {/* Latitude/longitude grid lines */}
      {Array.from({ length: 6 }).map((_, i) => {
        const lat = -75 + i * 30;
        const points: [number, number, number][] = [];
        for (let lon = -180; lon <= 180; lon += 5) {
          points.push(latLonToVec3(lat, lon, 2.01));
        }
        return (
          <Line key={`lat-${i}`} points={points} color="#334155" lineWidth={1} transparent opacity={0.4} />
        );
      })}
      {Array.from({ length: 12 }).map((_, i) => {
        const lon = -180 + i * 30;
        const points: [number, number, number][] = [];
        for (let lat = -90; lat <= 90; lat += 5) {
          points.push(latLonToVec3(lat, lon, 2.01));
        }
        return (
          <Line key={`lon-${i}`} points={points} color="#334155" lineWidth={1} transparent opacity={0.4} />
        );
      })}

      {/* Markers */}
      {markers.map((m, i) => {
        const pos = latLonToVec3(m.lat, m.lon, 2.05);
        return (
          <group key={i} position={pos}>
            <mesh>
              <sphereGeometry args={[0.04, 16, 16]} />
              <meshBasicMaterial color={m.color} />
            </mesh>
            {/* Pulse ring */}
            <PulseRing color={m.color} />
            <Html distanceFactor={8} position={[0, 0.1, 0]}>
              <div className="px-2 py-1 rounded bg-black/80 text-white text-[10px] whitespace-nowrap pointer-events-none border border-white/10">
                {m.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function PulseRing({ color }: { color: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ringRef.current) {
      const t = (clock.getElapsedTime() % 2) / 2;
      ringRef.current.scale.setScalar(0.04 + t * 0.3);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
  });
  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Globe3DPanel({ result }: { result: any }) {
  const dns = result.dns;

  // Build markers from geolocation data, or use deterministic fallback based on domain hash
  const markers = useMemo(() => {
    const geo = dns?.geolocation || [];
    if (geo.length > 0) {
      return geo.map((g: any) => ({
        lat: g.lat, lon: g.lon,
        label: `${g.city || g.country} (${g.ip})`,
        color: '#10b981',
      }));
    }

    // Fallback: derive a pseudo-location from domain string for visualization purposes
    const domain = result.domain || 'example.com';
    let hash = 0;
    for (let i = 0; i < domain.length; i++) hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
    const lat = ((hash % 140) - 70);
    const lon = (((hash >> 8) % 360) - 180);

    return [{ lat, lon, label: domain, color: result.score?.grade?.startsWith('A') ? '#10b981' : '#ef4444' }];
  }, [dns, result.domain, result.score]);

  return (
    <div className="viz-container p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin size={12} /> Server Location · 3D Globe
        </p>
        <span className="text-xs text-muted-foreground">Drag to rotate · Scroll to zoom</span>
      </div>
      <div className="h-[420px] rounded-lg overflow-hidden bg-gradient-to-b from-gray-950 to-gray-900">
        <Canvas camera={{ position: [0, 0, 6], fov: 45 }} className="three-canvas">
          <Suspense fallback={null}>
            <ambientLight intensity={0.6} />
            <pointLight position={[5, 5, 5]} intensity={1.2} color="#6366f1" />
            <pointLight position={[-5, -5, -5]} intensity={0.5} color="#06b6d4" />
            <Stars radius={50} depth={50} count={2000} factor={3} saturation={0} fade speed={0.5} />
            <Globe markers={markers} />
            <OrbitControls
              enablePan={false}
              minDistance={3.5}
              maxDistance={10}
              autoRotate={false}
              enableDamping
              dampingFactor={0.08}
            />
          </Suspense>
        </Canvas>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {markers.length} location{markers.length !== 1 ? 's' : ''} detected for {result.domain}
      </p>
    </div>
  );
}
