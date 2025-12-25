import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useSpring } from "@react-spring/three";
import * as S from "./styles";

// --- Constants & Data ---

// Shibuya Data: 12 Months x 12 Hours (Year fixed to 2025)
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

const LAYOUT_PRESETS = [
  { name: "Cube", spacing: 3.0, cubeSize: 1.0 },
  { name: "Elliptic Cylinder", spacing: 2.5, cubeSize: 0.8 },
  { name: "Parabolic Cylinder", spacing: 4.5, cubeSize: 1.5 },
  { name: "Conical", spacing: 4.0, cubeSize: 3.0 },
  { name: "Sphere", spacing: 2.0, cubeSize: 0.8 },
  { name: "Oblate Spheroidal", spacing: 1.5, cubeSize: 0.5 },
  { name: "Prolate Spheroidal", spacing: 3.0, cubeSize: 1.5 },
  { name: "Ellipsoidal", spacing: 5.0, cubeSize: 3.0 },
  { name: "Paraboloidal", spacing: 2.8, cubeSize: 1.4 },
  { name: "Bispherical", spacing: 2.8, cubeSize: 2.0 },
];

const LAYOUT_NAMES_KR = {
  "Cube": "직교좌표계",
  "Sphere": "구면좌표계",
  "Cylinder": "원통좌표계",
  "Helix": "나선좌표계",
  "Elliptic Cylinder": "타원원통좌표계",
  "Parabolic Cylinder": "포물선원통좌표계",
  "Conical": "원뿔좌표계",
  "Oblate Spheroidal": "편구면좌표계",
  "Prolate Spheroidal": "장구면좌표계",
  "Ellipsoidal": "타원면좌표계",
  "Paraboloidal": "포물면좌표계",
  "Bispherical": "쌍구면좌표계",
};

const MAX_N = 24;
const MAX_COUNT = MAX_N * MAX_N * MAX_N;

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

  const timeOffset = startHour / 24.0;

  for (let ix = 0; ix < N; ix++) {
    for (let iy = 0; iy < N; iy++) {
      for (let iz = 0; iz < N; iz++) {
        let x, y, z;
        
        const u0 = ix / (N - 1);
        const v0 = iy / (N - 1);
        
        let w0 = (iz / N + timeOffset) % 1.0;
        if (w0 < 0) w0 += 1.0;

        const uc = (ix / (N - 1)) * 2 - 1;
        const vc = (iy / (N - 1)) * 2 - 1;
        const wc = w0 * 2 - 1; 

        const scale = N * spacing * 0.5;

        switch (type) {
          case 'Sphere': {
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
          case 'Elliptic Cylinder': {
             const c = scale * 0.5;
             const u = u0 * 1.5 + 0.5; 
             const v = v0 * Math.PI * 2;
             const w = wc * scale * 2;
             x = c * Math.cosh(u) * Math.cos(v);
             y = c * Math.sinh(u) * Math.sin(v);
             z = w;
             break;
          }
          case 'Parabolic Cylinder': {
             const u = uc * Math.sqrt(scale * 2);
             const v = vc * Math.sqrt(scale * 2);
             const w = wc * scale * 2;
             x = 0.5 * (u*u - v*v);
             y = u * v;
             z = w;
             break;
          }
          case 'Paraboloidal': {
             const u = u0 * Math.sqrt(scale * 2);
             const v = v0 * Math.sqrt(scale * 2);
             const phi = w0 * Math.PI * 2;
             x = u * v * Math.cos(phi);
             y = u * v * Math.sin(phi);
             z = 0.5 * (u*u - v*v);
             break;
          }
          case 'Ellipsoidal': {
             const a = scale * 1.5;
             const b = scale * 1.0;
             const c = scale * 0.6;
             const theta = u0 * Math.PI;
             const phi = v0 * Math.PI * 2;
             const rho = 1 + (wc * 0.2) + (((ix * 13 + iy * 17 + iz * 19) % 100) * 0.002); // Thickness + Jitter
             x = a * rho * Math.sin(theta) * Math.cos(phi);
             y = b * rho * Math.sin(theta) * Math.sin(phi);
             z = c * rho * Math.cos(theta);
             break;
          }
          case 'Oblate Spheroidal': {
             const a = scale;
             const u = u0 * 1.0 + 0.2;
             const v = vc * Math.PI / 2; 
             const phi = w0 * Math.PI * 2;
             x = a * Math.cosh(u) * Math.cos(v) * Math.cos(phi);
             y = a * Math.cosh(u) * Math.cos(v) * Math.sin(phi);
             z = a * Math.sinh(u) * Math.sin(v);
             break;
          }
          case 'Prolate Spheroidal': {
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
             const a = scale * 0.8;
             const u = uc * 2.0; 
             const u_safe = (Math.abs(u) < 0.1 ? 0.1 : u); 
             const v = v0 * Math.PI * 0.9 + 0.05; 
             const phi = w0 * Math.PI * 2;
             const denom = Math.cosh(u_safe) - Math.cos(v);
             x = (a * Math.sin(v) * Math.cos(phi)) / denom;
             y = (a * Math.sin(v) * Math.sin(phi)) / denom;
             z = (a * Math.sinh(u_safe)) / denom;
             break;
          }
          case 'Conical': {
             const h = uc * scale * 2; 
             const baseR = (1.0 - Math.abs(uc)) * scale * 1.5; 
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

// --- Camera Animator with DoF Control ---

function AtlasCubeGrid({ layoutIndex, onLoad, onCubeClick, selectedInstanceId }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  const { gl } = useThree(); 
  
  const currentPreset = LAYOUT_PRESETS[layoutIndex];
  const { name: layout, spacing: targetSpacing, cubeSize: targetCubeSize } = currentPreset;
  const N = 24; // Fixed N
  const startHour = 12;
  const count = N * N * N;

  // --- Atlas Generation ---
  useEffect(() => {
    const startTime = Date.now();
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false; 
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
      
      setAtlas({ texture, cols: data.cols, rows: data.rows });
      
      // Enforce minimum loading time of 1.5s for visibility
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1500 - elapsed);
      
      setTimeout(() => {
        if (onLoad) onLoad();
      }, remaining);
      
    }).catch(err => console.error("Atlas generation failed", err));
  }, [gl]);

  // 1. Index Array
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

  // 2. Target Positions (UNIT SPACE)
  const targetPositions = useMemo(() => {
    const positions = new Float32Array(MAX_COUNT * 3);
    const calculated = getOtherLayoutPositions(layout, count, N, 1.0, 1.0, startHour);
    positions.set(calculated);
    return positions;
  }, [layout, N, count, startHour]);

  // 3. State for Animation
  const currentPositions = useRef(null);
  const startPositions = useRef(null);

  if (!currentPositions.current) {
    currentPositions.current = new Float32Array(MAX_COUNT * 3);
    startPositions.current = new Float32Array(MAX_COUNT * 3);
    currentPositions.current.set(targetPositions);
    startPositions.current.set(targetPositions);
  }

  // Spring for transition
  const [{ t, spacing, cubeSize }, api] = useSpring(() => ({
    t: 1,
    spacing: targetSpacing,
    cubeSize: targetCubeSize,
    config: { mass: 1, tension: 80, friction: 20 },
  }));

  useEffect(() => {
    if (currentPositions.current) {
        startPositions.current.set(currentPositions.current);
        api.start({ 
            t: 1, 
            from: { t: 0 }, 
            spacing: targetSpacing,
            cubeSize: targetCubeSize,
            reset: true 
        });
    }
  }, [layout, targetSpacing, targetCubeSize, api]); 

  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !atlas) return;
    
    if (meshRef.current.count !== count) {
        meshRef.current.count = count;
    }

    const progress = t.get();
    const currentSpacing = spacing.get();
    const currentSize = cubeSize.get();
    
    const instanceMatrix = meshRef.current.instanceMatrix;
    const array = instanceMatrix.array;
    
    const needsRotation = (layout === 'Sphere' || layout === 'Cylinder' || layout === 'Helix' || layout === 'Conical');
    
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      const startX = startPositions.current[ix];
      const startY = startPositions.current[iy];
      const startZ = startPositions.current[iz];
      
      const targetX = targetPositions[ix];
      const targetY = targetPositions[iy];
      const targetZ = targetPositions[iz];
      
      const ux = startX + (targetX - startX) * progress;
      const uy = startY + (targetY - startY) * progress;
      const uz = startZ + (targetZ - startZ) * progress;

      currentPositions.current[ix] = ux;
      currentPositions.current[iy] = uy;
      currentPositions.current[iz] = uz;

      const x = ux * currentSpacing;
      const y = uy * currentSpacing;
      const z = uz * currentSpacing;
      
      const offset = i * 16;
      
      // Highlight selected element
      const isSelected = (i === selectedInstanceId);
      const s = isSelected ? currentSize * 3 : currentSize;

      if (!needsRotation) {
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
          tempObject.position.set(x, y, z);
          tempObject.scale.set(s, s, s);
          tempObject.lookAt(0, 0, 0);
          tempObject.updateMatrix();
          
          for (let k = 0; k < 16; k++) {
              array[offset + k] = tempObject.matrix.elements[k];
          }
      }
    }
    
    instanceMatrix.needsUpdate = true;
  });

  React.useLayoutEffect(() => {
    if (meshRef.current) {
      if (!meshRef.current.geometry.attributes.aAtlasIndex) {
          meshRef.current.geometry.setAttribute(
            'aAtlasIndex',
            new THREE.InstancedBufferAttribute(new Float32Array(MAX_COUNT), 1)
          );
      }
      
      const attr = meshRef.current.geometry.attributes.aAtlasIndex;
      attr.array.set(indexArray);
      attr.needsUpdate = true;
    }
  }, [indexArray, atlas]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (onCubeClick) {
        const instanceId = e.instanceId;
        const matrix = new THREE.Matrix4();
        meshRef.current.getMatrixAt(instanceId, matrix);
        const position = new THREE.Vector3().setFromMatrixPosition(matrix);
        onCubeClick(position, instanceId);
    }
  };

  if (!atlas) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, MAX_COUNT]}
      onClick={handleClick}
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

// --- Camera Animator ---
function CameraAnimator({ targetPosition, controlsRef, isCameraAnimating }) {
  const { camera } = useThree();
  const vec = new THREE.Vector3();
  
  // Trigger animation when targetPosition changes
  useEffect(() => {
      if (targetPosition) {
          if (isCameraAnimating) isCameraAnimating.current = true;
      }
  }, [targetPosition, isCameraAnimating]);
  
  useFrame((state, delta) => {
    if (!controlsRef.current || !targetPosition || !isCameraAnimating?.current) return;

    // 1. Animate controls target to the exact cube position
    const currentTarget = controlsRef.current.target;
    const distToTarget = currentTarget.distanceTo(targetPosition);
    
    // Smooth lerp factor
    const step = 5 * delta;

    currentTarget.lerp(targetPosition, step);
    
    // 2. Animate camera position (Zoom in closer)
    // Calculate direction from target to current camera position
    vec.copy(camera.position).sub(currentTarget).normalize();
    
    // Desired distance (zoom level)
    const zoomDist = 5; 
    const desiredPos = targetPosition.clone().add(vec.multiplyScalar(zoomDist));
    
    camera.position.lerp(desiredPos, step);
    
    controlsRef.current.update();
    
    // Stop animating when close enough to allow free rotation
    if (distToTarget < 0.01 && camera.position.distanceTo(desiredPos) < 0.01) {
        if (isCameraAnimating) isCameraAnimating.current = false;
        
        // Ensure final snap
        controlsRef.current.target.copy(targetPosition);
        camera.position.copy(desiredPos); // Snap camera to final desired position
        controlsRef.current.update();
    }
  });
  
  return null;
}

// --- Gyro Orbit Controls ---
function GyroOrbitControls({ controlsRef, enabled, isCameraAnimating }) {
  const { camera } = useThree();
  const [initialOrientation, setInitialOrientation] = useState(null);
  const currentOrientation = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const smoothedOrientation = useRef({ alpha: 0, beta: 0 });
  const isInteracting = useRef(false);
  const baseSpherical = useRef(new THREE.Spherical());
  
  // Listen to OrbitControls interaction
  useEffect(() => {
      if (!controlsRef.current) return;
      const controls = controlsRef.current;
      
      const onStart = () => {
          isInteracting.current = true;
          setInitialOrientation(null); // Reset gyro reference on touch
      };
      
      const onEnd = () => {
          isInteracting.current = false;
          // Will re-capture initial orientation on next frame if gyro is enabled
      };
      
      controls.addEventListener('start', onStart);
      controls.addEventListener('end', onEnd);
      
      return () => {
          controls.removeEventListener('start', onStart);
          controls.removeEventListener('end', onEnd);
      };
  }, [controlsRef]);
  
  // Handle Device Orientation
  useEffect(() => {
      if (!enabled) {
          setInitialOrientation(null);
          return;
      }
      
      const handleOrientation = (event) => {
          if (event.alpha === null) return;
          currentOrientation.current = {
              alpha: event.alpha,
              beta: event.beta,
              gamma: event.gamma
          };
      };
      
      window.addEventListener('deviceorientation', handleOrientation);
      return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [enabled]);
  
  useFrame((state, delta) => {
      if (!enabled || !controlsRef.current || isInteracting.current) return;
      
      // If camera is being animated by CameraAnimator, pause gyro control
      // and reset initial orientation so we re-capture the new position when animation ends
      if (isCameraAnimating && isCameraAnimating.current) {
          setInitialOrientation(null);
          return;
      }
      
      const { alpha, beta } = currentOrientation.current;
      
      // Initialize if needed
      if (!initialOrientation) {
          setInitialOrientation({ alpha, beta });
          smoothedOrientation.current = { alpha, beta };
          
          // Capture current camera spherical pos as base
          const target = controlsRef.current.target;
          baseSpherical.current.setFromVector3(camera.position.clone().sub(target));
          return;
      }
      
      // Smooth orientation
      const lerpFactor = 5 * delta;
      smoothedOrientation.current.alpha = THREE.MathUtils.lerp(smoothedOrientation.current.alpha, alpha, lerpFactor);
      smoothedOrientation.current.beta = THREE.MathUtils.lerp(smoothedOrientation.current.beta, beta, lerpFactor);
      
      const deltaAlpha = THREE.MathUtils.degToRad(smoothedOrientation.current.alpha - initialOrientation.alpha);
      const deltaBeta = THREE.MathUtils.degToRad(smoothedOrientation.current.beta - initialOrientation.beta);
      
      const newTheta = baseSpherical.current.theta + deltaAlpha; 
      const newPhi = baseSpherical.current.phi + deltaBeta;
      
      // Clamp phi to avoid flipping (OrbitControls default min/maxPolarAngle)
      const clampedPhi = Math.max(0.01, Math.min(Math.PI - 0.01, newPhi));
      
      // Update camera position
      const target = controlsRef.current.target;
      const newPos = new THREE.Vector3().setFromSphericalCoords(
          baseSpherical.current.radius,
          clampedPhi,
          newTheta
      ).add(target);
      
      camera.position.copy(newPos);
      camera.lookAt(target);
  });
  
  return null;
}

export default function ShibuyaVisualization() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [isKorean, setIsKorean] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useGyro, setUseGyro] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const controlsRef = useRef();
  const isCameraAnimating = useRef(false); // Shared ref for animation state

  // Detect browser language on mount
  useEffect(() => {
    const lang = navigator.language || navigator.userLanguage;
    if (lang && lang.startsWith('ko')) {
      setIsKorean(true);
    }
  }, []);
  
  const resetCamera = () => {
      if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
      }
  };

  const handleNext = () => {
    setLayoutIndex((prev) => (prev + 1) % LAYOUT_PRESETS.length);
    setFocusTarget(null); 
    setSelectedInfo(null);
    setSelectedInstanceId(null);
    resetCamera();
  };

  const handlePrev = () => {
    setLayoutIndex((prev) => (prev - 1 + LAYOUT_PRESETS.length) % LAYOUT_PRESETS.length);
    setFocusTarget(null); 
    setSelectedInfo(null);
    setSelectedInstanceId(null);
    resetCamera();
  };
  
  const handleGyroToggle = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    setUseGyro(!useGyro);
                } else {
                    alert("Permission denied");
                }
            })
            .catch(console.error);
    } else {
        setUseGyro(!useGyro);
    }
  };
  
  const handleCubeClick = (position, instanceId) => {
      setFocusTarget(position);
      setSelectedInstanceId(instanceId);
      
      // Calculate Month and Hour from instanceId
      const N = 24;
      const startHour = 12;
      const startHourIdx = Math.floor(startHour / 2);
      
      const z = instanceId % N;
      const y = Math.floor(instanceId / N) % N;
      const x = Math.floor(instanceId / (N * N));
      
      const month = MONTHS[x % 12];
      const hour = HOURS[(z + startHourIdx) % 12];
      
      setSelectedInfo({ month, hour });
  };
  
  const handleBackgroundClick = () => {
      setFocusTarget(null);
      setSelectedInfo(null);
      setSelectedInstanceId(null);
  };

  return (
    <S.Container onClick={handleBackgroundClick}>
      <S.LoadingOverlay $visible={loading} />
      
      <S.LanguageToggle onClick={() => setIsKorean(!isKorean)}>
        {isKorean ? "ENG" : "KOR"}
      </S.LanguageToggle>

      {selectedInfo && (
          <S.SelectionInfo>
              <S.SelectionTitle>Selected</S.SelectionTitle>
              <S.SelectionDetail>
                  {selectedInfo.month} <span>{selectedInfo.hour}</span>
              </S.SelectionDetail>
          </S.SelectionInfo>
      )}

      <Canvas camera={{ position: [0, 0, 100], fov: 45 }}>
        <color attach="background" args={["#000"]} />
        <ambientLight intensity={1.5} />
        <pointLight position={[100, 100, 100]} intensity={1} />
        
        <AtlasCubeGrid 
            layoutIndex={layoutIndex} 
            onLoad={() => setLoading(false)}
            onCubeClick={handleCubeClick}
            selectedInstanceId={selectedInstanceId}
        />
        
        <OrbitControls 
            ref={controlsRef} 
            enableDamping 
            dampingFactor={0.05}
            rotateSpeed={0.5}
            enableZoom={true}
        />
        
        <CameraAnimator 
            targetPosition={focusTarget} 
            controlsRef={controlsRef} 
            isCameraAnimating={isCameraAnimating}
        />
        
        <GyroOrbitControls 
            controlsRef={controlsRef} 
            enabled={useGyro} 
            isCameraAnimating={isCameraAnimating}
        />
      </Canvas>

      <S.UIOverlay>
        <S.BottomControls>
          <S.LayoutSelector>
            <S.ControlGroup>
                <S.ArrowButton onClick={(e) => { e.stopPropagation(); handlePrev(); }}>
                ←
                </S.ArrowButton>
                <S.LayoutInfo>
                <S.LayoutName>
                    {isKorean ? LAYOUT_NAMES_KR[LAYOUT_PRESETS[layoutIndex].name] : LAYOUT_PRESETS[layoutIndex].name}
                </S.LayoutName>
                <S.LayoutSub>
                    {isKorean ? "좌표계 시각화" : "Coordinate System Visualization"}
                </S.LayoutSub>
                </S.LayoutInfo>
                <S.ArrowButton onClick={(e) => { e.stopPropagation(); handleNext(); }}>
                →
                </S.ArrowButton>
            </S.ControlGroup>
            
            <S.ControlGroup>
                <S.ShakeButton onClick={(e) => { e.stopPropagation(); handleGyroToggle(); }} style={{ color: useGyro ? '#4ade80' : 'rgba(255,255,255,0.8)' }}>
                    <svg viewBox="0 0 24 24">
                        <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h10V4H7zm3 17h4v-1h-4v1z"/>
                    </svg>
                </S.ShakeButton>
                <S.InfoIcon onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}>
                i
                </S.InfoIcon>
            </S.ControlGroup>
          </S.LayoutSelector>
        </S.BottomControls>
      </S.UIOverlay>

      {showInfo && (
        <S.InfoModalOverlay onClick={() => setShowInfo(false)}>
          <S.InfoModal onClick={(e) => e.stopPropagation()}>
            <S.CloseButton onClick={() => setShowInfo(false)}>×</S.CloseButton>
            
            <S.ModalLabel>Project Info</S.ModalLabel>
            <S.ModalTitle>
              AWAOGTNSOCSCSCHECPCCOSPSEPBDNDCGUGAIV144TSMPSIFJTDF00HT22HMA12X12PPCTDSWADCVPATGAENAMIAANAPEONMAALMT
            </S.ModalTitle>
            
            <S.ModalContent>
              <p>
                <strong>A Web Art On Generative Topological Navigation Study Of Coordinate Systems</strong><br/>
                Cubic, Spherical, Cylindrical, Helical, Elliptic Cylindrical, Parabolic Cylindrical, Conical, Oblate Spheroidal, Prolate Spheroidal, Ellipsoidal, Paraboloidal, Bispherical.
              </p>
              <p>
                Defining New Database Cinema Grammar Using Generative AI Via 144 Tokyo Shibuya Miyashita Park Sky Images From Jan To Dec From 00h To 22h.
              </p>
              <p>
                Mapping A 12x12 Parametric Plane Conceptualising Temporal Dimensions Spotting Weather And Daylight Changes Via Parametric Approach To Generative Ai.
              </p>
              <p>
                Establishing New Aesthetics Moving Image Approaches And Navigation As Provocative Expression Of New Media Art As Lev Manovich Theorised.
              </p>
            </S.ModalContent>
            
            <S.CancelButton onClick={() => setShowInfo(false)}>
              Close
            </S.CancelButton>
          </S.InfoModal>
        </S.InfoModalOverlay>
      )}
    </S.Container>
  );
}
