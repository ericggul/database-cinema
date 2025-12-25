import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, PerspectiveCamera, OrthographicCamera } from "@react-three/drei";
import { useControls, Leva, button, folder } from "leva";
import * as THREE from "three";

import { useSpring } from "@react-spring/three";

// --- Constants ---
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// Generate Image List: Month x Hour (Year fixed to 2025)
const IMAGE_FILES = [];
for (let m = 0; m < 12; m++) {
  const month = String(m + 1).padStart(2, "0");
  for (let h = 0; h < 12; h++) {
    const hour = h * 2;
    const hourStr = String(hour).padStart(2, "0");
    IMAGE_FILES.push(`2025_${month}_${hourStr}.png`);
  }
}

const IMAGE_PATHS = IMAGE_FILES.map(f => `/generated-img/Shibuya/${f}`);

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
             const rho = 1 + (wc * 0.2) + (((ix * 13 + iy * 17 + iz * 19) % 100) * 0.002); // Thickness + Jitter to avoid z-fighting

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

function AtlasCubeGrid({ onHover, onClick, config, animationConfigRef, timeRef, recordingTime, isRecording }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  const { N, layout } = config; // spacing and cubeSize read from ref
  const startHour = 12; // Hardcoded to prevent floating-point flickering
  const count = N * N * N;

  // --- Atlas Generation ---
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);

  // 1a. Index Array (Texture Mapping)
  // Depends only on N. Stable during animation.
  const indexArray = useMemo(() => {
    const idx = new Float32Array(MAX_COUNT);
    let i = 0;
    
    const startHourIdx = Math.floor(startHour / 2);

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
           const monthIdx = x % 12;
           const hourIdx = (z + startHourIdx) % 12;
           idx[i] = (monthIdx * 12) + hourIdx;
           i++;
        }
      }
    }
    return idx;
  }, [N, startHour]);

  // 2. Target Positions (UNIT SPACE - spacing applied in useFrame)
  // Only depends on layout and N. NEVER recalculates during spacing/cubeSize interpolation.
  const targetPositions = useMemo(() => {
    const positions = new Float32Array(MAX_COUNT * 3);
    // Use spacing=1 for unit positions, actual spacing applied at render time
    const calculated = getOtherLayoutPositions(layout, count, N, 1.0, 1.0, startHour);
    positions.set(calculated);
    return positions;
  }, [layout, N, count, startHour]);

  // 3. State for Animation
  const currentPositions = useRef(null);
  const startPositions = useRef(null);
  
  // Transition State
  const lastLayout = useRef(layout);
  const layoutStartTime = useRef(0);
  
  // Dynamic Transition Duration based on segment length
  // Default to 1.5s, but cap at segmentDuration if provided
  // Special case: Horizontal V2 requires 0.5s transition
  const isHorizontalV2 = config.targetScreen === "Horizontal V2";
  const baseDuration = isHorizontalV2 ? 1.5 : 1.5;
  const segmentDuration = config.segmentDuration || baseDuration;
  const TRANSITION_DURATION = Math.min(baseDuration, segmentDuration); 

  // Initialize immediately to avoid 0,0,0 flash
  if (!currentPositions.current) {
    currentPositions.current = new Float32Array(MAX_COUNT * 3);
    startPositions.current = new Float32Array(MAX_COUNT * 3);
    // Initialize with target positions
    currentPositions.current.set(targetPositions);
    startPositions.current.set(targetPositions);
  }

  // Detect Layout Change and Trigger Transition
  // We use a ref to track change, but we need to update startPositions immediately
  if (layout !== lastLayout.current) {
      const currentTime = isRecording ? recordingTime : (timeRef?.current || 0);

      // Snap immediately if at time 0 (Initial Load / Reset)
      if (currentTime === 0 && currentPositions.current) {
          currentPositions.current.set(targetPositions);
          startPositions.current.set(targetPositions);
      } 
      // Normal Transition
      else if (currentPositions.current) {
          startPositions.current.set(currentPositions.current);
      }
      
      // Set start time
      layoutStartTime.current = currentTime;
      
      lastLayout.current = layout;
  } 

  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !atlas) return;
    
    // Update count dynamically
    if (meshRef.current.count !== count) {
        meshRef.current.count = count;
    }

    // Calculate Deterministic Progress
    const currentTime = isRecording ? recordingTime : (timeRef?.current || 0);
    const elapsed = currentTime - layoutStartTime.current;
    
    // If elapsed < 0 (e.g. looped), reset? 
    // For now assume linear forward time.
    
    let progress = Math.min(1, Math.max(0, elapsed / TRANSITION_DURATION));
    
    // Easing
    // Spring-like easing: 1 - (1-t)^3 (Cubic Out) or BackOut
    // Using SmoothStep for now as requested "smooth"
    // Or ElasticOut?
    // Let's use Cubic Out for a snappy but smooth feel
    // progress = 1 - Math.pow(1 - progress, 3);
    
    // Actually, user wants "smoothly transition... originally longer".
    // SmoothStep is safe.
    progress = THREE.MathUtils.smoothstep(progress, 0, 1);
    
    // Read from ref for smooth animation without React re-renders
    const currentSize = animationConfigRef.current ? animationConfigRef.current.cubeSize : 1.0;
    const currentSpacing = animationConfigRef.current ? animationConfigRef.current.spacing : 3.0;
    
    const instanceMatrix = meshRef.current.instanceMatrix;
    const array = instanceMatrix.array;
    
    // Fast Path: Check if rotation is needed
    // Only Sphere, Cylinder, Helix, Conical, etc might need rotation to lookAt center
    // Actually, in the original code:
    // if (layout === 'Sphere' || layout === 'Cylinder' || layout === 'Helix') lookAt(0,0,0)
    // else rotation.set(0,0,0)
    
    const needsRotation = (layout === 'Sphere' || layout === 'Cylinder' || layout === 'Helix' || layout === 'Conical');
    
    // Pre-calculate scale matrix elements since scale is uniform
    // Matrix4: 
    // sx  0  0  0
    // 0  sy  0  0
    // 0  0  sz  0
    // tx ty tz  1
    
    // If no rotation, the matrix is simple:
    // s 0 0 0
    // 0 s 0 0
    // 0 0 s 0
    // x y z 1
    
    const s = currentSize;
    
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      // Inline Lerp: start + (target - start) * progress
      const startX = startPositions.current[ix];
      const startY = startPositions.current[iy];
      const startZ = startPositions.current[iz];
      
      const targetX = targetPositions[ix];
      const targetY = targetPositions[iy];
      const targetZ = targetPositions[iz];
      
      // Interpolated Unit Position
      const ux = startX + (targetX - startX) * progress;
      const uy = startY + (targetY - startY) * progress;
      const uz = startZ + (targetZ - startZ) * progress;

      // Update current unit positions ref for next start point
      currentPositions.current[ix] = ux;
      currentPositions.current[iy] = uy;
      currentPositions.current[iz] = uz;

      // Final World Position
      const x = ux * currentSpacing;
      const y = uy * currentSpacing;
      const z = uz * currentSpacing;
      
      const offset = i * 16;

      if (!needsRotation) {
          // FAST PATH: Direct Matrix Update (No Rotation)
          // 0, 5, 10 are diagonals (scale)
          // 12, 13, 14 are positions
          // 15 is 1
          // Others are 0
          
          array[offset] = s;
          array[offset + 1] = 0;
          array[offset + 2] = 0;
          array[offset + 3] = 0;
          
          array[offset + 4] = 0;
          array[offset + 5] = s;
          array[offset + 6] = 0;
          array[offset + 7] = 0;
          
          array[offset + 8] = 0;
          array[offset + 9] = 0;
          array[offset + 10] = s;
          array[offset + 11] = 0;
          
          array[offset + 12] = x;
          array[offset + 13] = y;
          array[offset + 14] = z;
          array[offset + 15] = 1;
          
      } else {
          // SLOW PATH: Needs Rotation (LookAt 0,0,0)
          tempObject.position.set(x, y, z);
          tempObject.scale.set(s, s, s);
          tempObject.lookAt(0, 0, 0);
          tempObject.updateMatrix();
          
          // Copy to buffer
          for (let k = 0; k < 16; k++) {
              array[offset + k] = tempObject.matrix.elements[k];
          }
      }
    }
    
    instanceMatrix.needsUpdate = true;
  });

  // Initial Attribute Setup & Update
  React.useLayoutEffect(() => {
    if (meshRef.current) {
      // If attribute doesn't exist, create it
      if (!meshRef.current.geometry.attributes.aAtlasIndex) {
          meshRef.current.geometry.setAttribute(
            'aAtlasIndex',
            new THREE.InstancedBufferAttribute(new Float32Array(MAX_COUNT), 1)
          );
      }
      
      // Update data
      const attr = meshRef.current.geometry.attributes.aAtlasIndex;
      attr.array.set(indexArray);
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
        
        const monthIdx = x % 12;
        
        // Apply time slicing offset for metadata
        const startHourIdx = startHour / 2;
        const hourIdx = (z + startHourIdx) % 12;
        const textureIndex = (monthIdx * 12) + hourIdx;
        
        onHover({
          year: 2025,
          month: MONTHS[monthIdx],
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
        
        const monthIdx = x % 12;
        
        // Apply time slicing offset for metadata
        const startHourIdx = startHour / 2;
        const hourIdx = (z + startHourIdx) % 12;
        
        onClick({
          year: 2025,
          month: MONTHS[monthIdx],
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

import keyframesL from "./keyframes_final.json";
import keyframesH from "./keyframes_horizontal.json";
import keyframesHV2 from "./keyframes_horizontal_v2.json";
import keyframesHV3 from "./keyframes_horizontal_v3.json";
import keyframesV from "./keyframes_vertical.json";
import keyframesV2 from "./keyframes_vertical_v2.json";

const KEYFRAME_MAP = {
  "L-shaped": keyframesL,
  "Horizontal": keyframesH,
  "Horizontal V2": keyframesHV2,
  "Horizontal V3": keyframesHV3,
  "Vertical": keyframesV, 
  "Vertical V2": keyframesV2,
  "Elevator": keyframesL  // Fallback
};

// --- Animation Controller ---
function AnimationController({ isPlaying, time, setConfig, setCamera, animationConfigRef, isRecording, recordingTime, targetScreen }) {
  const { camera } = useThree();
  const frameCount = useRef(0);
  const lastLayout = useRef(null);
  const lastN = useRef(null);
  
  // Reusable vectors to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);
  const vecC = useMemo(() => new THREE.Vector3(), []);
  
  useFrame(() => {
    if (!isPlaying) return;

    // Get correct keyframes
    const keyframes = KEYFRAME_MAP[targetScreen] || KEYFRAME_MAP["L-shaped"];

    // Find current keyframe segment
    const totalDuration = keyframes[keyframes.length - 1].time;
    const currentTime = isRecording ? recordingTime : time.current;
    
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
    const elapsed = currentTime - startFrame.time;
    
    // Universal Delay: 2 seconds hold at start of each segment
    // For Vertical V2 (2s interval), 0.5s delay
    // For Horizontal V2 (2s interval), 0.5s delay (matching Vertical V2)
    // For Horizontal V3 (accelerating), 0 delay
    let DELAY = 1.5;
    if (targetScreen === "Vertical V2") DELAY = 0.5;
    if (targetScreen === "Horizontal V2") DELAY = 0.5;
    if (targetScreen === "Horizontal V3") DELAY = 0;

    let progress;
    
    if (DELAY > 0 && elapsed < DELAY) {
      progress = 0; // Stay at start position
    } else {
      const animDuration = Math.max(0.001, duration - DELAY); // Prevent division by zero
      progress = Math.min(1, Math.max(0, (elapsed - DELAY) / animDuration));
    }
    
    const easedProgress = (targetScreen === "Horizontal V3") ? progress : THREE.MathUtils.smoothstep(progress, 0, 1); // Simple ease-in-out

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
    
    // cubeSize now interpolates smoothly like spacing
    const cubeSize = THREE.MathUtils.lerp(startFrame.config.cubeSize, endFrame.config.cubeSize, easedProgress);

    // Update Ref directly for smooth 60fps animation
    if (animationConfigRef.current) {
        animationConfigRef.current.spacing = spacing;
        animationConfigRef.current.cubeSize = cubeSize;
    }

    // Throttle UI updates (React State) to ~4fps to save CPU
    // But update immediately if discrete values (Layout, N) change
    const layoutChanged = startFrame.config.layout !== lastLayout.current;
    const nChanged = N !== lastN.current;
    
    if (layoutChanged || nChanged || frameCount.current % 15 === 0) {
        setConfig({
          layout: startFrame.config.layout, // Discrete
          N: N, // Discrete (no interpolation)
          spacing,
          cubeSize,
          startHour: 12, // Hardcoded
          segmentDuration: duration // Pass segment duration for dynamic morphing
        });
        lastLayout.current = startFrame.config.layout;
        lastN.current = N;
    }
    
    frameCount.current++;
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

    // 30 FPS for stability, 5 Mbps for high quality (optimized from 25 Mbps)
    const stream = canvas.captureStream(30); 
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9', // Hardware acceleration preferred
      videoBitsPerSecond: 5000000 
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

import { useFrameRecorder } from "./recorder";


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

// --- Screen Specs ---
const SCREEN_SPECS = {
  "L-shaped": { width: 1152, height: 1248 },
  "Horizontal": { width: 1920, height: 1080 },
  "Horizontal V2": { width: 1920, height: 1080 },
  "Horizontal V3": { width: 1920, height: 1080 },
  "Vertical": { width: 576, height: 1248 },
  "Vertical V2": { width: 576, height: 1248 },
  "Elevator": { width: 1248, height: 1456 }
};

export default function VisInteractive() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [recordMode, setRecordMode] = useState(false);
  const [cameraState, setCameraState] = useState(null);
  
  // Frame Recorder state
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTime = useRef(0);
  const requestRef = useRef();
  const startTimeRef = useRef();
  
  // Ref for high-frequency animation values (bypassing React state)
  const animationConfigRef = useRef({ spacing: 3.0, cubeSize: 1.0 });
  
  const controlsRef = useRef();



  // --- Leva Controls ---
  // We use set to programmatically update Leva controls
  // --- Leva Controls ---
  // We use set to programmatically update Leva controls
  // --- Leva Controls ---
  
  // 1. Configuration Controls
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
    targetScreen: {
      options: Object.keys(SCREEN_SPECS),
      value: "L-shaped",
      label: "Target Screen"
    },
    exportDPR: { value: 2, min: 1, max: 4, step: 0.1, label: "Export DPR" },
    N: { value: 24, min: 1, max: 24, step: 1, label: "Grid Size (N)" },
    spacing: { value: 3, min: 0.1, max: 5.0, step: 0.1 },
    cubeSize: { value: 1.0, min: 0.1, max: 4.0, step: 0.1 },
    startHour: { value: 12, min: 0, max: 24, step: 0.1, label: "Start Hour" },
    segmentDuration: { value: 1.5, render: (get) => false } // Hidden control for internal state
  }));

  // 2. Action Controls (Dependent on config)
  useControls({
    "Test Animation": button(() => {
       startAnimation();
    }),
    
    "Jump to Keyframe": folder(
      (KEYFRAME_MAP[config.targetScreen] || KEYFRAME_MAP["L-shaped"]).reduce((acc, kf, idx) => {
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
  }, [config.targetScreen]); // Re-render actions when targetScreen changes

  // Calculate total frames based on keyframes duration
  // Use safe accessor for keyframes
  const activeKeyframes = KEYFRAME_MAP[config?.targetScreen] || KEYFRAME_MAP["L-shaped"];
  const duration = activeKeyframes[activeKeyframes.length - 1].time;
  const fps = 30;
  const calculatedTotalFrames = Math.ceil(duration * fps);

  const { 
    isRecording: isFrameRecording, 
    progress: frameProgress, 
    currentFrame, 
    totalFrames, 
    startRecording: startFrameRecording, 
    stopRecording: stopFrameRecording 
  } = useFrameRecorder({
    totalFrames: calculatedTotalFrames,
    fps: fps,
    onFrame: (t) => setRecordingTime(t),
    onStart: () => {
      // Stop regular animation loop
      stopAnimation();
    },
    onStop: () => {
      // Optional: Restart animation or stay paused
    }
  });

  // Sync Leva config to Ref when NOT animating
  // This ensures sliders work immediately
  useEffect(() => {
    if (!isAnimating && !isFrameRecording) {
      animationConfigRef.current.spacing = config.spacing;
      animationConfigRef.current.cubeSize = config.cubeSize;
    }
  }, [config.spacing, config.cubeSize, isAnimating, isFrameRecording]);

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
    
    if (elapsed < 60) { // 58s duration (matches last keyframe)
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
  
  // Safe accessors
  const targetSpec = SCREEN_SPECS[config.targetScreen] || SCREEN_SPECS["L-shaped"];
  const dpr = config.exportDPR || 2;

  return (
    <Container>
      <Leva collapsed={false} /> 
      
      <div style={{
        width: recordMode ? `${targetSpec.width}px` : '100vw',
        height: recordMode ? `${targetSpec.height}px` : '100vh',
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
          dpr={dpr} // Use configurable DPR
          gl={{ preserveDrawingBuffer: true, logarithmicDepthBuffer: true }}
          onCreated={({ gl }) => {
            window._canvas = gl.domElement;
          }}
        >
          <color attach="background" args={['#111']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={50} />

          <AnimationController 
            isPlaying={isAnimating || isFrameRecording} 
            time={animationTime} 
            setConfig={setConfig} 
            animationConfigRef={animationConfigRef}
            isRecording={isFrameRecording}
            recordingTime={recordingTime}
            targetScreen={config.targetScreen}
          />
          
          <CameraHelper controlsRef={controlsRef} onUpdate={setCameraState} jumpTarget={jumpTarget} />

          <AtlasCubeGrid 
            onHover={setHovered} 
            onClick={setSelected} 
            config={config}
            animationConfigRef={animationConfigRef}
            timeRef={animationTime}
            recordingTime={recordingTime}
            isRecording={isFrameRecording}
          />
          
          <OrbitControls ref={controlsRef} enabled={!isAnimating && !isFrameRecording} enableDamping target={[0, 0, 0]} />
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
            {recordMode ? "Exit Record Mode" : `Enter Record Mode (${targetSpec.width}x${targetSpec.height})`}
          </button>
          
          {recordMode && (
            <div style={{ display: 'flex', gap: '10px' }}>
              {/* Legacy Video Recorder */}
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
                {recording ? "Stop Video" : "Record Video (WebM)"}
              </button>

              {/* New Frame Recorder */}
              <button 
                onClick={() => {
                  if (isFrameRecording) stopFrameRecording();
                  else {
                    // Get duration from current keyframes
                    const currentKeyframes = KEYFRAME_MAP[config.targetScreen] || KEYFRAME_MAP["L-shaped"];
                    const duration = currentKeyframes[currentKeyframes.length - 1].time;
                    
                    const now = new Date();
                    const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
                    const seqName = `shibuya_${config.targetScreen}_${timestamp}`;
                    startFrameRecording(window._canvas, seqName);
                  }
                }}
                style={{ 
                  padding: '8px', 
                  cursor: 'pointer',
                  background: isFrameRecording ? 'blue' : 'white',
                  color: isFrameRecording ? 'white' : 'black'
                }}
              >
                {isFrameRecording ? `Rendering to Disk... ${Math.round(frameProgress)}%` : "Render to Disk (PNG Sequence)"}
              </button>
            </div>
          )}
        </div>
      </Overlay>
    </Container>
  );
}
