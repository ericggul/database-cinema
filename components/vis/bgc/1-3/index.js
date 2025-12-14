import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, PerspectiveCamera, OrthographicCamera } from "@react-three/drei";
import { useControls, Leva, button, folder } from "leva";
import * as THREE from "three";

import { useSpring } from "@react-spring/three";

// --- Constants ---
const YEARS = Array.from({ length: 12 }, (_, i) => 1915 + (i * 10));
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// Generate Image List: Year x Hour (Month is fixed to 01)
const IMAGE_FILES = [];
for (let y = 0; y < 12; y++) {
  const year = YEARS[y];
  for (let h = 0; h < 12; h++) {
    const hour = h * 2;
    const hourStr = String(hour).padStart(2, "0");
    IMAGE_FILES.push(`${year}_01_${hourStr}.png`);
  }
}

const IMAGE_PATHS = IMAGE_FILES.map(f => `/generated-img/Jan_불광천/${f}`);

import { Container, Overlay, Title, Info } from "./styles";

// --- Atlas Generator ---
async function createAtlas(urls) {
  const count = urls.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  
  const cellSize = 512; 
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');
  
  const images = await Promise.all(
    urls.map(url => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn(`Failed to load ${url}`);
        resolve(null); 
      };
      img.src = url;
    }))
  );
  
  images.forEach((img, i) => {
    if (img) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.drawImage(img, col * cellSize, row * cellSize, cellSize, cellSize);
    }
  });
  
  return {
    canvas,
    cols,
    rows,
    total: count
  };
}

// --- Shader Material ---
const AtlasMaterial = {
  uniforms: {
    uAtlas: { value: null },
    uGridSize: { value: new THREE.Vector2(1, 1) } 
  },
  vertexShader: `
    attribute float aAtlasIndex;
    varying vec2 vUv;
    varying float vIndex;
    uniform vec2 uGridSize;
    
    void main() {
      vIndex = aAtlasIndex;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uAtlas;
    uniform vec2 uGridSize;
    varying vec2 vUv;
    varying float vIndex;
    
    void main() {
      float cols = uGridSize.x;
      float rows = uGridSize.y;
      
      float col = mod(vIndex, cols);
      float row = floor(vIndex / cols);
      
      vec2 cellUv = vUv / vec2(cols, rows);
      vec2 offset = vec2(col / cols, (rows - 1.0 - row) / rows);
      
      vec4 color = texture2D(uAtlas, cellUv + offset);
      gl_FragColor = color;
    }
  `
};

// --- Layout Calculation Helpers ---
const getOtherLayoutPositions = (type, count, N, spacing, cubeSize = 1, startHour = 0) => {
  const positions = new Float32Array(count * 3);
  let i = 0;

  // Calculate offset based on startHour (0-24 cycle)
  // We want a continuous flow, so we normalize startHour to 0-1 range
  const timeOffset = startHour / 24.0;

  for (let ix = 0; ix < N; ix++) {
    for (let iy = 0; iy < N; iy++) {
      for (let iz = 0; iz < N; iz++) {
        let x, y, z;
        
        // Normalized coordinates (0 to 1)
        const u0 = ix / (N - 1);
        const v0 = iy / (N - 1);
        
        // Apply time offset to w (Z-axis)
        // We use modulo 1.0 to wrap around for continuous flow
        let w0 = (iz / N + timeOffset) % 1.0;
        if (w0 < 0) w0 += 1.0;

        // Centered coordinates (-1 to 1)
        const uc = (ix / (N - 1)) * 2 - 1;
        const vc = (iy / (N - 1)) * 2 - 1;
        const wc = w0 * 2 - 1; // Map 0..1 to -1..1

        const scale = N * spacing * 0.5;

        switch (type) {
          case 'Sphere': {
            // Reverted to Fibonacci Sphere (Linear Layout)
            // For linear layouts, we can just shift the index 'i'
            // But 'i' is linear 0..count. 
            // Let's map 'w0' shift to a linear shift?
            // Actually, for Sphere/Cylinder/Scatter which ignore u,v,w loops:
            
            // We can add a "phase" shift to the generation logic
            const effectiveI = (i + (timeOffset * count)) % count;
            
            const phi = Math.acos(1 - 2 * (effectiveI + 0.5) / count);
            const theta = Math.PI * (1 + Math.sqrt(5)) * effectiveI;
            const r = N * spacing * 0.6; 
            
            x = r * Math.sin(phi) * Math.cos(theta);
            y = r * Math.sin(phi) * Math.sin(theta);
            z = r * Math.cos(phi);
            break;
          }

          case 'Cylinder': {
            // Reverted to Dynamic Cylinder Layout (Linear Layout)
            const effectiveI = (i + (timeOffset * count)) % count;

            const r = N * spacing * 0.4;
            const circumference = 2 * Math.PI * r;
            const itemWidth = cubeSize * 1.2; 
            const itemsPerTurn = circumference / itemWidth;
            const totalTurns = count / itemsPerTurn;
            const totalHeight = totalTurns * (cubeSize * 1.2);
            
            const theta = (effectiveI / count) * Math.PI * 2 * totalTurns;
            const h = (effectiveI / count) * totalHeight - (totalHeight / 2);
            
            x = r * Math.cos(theta);
            y = h;
            z = r * Math.sin(theta);
            break;
          }

          case 'Scatter': {
             // Deterministic random based on index
             // Shift index
             const effectiveI = Math.floor((i + (timeOffset * count)) % count);
             
             const seed = effectiveI * 123.45;
             const rand = (n) => Math.sin(seed * n) * 43758.5453 % 1;
             const range = N * spacing;
             
             x = (rand(1) - 0.5) * range * 2;
             y = (rand(2) - 0.5) * range * 2;
             z = (rand(3) - 0.5) * range * 2;
             break;
          }

          case 'Elliptic Cylinder': {
             // x = c cosh u cos v
             // y = c sinh u sin v
             // z = w
             const c = scale * 0.5;
             const u = u0 * 1.5 + 0.5; // range [0.5, 2.0]
             const v = v0 * Math.PI * 2;
             const w = wc * scale * 2;

             x = c * Math.cosh(u) * Math.cos(v);
             y = c * Math.sinh(u) * Math.sin(v);
             z = w;
             break;
          }

          case 'Parabolic Cylinder': {
             // x = 1/2 (u^2 - v^2)
             // y = uv
             // z = w
             const u = uc * Math.sqrt(scale * 2);
             const v = vc * Math.sqrt(scale * 2);
             const w = wc * scale * 2;

             x = 0.5 * (u*u - v*v);
             y = u * v;
             z = w;
             break;
          }

          case 'Paraboloidal': {
             // x = uv cos phi
             // y = uv sin phi
             // z = 1/2 (u^2 - v^2)
             const u = u0 * Math.sqrt(scale * 2);
             const v = v0 * Math.sqrt(scale * 2);
             const phi = w0 * Math.PI * 2;

             x = u * v * Math.cos(phi);
             y = u * v * Math.sin(phi);
             z = 0.5 * (u*u - v*v);
             break;
          }

          case 'Ellipsoidal': {
             // x = a rho sin theta cos phi
             // y = b rho sin theta sin phi
             // z = c rho cos theta
             // Using simple scaling of sphere
             const a = scale * 1.5;
             const b = scale * 1.0;
             const c = scale * 0.6;
             
             const theta = u0 * Math.PI;
             const phi = v0 * Math.PI * 2;
             const rho = 1 + (wc * 0.2); // Thickness

             x = a * rho * Math.sin(theta) * Math.cos(phi);
             y = b * rho * Math.sin(theta) * Math.sin(phi);
             z = c * rho * Math.cos(theta);
             break;
          }

          case 'Oblate Spheroidal': {
             // x = a cosh u cos v cos phi
             // y = a cosh u cos v sin phi
             // z = a sinh u sin v
             const a = scale;
             const u = u0 * 1.0 + 0.2;
             const v = vc * Math.PI / 2; // -PI/2 to PI/2
             const phi = w0 * Math.PI * 2;

             x = a * Math.cosh(u) * Math.cos(v) * Math.cos(phi);
             y = a * Math.cosh(u) * Math.cos(v) * Math.sin(phi);
             z = a * Math.sinh(u) * Math.sin(v);
             break;
          }

          case 'Prolate Spheroidal': {
             // x = a sinh u sin v cos phi
             // y = a sinh u sin v sin phi
             // z = a cosh u cos v
             const a = scale;
             const u = u0 * 1.0 + 0.2;
             const v = v0 * Math.PI;
             const phi = w0 * Math.PI * 2;

             x = a * Math.sinh(u) * Math.sin(v) * Math.cos(phi);
             y = a * Math.sinh(u) * Math.sin(v) * Math.sin(phi);
             z = a * Math.cosh(u) * Math.cos(v);
             break;
          }

          case 'Bispherical': {
             // x = (a sin v cos phi) / (cosh u - cos v)
             // y = (a sin v sin phi) / (cosh u - cos v)
             // z = (a sinh u) / (cosh u - cos v)
             const a = scale * 0.8;
             const u = uc * 2.0; // Avoid 0? cosh(0)=1. cos(0)=1. Denom 0.
             // Shift u slightly to avoid singularity at u=0, v=0
             const u_safe = (Math.abs(u) < 0.1 ? 0.1 : u); 
             const v = v0 * Math.PI * 0.9 + 0.05; // Avoid 0 and PI to keep denom safe?
             const phi = w0 * Math.PI * 2;
             
             const denom = Math.cosh(u_safe) - Math.cos(v);
             
             x = (a * Math.sin(v) * Math.cos(phi)) / denom;
             y = (a * Math.sin(v) * Math.sin(phi)) / denom;
             z = (a * Math.sinh(u_safe)) / denom;
             break;
          }

          case 'Conical': {
             // Improved Conical Layout to avoid overlap
             // Use discrete layers for 'w' (radius offset)
             // Map 'u' to height, 'v' to angle
             
             const h = uc * scale * 2; // Height from -scale to +scale
             const baseR = (1.0 - Math.abs(uc)) * scale * 1.5; // Radius at this height
             
             // Discrete layer offset based on 'w' (iz)
             // We push items out by 'cubeSize' + padding for each layer
             // Use w0 (normalized 0-1) for continuous offset
             const layerOffset = w0 * N * (cubeSize * 1.5); 
             
             const r = baseR + layerOffset; 
             const theta = v0 * Math.PI * 2;

             x = r * Math.cos(theta);
             y = h;
             z = r * Math.sin(theta);
             break;
          }
          
          default: // Cube
             const offset = (N - 1) * spacing / 2;
             // Apply z-shift for Cube
             const z_shifted = (w0 * (N-1) * spacing) - offset;
             
             x = (ix * spacing) - offset;
             y = (iy * spacing) - offset;
             z = z_shifted;
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        i++;
      }
    }
  }
  
  return positions;
};

// --- Constants ---
const MAX_N = 24;
const MAX_COUNT = MAX_N * MAX_N * MAX_N;

function AtlasCubeGrid({ onHover, onClick, config }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  const { N, spacing, cubeSize, layout } = config;
  const startHour = 12; // Hardcoded to prevent floating-point flickering
  const count = N * N * N;

  // Debug Log: Mount/Unmount
  useEffect(() => {
      console.log(`[AtlasCubeGrid] MOUNTED`);
      return () => console.log(`[AtlasCubeGrid] UNMOUNTED`);
  }, []);

  // --- Atlas Generation ---
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);

  // 1a. Index Array (Texture Mapping)
  // Depends only on N and startHour. Stable when spacing changes.
  const indexArray = useMemo(() => {
    console.log(`[AtlasCubeGrid] Recalculating IndexArray for N=${N}, startHour=${startHour}`);
    const idx = new Float32Array(MAX_COUNT);
    let i = 0;
    
    const startHourIdx = Math.floor(startHour / 2);

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
           const yearIdx = x % 12;
           const hourIdx = (z + startHourIdx) % 12;
           idx[i] = (yearIdx * 12) + hourIdx;
           i++;
        }
      }
    }
    return idx;
  }, [N, startHour]);

  // 1b. Canonical Cube Positions (Start Positions)
  // Depends on N and spacing.
  const cubePositions = useMemo(() => {
    // console.log(`[AtlasCubeGrid] Recalculating CubePositions for N=${N}, Spacing=${spacing}`);
    const pos = new Float32Array(MAX_COUNT * 3);
    let i = 0;
    const offset = (N - 1) * spacing / 2;

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
           pos[i*3] = (x * spacing) - offset;
           pos[i*3+1] = (y * spacing) - offset;
           pos[i*3+2] = (z * spacing) - offset;
           i++;
        }
      }
    }
    return pos;
  }, [N, spacing]);

  // 2. Determine Target Positions
  const targetPositions = useMemo(() => {
    // We need to ensure getOtherLayoutPositions returns MAX sized array or we map it
    // Let's modify getOtherLayoutPositions to return MAX sized array or just fill ours
    const positions = new Float32Array(MAX_COUNT * 3);
    const calculated = getOtherLayoutPositions(layout, count, N, spacing, cubeSize, startHour);
    positions.set(calculated); // Copy valid data
    return positions;
  }, [layout, N, spacing, count, cubeSize, startHour]);

  // 3. State for Animation
  const currentPositions = useRef(null);
  const startPositions = useRef(null);

  // Initialize immediately to avoid 0,0,0 flash
  if (!currentPositions.current) {
    currentPositions.current = new Float32Array(MAX_COUNT * 3);
    startPositions.current = new Float32Array(MAX_COUNT * 3);
    // Initialize with target positions
    currentPositions.current.set(targetPositions);
    startPositions.current.set(targetPositions);
  }

  // Spring for transition
  const [{ t, smoothSize }, api] = useSpring(() => ({
    t: 1,
    smoothSize: cubeSize,
    config: { mass: 1, tension: 120, friction: 20 },
  }));

  // Debug Log: Prop Changes (Moved here to access api)
  const prevDeps = useRef({ N, startHour, layout, api });
  useEffect(() => {
      if (prevDeps.current.N !== N) console.log(`[AtlasCubeGrid] N changed: ${prevDeps.current.N} -> ${N}`);
      if (prevDeps.current.startHour !== startHour) console.log(`[AtlasCubeGrid] startHour changed: ${prevDeps.current.startHour} -> ${startHour}`);
      if (prevDeps.current.layout !== layout) console.log(`[AtlasCubeGrid] layout changed: ${prevDeps.current.layout} -> ${layout}`);
      if (prevDeps.current.api !== api) console.log(`[AtlasCubeGrid] api changed (ref mismatch)`);
      
      prevDeps.current = { N, startHour, layout, api };
  });

  // Update smoothSize when cubeSize changes
  useEffect(() => {
    api.start({ smoothSize: cubeSize });
  }, [cubeSize, api]);

  // Capture start positions when layout changes
  // CRITICAL FIX: Only trigger on LAYOUT change. 
  // Spacing/N changes should not reset the spring, they should just update targetPositions.
  useEffect(() => {
    console.log(`[AtlasCubeGrid] Layout Effect Triggered. Layout=${layout}`);
    if (currentPositions.current) {
        startPositions.current.set(currentPositions.current);
        // Reset animation
        api.start({ t: 1, from: { t: 0 }, reset: true });
    }
  }, [layout, api]); // Removed N and spacing from dependencies 

  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !atlas) return;
    
    // Update count dynamically
    if (meshRef.current.count !== count) {
        console.log(`[AtlasCubeGrid] Updating Mesh Count: ${meshRef.current.count} -> ${count}`);
        meshRef.current.count = count;
    }

    const progress = t.get();
    const currentSize = smoothSize.get();
    
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      // Interpolate
      const x = THREE.MathUtils.lerp(startPositions.current[ix], targetPositions[ix], progress);
      const y = THREE.MathUtils.lerp(startPositions.current[iy], targetPositions[iy], progress);
      const z = THREE.MathUtils.lerp(startPositions.current[iz], targetPositions[iz], progress);

      // Update current positions ref for next start point
      currentPositions.current[ix] = x;
      currentPositions.current[iy] = y;
      currentPositions.current[iz] = z;

      tempObject.position.set(x, y, z);
      tempObject.scale.set(currentSize, currentSize, currentSize);
      
      if (layout === 'Sphere' || layout === 'Cylinder' || layout === 'Helix') {
         tempObject.lookAt(0, 0, 0);
      } else {
         tempObject.rotation.set(0, 0, 0);
      }

      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  // Initial Attribute Setup & Update
  React.useLayoutEffect(() => {
    if (meshRef.current) {
      // If attribute doesn't exist or we need to update it
      if (!meshRef.current.geometry.attributes.aAtlasIndex) {
          console.log("[AtlasCubeGrid] Creating aAtlasIndex Attribute");
          meshRef.current.geometry.setAttribute(
            'aAtlasIndex',
            new THREE.InstancedBufferAttribute(new Float32Array(MAX_COUNT), 1)
          );
      }
      
      // Update data
      console.log(`[AtlasCubeGrid] Updating aAtlasIndex data for N=${N}`);
      const attr = meshRef.current.geometry.attributes.aAtlasIndex;
      attr.array.set(indexArray); // indexArray is MAX_COUNT size
      attr.needsUpdate = true;
    }
  }, [indexArray, atlas]);

  if (!atlas) return <Html center>Generating Atlas...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, MAX_COUNT]} // Fixed MAX count to prevent unmount
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id >= count) return; // Ignore hidden instances
        
        // Reverse engineer indices
        const z = id % N;
        const y = Math.floor((id / N)) % N;
        const x = Math.floor(id / (N * N));
        
        const yearIdx = x % 12;
        
        // Apply time slicing offset for metadata
        const startHourIdx = startHour / 2;
        const hourIdx = (z + startHourIdx) % 12;
        const textureIndex = (yearIdx * 12) + hourIdx;
        
        onHover({
          year: YEARS[yearIdx],
          month: MONTHS[y % 12],
          hour: HOURS[hourIdx],
          id: id,
          textureIndex: textureIndex,
          gridPos: { x, y, z }
        });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id >= count) return;

        const z = id % N;
        const y = Math.floor((id / N)) % N;
        const x = Math.floor(id / (N * N));
        
        const yearIdx = x % 12;
        
        // Apply time slicing offset for metadata
        const startHourIdx = startHour / 2;
        const hourIdx = (z + startHourIdx) % 12;
        
        onClick({
          year: YEARS[yearIdx],
          month: MONTHS[y % 12],
          hour: HOURS[hourIdx],
          id: id,
          gridPos: { x, y, z }
        });
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        uniforms={{
          uAtlas: { value: atlas.texture },
          uGridSize: { value: new THREE.Vector2(atlas.cols, atlas.rows) }
        }}
        vertexShader={AtlasMaterial.vertexShader}
        fragmentShader={AtlasMaterial.fragmentShader}
        side={THREE.FrontSide}
      />
    </instancedMesh>
  );
}

import keyframes from "./keyframes2.json";

// --- Animation Controller ---
function AnimationController({ isPlaying, time, setConfig, setCamera }) {
  const { camera } = useThree();
  
  // Reusable vectors to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);
  const vecC = useMemo(() => new THREE.Vector3(), []);
  
  useFrame(() => {
    if (!isPlaying) return;

    // Find current keyframe segment
    const totalDuration = keyframes[keyframes.length - 1].time;
    const currentTime = time.current;
    
    if (currentTime >= totalDuration) {
      // Loop or stop? For now, let's clamp
      return;
    }

    // Find indices
    let startIdx = 0;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (currentTime >= keyframes[i].time && currentTime < keyframes[i+1].time) {
        startIdx = i;
        break;
      }
    }
    const endIdx = startIdx + 1;
    
    const startFrame = keyframes[startIdx];
    const endFrame = keyframes[endIdx];
    
    const duration = endFrame.time - startFrame.time;
    const progress = (currentTime - startFrame.time) / (endFrame.time - startFrame.time);
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1); // Simple ease-in-out

    // Snappy CubeSize Transition (0.5s duration)
    // "찰지게 확 커지게" -> Use BackOut easing for a pop effect
    const cubeDuration = 0.5;
    const cubeRawProgress = Math.min(1, (currentTime - startFrame.time) / cubeDuration);
    // Custom BackOut: c1 = 1.70158; return 1 + c1 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    // Or just use a simple power ease for speed
    const cubeEased = 1 - Math.pow(1 - cubeRawProgress, 3); // Cubic Out
    
    // Interpolate Camera
    // Spherical interpolation for smooth orbit
    const startSph = startFrame.camera.spherical;
    const endSph = endFrame.camera.spherical;
    
    const r = THREE.MathUtils.lerp(startSph.radius, endSph.radius, easedProgress);
    const thetaDeg = THREE.MathUtils.lerp(startSph.theta, endSph.theta, easedProgress);
    const phiDeg = THREE.MathUtils.lerp(startSph.phi, endSph.phi, easedProgress);
    
    // Convert to Cartesian
    // THREE.Spherical: radius, phi (polar), theta (equator) -> expects Radians
    const phiRad = THREE.MathUtils.degToRad(phiDeg);
    const thetaRad = THREE.MathUtils.degToRad(thetaDeg);
    
    const sph = new THREE.Spherical(r, phiRad, thetaRad);
    const pos = new THREE.Vector3().setFromSpherical(sph);
    camera.position.copy(pos);
    
    // Target is fixed at 0,0,0
    camera.lookAt(0, 0, 0);

    // Interpolate Config
    // N is DISCRETE - use start frame value, no morphing
    const N = startFrame.config.N;
    const spacing = THREE.MathUtils.lerp(startFrame.config.spacing, endFrame.config.spacing, easedProgress);
    
    // Use snappy progress for cubeSize ONLY if it changes
    let cubeSize;
    if (Math.abs(startFrame.config.cubeSize - endFrame.config.cubeSize) < 0.001) {
        cubeSize = startFrame.config.cubeSize;
    } else {
        cubeSize = THREE.MathUtils.lerp(startFrame.config.cubeSize, endFrame.config.cubeSize, cubeEased);
    }

    setConfig({
      layout: startFrame.config.layout, // Discrete
      N: N, // Discrete (no interpolation)
      spacing,
      cubeSize,
      startHour: 12 // Hardcoded
    });
  });

  return null;
}

// --- Recorder Hook ---
function useRecorder(onStart, onStop) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = (canvas) => {
    if (!canvas) return;
    
    if (onStart) onStart();

    // 30 FPS for stability, 25 Mbps for high quality
    const stream = canvas.captureStream(30); 
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 25000000 
    });

    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_interactive_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      if (onStop) onStop();
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return { recording, startRecording, stopRecording };
}


// --- Camera Helper ---
function CameraHelper({ controlsRef, onUpdate, jumpTarget }) {
  const { camera } = useThree();
  const isUpdatingLeva = useRef(false);
  const lastState = useRef({ radius: 0, theta: 0, phi: 0, target: [0,0,0] });

  // Handle Jump
  useEffect(() => {
    if (jumpTarget && controlsRef.current) {
        const kf = jumpTarget;
        const target = new THREE.Vector3(0, 0, 0); // Fixed target
        controlsRef.current.target.copy(target);
        
        const sphDeg = kf.camera.spherical;
        const phiRad = THREE.MathUtils.degToRad(sphDeg.phi);
        const thetaRad = THREE.MathUtils.degToRad(sphDeg.theta);
        
        const sph = new THREE.Spherical(sphDeg.radius, phiRad, thetaRad);
        const offset = new THREE.Vector3().setFromSpherical(sph);
        
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        controlsRef.current.update();
    }
  }, [jumpTarget, camera, controlsRef]);

  const [, set] = useControls("Camera State", () => ({
    // ... (existing controls)
    radius: { 
      value: 60, 
      min: 10, max: 200, step: 1,
      onChange: (v) => {
        if (!isUpdatingLeva.current && controlsRef.current) {
           const target = controlsRef.current.target;
           // Calculate offset from target
           const offset = camera.position.clone().sub(target);
           const sph = new THREE.Spherical().setFromVector3(offset);
           
           sph.radius = v;
           
           // Apply back
           offset.setFromSpherical(sph);
           camera.position.copy(target).add(offset);
           camera.lookAt(target);
           controlsRef.current.update();
        }
      }
    },
    theta: { 
      value: 0, 
      min: 0, max: 360, step: 1,
      label: "Theta (Deg)",
      onChange: (v) => {
        if (!isUpdatingLeva.current && controlsRef.current) {
           const target = controlsRef.current.target;
           const offset = camera.position.clone().sub(target);
           const sph = new THREE.Spherical().setFromVector3(offset);
           
           sph.theta = THREE.MathUtils.degToRad(v);
           // Clamp phi
           sph.phi = Math.max(0.01, Math.min(Math.PI - 0.01, sph.phi));
           
           offset.setFromSpherical(sph);
           camera.position.copy(target).add(offset);
           camera.lookAt(target);
           controlsRef.current.update();
        }
      }
    },
    phi: { 
      value: 90, 
      min: 1, max: 179, step: 1,
      label: "Phi (Deg)",
      onChange: (v) => {
        if (!isUpdatingLeva.current && controlsRef.current) {
           const target = controlsRef.current.target;
           const offset = camera.position.clone().sub(target);
           const sph = new THREE.Spherical().setFromVector3(offset);
           
           sph.phi = THREE.MathUtils.degToRad(v);
           
           offset.setFromSpherical(sph);
           camera.position.copy(target).add(offset);
           camera.lookAt(target);
           controlsRef.current.update();
        }
      }
    },
    target: { 
      value: [0, 0, 0], 
      step: 0.1,
      onChange: (v) => {
        if (!isUpdatingLeva.current && controlsRef.current) {
          controlsRef.current.target.set(...v);
          controlsRef.current.update();
        }
      }
    },
    "Log State": button(() => {
        const target = controlsRef.current ? controlsRef.current.target : new THREE.Vector3();
        const offset = camera.position.clone().sub(target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        
        const state = {
            time: 0, 
            camera: {
                spherical: {
                    radius: Number(sph.radius.toFixed(2)),
                    theta: Number(THREE.MathUtils.radToDeg(sph.theta).toFixed(1)),
                    phi: Number(THREE.MathUtils.radToDeg(sph.phi).toFixed(1))
                },
                target: target.toArray().map(v => Number(v.toFixed(2)))
            },
            config: {}
        };
        console.log("Keyframe Data:", JSON.stringify(state, null, 2));
        alert("Camera state logged to console!");
    })
  }));

  useFrame(() => {
    if (controlsRef.current) {
        const target = controlsRef.current.target;
        const offset = camera.position.clone().sub(target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        const currentTarget = target.toArray();
        
        // Convert to degrees
        const thetaDeg = THREE.MathUtils.radToDeg(sph.theta);
        const phiDeg = THREE.MathUtils.radToDeg(sph.phi);
        
        // Check change
        const rDiff = Math.abs(sph.radius - lastState.current.radius);
        const tDiff = Math.abs(thetaDeg - lastState.current.theta);
        const pDiff = Math.abs(phiDeg - lastState.current.phi);
        const targetChanged = currentTarget.some((v, i) => Math.abs(v - lastState.current.target[i]) > 0.01);

        if (rDiff > 0.05 || tDiff > 0.05 || pDiff > 0.05 || targetChanged) {
            isUpdatingLeva.current = true;
            set({
                radius: sph.radius,
                theta: thetaDeg,
                phi: phiDeg,
                target: currentTarget
            });
            isUpdatingLeva.current = false;
            
            lastState.current = { radius: sph.radius, theta: thetaDeg, phi: phiDeg, target: currentTarget };
            
            if (onUpdate) onUpdate({ 
                radius: sph.radius, 
                theta: thetaDeg, 
                phi: phiDeg, 
                target: currentTarget 
            });
        }
    }
  });

  return null;
}

export default function VisInteractive() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [recordMode, setRecordMode] = useState(false);
  const [cameraState, setCameraState] = useState(null);
  
  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTime = useRef(0);
  const requestRef = useRef();
  const startTimeRef = useRef();
  
  const controlsRef = useRef();

  // --- Leva Controls ---
  // We use set to programmatically update Leva controls
  // --- Leva Controls ---
  // We use set to programmatically update Leva controls
  const [config, setConfig] = useControls(() => ({
    layout: { 
      options: [
        'Cube', 'Sphere', 'Cylinder', 'Scatter',
        'Elliptic Cylinder', 'Parabolic Cylinder', 'Paraboloidal', 
        'Ellipsoidal', 'Oblate Spheroidal', 'Prolate Spheroidal', 
        'Bispherical', 'Conical'
      ], 
      value: 'Cube' 
    },
    N: { value: 24, min: 1, max: 24, step: 1, label: "Grid Size (N)" },
    spacing: { value: 3, min: 0.1, max: 5.0, step: 0.1 },
    cubeSize: { value: 1.0, min: 0.1, max: 4.0, step: 0.1 },
    startHour: { value: 12, min: 0, max: 24, step: 0.1, label: "Start Hour" }, // Changed to slider for fluid animation
    
    "Test Animation": button(() => {
       startAnimation();
    }),
    
    "Jump to Keyframe": folder(
      keyframes.reduce((acc, kf, idx) => {
        acc[`${kf.time}s (${kf.config.layout})`] = button(() => {
           // Stop animation if running
           stopAnimation();
           animationTime.current = kf.time;
           
           // Set Config
           setConfig({
             layout: kf.config.layout,
             N: kf.config.N,
             spacing: kf.config.spacing,
             cubeSize: kf.config.cubeSize,
             startHour: kf.config.startHour
           });
           
           // Set Camera
           if (controlsRef.current) {
             const target = new THREE.Vector3(0, 0, 0); // Fixed target
             controlsRef.current.target.copy(target);
             
             const sphDeg = kf.camera.spherical;
             const phiRad = THREE.MathUtils.degToRad(sphDeg.phi);
             const thetaRad = THREE.MathUtils.degToRad(sphDeg.theta);
             
             const sph = new THREE.Spherical(sphDeg.radius, phiRad, thetaRad);
             const offset = new THREE.Vector3().setFromSpherical(sph);
             
             // Camera pos = target + offset
             // Access camera from canvas context? No, we are outside Canvas here.
             // We need to pass a ref or use a helper. 
             // Actually, we can't easily access 'camera' here because VisInteractive is outside Canvas.
             // Wait, VisInteractive renders Canvas. We need to pass this action DOWN to a component inside Canvas 
             // OR use a state that a component inside Canvas reacts to.
             
             // Let's use a simple event bus or ref pattern.
             // We can expose a "jumpTo" state.
             setJumpTarget(kf);
           }
        });
        return acc;
      }, {}),
      { collapsed: true }
    )
  }));

  const [jumpTarget, setJumpTarget] = useState(null);

  // ... (rest of startAnimation, etc)
  
  const startAnimation = () => {
    setIsAnimating(true);
    animationTime.current = 0;
    startTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    cancelAnimationFrame(requestRef.current);
  };

  const animate = (time) => {
    const elapsed = (time - startTimeRef.current) / 1000; // seconds
    animationTime.current = elapsed;
    
    if (elapsed < 55) { // 55s duration
      requestRef.current = requestAnimationFrame(animate);
    } else {
      stopAnimation();
      if (recording) stopRecording(); // Auto stop recording if running
    }
  };

  const { recording, startRecording, stopRecording } = useRecorder(
    () => startAnimation(), // onStart
    () => stopAnimation()   // onStop
  );

  const activeItem = hovered || selected;

  return (
    <Container>
      <Leva collapsed={false} /> 
      
      <div style={{
        width: recordMode ? '3000px' : '100vw',
        height: recordMode ? '432px' : '100vh',
        // Center the wide container
        position: recordMode ? 'absolute' : 'relative',
        left: recordMode ? '50%' : 'auto',
        transform: recordMode ? 'translateX(-50%)' : 'none',
        
        border: recordMode ? '2px solid red' : 'none',
        transition: 'all 0.3s ease',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 0 // Ensure it's behind overlay
      }}>
        <Canvas 
          dpr={recordMode ? 1 : 2} // Reduce DPR during recording to prevent stuttering
          gl={{ preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            window._canvas = gl.domElement;
          }}
        >
          <color attach="background" args={['#111']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={50} />

          <AnimationController 
            isPlaying={isAnimating} 
            time={animationTime} 
            setConfig={setConfig} 
          />
          
          <CameraHelper controlsRef={controlsRef} onUpdate={setCameraState} jumpTarget={jumpTarget} />

          <AtlasCubeGrid 
            onHover={setHovered} 
            onClick={setSelected} 
            config={config}
          />
          
          <OrbitControls ref={controlsRef} enabled={!isAnimating} enableDamping target={[0, 0, 0]} />
        </Canvas>
      </div>

      <Overlay>
        <Title>Interactive Grid (Jan Bulgwangcheon)</Title>
        <Info>
          Grid: {config.N} x {config.N} x {config.N}<br/>
          Total: {config.N ** 3}<br/>
          Layout: {config.layout}<br/>
          <br/>
          {cameraState ? (
            <>
              <strong>R:</strong> {cameraState.radius.toFixed(1)}<br/>
              <strong>Theta:</strong> {cameraState.theta.toFixed(2)}<br/>
              <strong>Phi:</strong> {cameraState.phi.toFixed(2)}<br/>
              <strong>Target:</strong> [{cameraState.target.map(v => v.toFixed(2)).join(', ')}]
            </>
          ) : (
            "Move camera to see coords"
          )}
        </Info>
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto' }}>
          <button 
            onClick={() => {
              if (recordMode && recording) {
                stopRecording();
              }
              setRecordMode(!recordMode);
            }}
            style={{ padding: '8px', cursor: 'pointer' }}
          >
            {recordMode ? "Exit Record Mode" : "Enter Record Mode (3000x432)"}
          </button>
          
          {recordMode && (
            <button 
              onClick={() => {
                if (recording) stopRecording();
                else startRecording(window._canvas);
              }}
              style={{ 
                padding: '8px', 
                cursor: 'pointer',
                background: recording ? 'red' : 'white',
                color: recording ? 'white' : 'black'
              }}
            >
              {recording ? "Stop Recording" : "Start Recording (Auto Animation)"}
            </button>
          )}
        </div>
      </Overlay>
    </Container>
  );
}
