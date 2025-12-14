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
const getOtherLayoutPositions = (type, count, N, spacing, cubeSize = 1) => {
  const positions = new Float32Array(count * 3);
  let i = 0;

  // Helper for volumetric mapping
  // We iterate x, y, z from 0 to N-1
  
  for (let ix = 0; ix < N; ix++) {
    for (let iy = 0; iy < N; iy++) {
      for (let iz = 0; iz < N; iz++) {
        let x, y, z;
        
        // Normalized coordinates (0 to 1)
        const u0 = ix / (N - 1);
        const v0 = iy / (N - 1);
        const w0 = iz / (N - 1);

        // Centered coordinates (-1 to 1)
        const uc = (ix / (N - 1)) * 2 - 1;
        const vc = (iy / (N - 1)) * 2 - 1;
        const wc = (iz / (N - 1)) * 2 - 1;

        const scale = N * spacing * 0.5;

        switch (type) {
          case 'Sphere': {
            // Reverted to Fibonacci Sphere (Linear Layout)
            // This ignores the volumetric grid structure for placement to prevent overlap
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            const r = N * spacing * 0.6; 
            
            x = r * Math.sin(phi) * Math.cos(theta);
            y = r * Math.sin(phi) * Math.sin(theta);
            z = r * Math.cos(phi);
            break;
          }

          case 'Cylinder': {
            // Reverted to Dynamic Cylinder Layout (Linear Layout)
            const r = N * spacing * 0.4;
            const circumference = 2 * Math.PI * r;
            const itemWidth = cubeSize * 1.2; 
            const itemsPerTurn = circumference / itemWidth;
            const totalTurns = count / itemsPerTurn;
            const totalHeight = totalTurns * (cubeSize * 1.2);
            
            const theta = (i / count) * Math.PI * 2 * totalTurns;
            const h = (i / count) * totalHeight - (totalHeight / 2);
            
            x = r * Math.cos(theta);
            y = h;
            z = r * Math.sin(theta);
            break;
          }

          case 'Scatter': {
             // Deterministic random based on index
             const seed = i * 123.45;
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
             const layerOffset = iz * (cubeSize * 1.5); 
             
             const r = baseR + layerOffset; 
             const theta = v0 * Math.PI * 2;

             x = r * Math.cos(theta);
             y = h;
             z = r * Math.sin(theta);
             break;
          }
          
          default: // Cube
             const offset = (N - 1) * spacing / 2;
             x = (ix * spacing) - offset;
             y = (iy * spacing) - offset;
             z = (iz * spacing) - offset;
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

function AtlasCubeGrid({ onHover, onClick, config }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  const { N, spacing, cubeSize, layout, startHour } = config;
  const count = N * N * N;

  // --- Atlas Generation ---
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);
  
  // 1. Canonical Cube Positions AND Index Array (Unified to ensure sync)
  const { cubePositions, indexArray } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const idx = new Float32Array(count);
    let i = 0;
    const offset = (N - 1) * spacing / 2;
    
    // Calculate hour offset index (0-11) from startHour (0, 2, ..., 22)
    const startHourIdx = startHour / 2;

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
           // Position
           pos[i*3] = (x * spacing) - offset;
           pos[i*3+1] = (y * spacing) - offset;
           pos[i*3+2] = (z * spacing) - offset;
           
           // Texture Index
           const yearIdx = x % 12;
           // Apply time slicing offset
           const hourIdx = (z + startHourIdx) % 12;
           idx[i] = (yearIdx * 12) + hourIdx;
           
           i++;
        }
      }
    }
    return { cubePositions: pos, indexArray: idx };
  }, [N, spacing, count, startHour]);

  // 2. Determine Target Positions
  const targetPositions = useMemo(() => {
    if (layout === 'Cube') return cubePositions;
    return getOtherLayoutPositions(layout, count, N, spacing, cubeSize);
  }, [layout, N, spacing, count, cubePositions, cubeSize]);

  // 3. State for Animation
  const currentPositions = useRef(null);
  const startPositions = useRef(null);

  // Initialize immediately to avoid 0,0,0 flash
  if (!currentPositions.current || currentPositions.current.length !== count * 3) {
    currentPositions.current = new Float32Array(targetPositions);
    startPositions.current = new Float32Array(targetPositions);
  }

  // Spring for transition
  const [{ t, smoothSize }, api] = useSpring(() => ({
    t: 1,
    smoothSize: cubeSize,
    config: { mass: 1, tension: 120, friction: 20 },
  }));

  // Update smoothSize when cubeSize changes
  useEffect(() => {
    api.start({ smoothSize: cubeSize });
  }, [cubeSize, api]);

  // Capture start positions when layout changes
  useEffect(() => {
    if (currentPositions.current) {
        startPositions.current.set(currentPositions.current);
        // Reset animation
        api.start({ t: 1, from: { t: 0 }, reset: true });
    }
  }, [layout, N, spacing, api]); 

  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !atlas) return;

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

  // Initial Attribute Setup
  React.useLayoutEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry.setAttribute(
        'aAtlasIndex',
        new THREE.InstancedBufferAttribute(indexArray, 1)
      );
    }
  }, [indexArray, atlas]);

  if (!atlas) return <Html center>Generating Atlas...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        
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
function AnimationController({ isPlaying, time, setConfig, setCamera, isHeartbeat }) {
  const { camera } = useThree();
  
  // Reusable vectors to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);
  const vecC = useMemo(() => new THREE.Vector3(), []);
  
  useFrame(() => {
    // Heartbeat Logic (Independent of keyframe animation)
    let currentCubeSize = 1.0; // Default
    if (isHeartbeat) {
       // 0.5Hz Heartbeat (2s period): 1.0 to 2.0
       // Function: Smoother sine-based pulse
       
       const t = isPlaying ? time.current : (performance.now() / 1000);
       // Use PI * t for 2-second period (0.5Hz)
       // Use power of 0.5 for a "breathing" effect (stays expanded longer)
       const pulse = Math.pow((1 + Math.sin(Math.PI * t * (2/5))) / 2, 0.5); 
       currentCubeSize = 1.0 + (1.0 * pulse);
    }

    if (!isPlaying) {
        // If only heartbeat is playing, we still need to update config
        if (isHeartbeat) {
             setConfig({ cubeSize: currentCubeSize });
        }
        return;
    }

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
    const progress = (currentTime - startFrame.time) / duration;
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1); // Simple ease-in-out

    // Interpolate Camera
    vecA.fromArray(startFrame.camera.position);
    vecB.fromArray(endFrame.camera.position);
    camera.position.lerpVectors(vecA, vecB, easedProgress);
    
    vecA.fromArray(startFrame.camera.target);
    vecB.fromArray(endFrame.camera.target);
    // Interpolate target then lookAt
    vecC.lerpVectors(vecA, vecB, easedProgress);
    camera.lookAt(vecC);

    // Interpolate Config
    const N = THREE.MathUtils.lerp(startFrame.config.N, endFrame.config.N, easedProgress);
    const spacing = THREE.MathUtils.lerp(startFrame.config.spacing, endFrame.config.spacing, easedProgress);
    // const cubeSize = THREE.MathUtils.lerp(startFrame.config.cubeSize, endFrame.config.cubeSize, easedProgress); // Removed from keyframes
    const startHour = THREE.MathUtils.lerp(startFrame.config.startHour, endFrame.config.startHour, easedProgress);

    setConfig({
      layout: startFrame.config.layout, // Discrete
      N: Math.round(N), // Integer
      spacing,
      cubeSize: isHeartbeat ? currentCubeSize : 1.0, // Heartbeat overrides or default 1.0
      startHour
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
function CameraHelper({ controlsRef, onUpdate }) {
  const { camera } = useThree();
  const isUpdatingLeva = useRef(false);
  const lastState = useRef({ position: [0,0,0], target: [0,0,0] });

  const [, set] = useControls("Camera State", () => ({
    position: { 
      value: [20, 20, 20], 
      step: 0.1,
      onChange: (v) => {
        if (!isUpdatingLeva.current) {
          camera.position.set(...v);
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
        const state = {
            time: 0, // Placeholder
            camera: {
                position: camera.position.toArray().map(v => Number(v.toFixed(2))),
                target: controlsRef.current ? controlsRef.current.target.toArray().map(v => Number(v.toFixed(2))) : [0,0,0]
            },
            config: {
                // We can't easily access the current config here without passing it in, 
                // but the user mainly wants camera coords.
            }
        };
        console.log("Keyframe Data:", JSON.stringify(state, null, 2));
        alert("Camera state logged to console! Check the developer tools.");
    })
  }));

  useFrame(() => {
    if (controlsRef.current) {
        const currentPos = camera.position.toArray();
        const currentTarget = controlsRef.current.target.toArray();
        
        // Check if changed significantly to avoid loop/perf issues
        const posChanged = currentPos.some((v, i) => Math.abs(v - lastState.current.position[i]) > 0.01);
        const targetChanged = currentTarget.some((v, i) => Math.abs(v - lastState.current.target[i]) > 0.01);

        if (posChanged || targetChanged) {
            isUpdatingLeva.current = true;
            set({
                position: currentPos,
                target: currentTarget
            });
            isUpdatingLeva.current = false;
            
            lastState.current.position = currentPos;
            lastState.current.target = currentTarget;
            
            if (onUpdate) onUpdate({ position: currentPos, target: currentTarget });
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
  const [isHeartbeat, setIsHeartbeat] = useState(false); // Heartbeat state
  const animationTime = useRef(0);
  const requestRef = useRef();
  const startTimeRef = useRef();
  
  const controlsRef = useRef();

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
    startHour: { value: 0, options: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], label: "Start Hour" },
    "Heartbeat": { value: false, onChange: (v) => setIsHeartbeat(v) }, // Leva control
    
    "Test Animation": button(() => {
       startAnimation();
    })
  }));
  
  const startAnimation = () => {
    setIsAnimating(true);
    setIsHeartbeat(true); // Auto-start heartbeat
    animationTime.current = 0;
    startTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    setIsHeartbeat(false); // Auto-stop heartbeat
    cancelAnimationFrame(requestRef.current);
  };

  const animate = (time) => {
    const elapsed = (time - startTimeRef.current) / 1000; // seconds
    animationTime.current = elapsed;
    
    if (elapsed < 50) { // 50s duration
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
            isHeartbeat={isHeartbeat}
            time={animationTime} 
            setConfig={setConfig} 
          />
          
          <CameraHelper controlsRef={controlsRef} onUpdate={setCameraState} />

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
              <strong>Camera Pos:</strong> [{cameraState.position.map(v => v.toFixed(2)).join(', ')}]<br/>
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
