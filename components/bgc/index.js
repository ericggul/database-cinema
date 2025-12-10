import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, DeviceOrientationControls } from "@react-three/drei";
import * as THREE from "three";
import { useSpring } from "@react-spring/three";
import * as S from "./styles";

// --- Constants & Data ---

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
             const rho = 1 + (wc * 0.2); 
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

// --- Camera Animator ---

// --- Camera Animator with DoF Control ---


function AtlasCubeGrid({ layoutIndex, onLoad, onCubeClick }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  const { gl } = useThree(); // Get gl to check max anisotropy
  
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
      texture.generateMipmaps = false; // Atlas might not need mipmaps if we want sharp pixels, or true for smooth
      // Actually for "blurry" complaint, maybe we want Nearest? 
      // But these are photos. Linear is better.
      // Let's enable anisotropy.
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

  // ... (rest of the component remains the same until return)

  // 1. Index Array
  const indexArray = useMemo(() => {
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
    
    const s = currentSize;
    
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
function CameraAnimator({ targetPosition, controlsRef }) {
  const { camera } = useThree();
  const vec = new THREE.Vector3();
  const isAnimating = useRef(false);
  
  // Trigger animation when targetPosition changes
  useEffect(() => {
      if (targetPosition) {
          isAnimating.current = true;
      }
  }, [targetPosition]);
  
  useFrame((state, delta) => {
    if (!controlsRef.current || !targetPosition || !isAnimating.current) return;

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
    const zoomDist = 1.5; 
    const desiredPos = targetPosition.clone().add(vec.multiplyScalar(zoomDist));
    
    camera.position.lerp(desiredPos, step);
    
    controlsRef.current.update();
    
    // Stop animating when close enough to allow free rotation
    if (distToTarget < 0.01 && camera.position.distanceTo(desiredPos) < 0.01) {
        isAnimating.current = false;
        // Ensure final snap
        controlsRef.current.target.copy(targetPosition);
        camera.position.copy(desiredPos); // Snap camera to final desired position
        controlsRef.current.update();
    }
  });
  
  return null;
}

// ... (AtlasCubeGrid remains same) ...

export default function BGCVisualization() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [isKorean, setIsKorean] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useGyro, setUseGyro] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const controlsRef = useRef();

  // Detect browser language on mount
  useEffect(() => {
    const lang = navigator.language || navigator.userLanguage;
    if (lang && lang.startsWith('ko')) {
      setIsKorean(true);
    }
  }, []);

  const handleNext = () => {
    setLayoutIndex((prev) => (prev + 1) % LAYOUT_PRESETS.length);
    setFocusTarget(null); // Reset focus on layout change
    setSelectedInfo(null);
  };

  const handlePrev = () => {
    setLayoutIndex((prev) => (prev - 1 + LAYOUT_PRESETS.length) % LAYOUT_PRESETS.length);
    setFocusTarget(null); // Reset focus on layout change
    setSelectedInfo(null);
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
      
      // Calculate Year and Hour from instanceId
      const N = 24;
      const startHour = 12;
      const startHourIdx = Math.floor(startHour / 2);
      
      // instanceId = x * N * N + y * N + z
      // But wait, the loop order in AtlasCubeGrid is x, y, z?
      // Let's check indexArray generation:
      // for x.. for y.. for z.. i++
      // Yes.
      
      const z = instanceId % N;
      const y = Math.floor(instanceId / N) % N;
      const x = Math.floor(instanceId / (N * N));
      
      const year = YEARS[x % 12];
      const hour = HOURS[(z + startHourIdx) % 12];
      
      setSelectedInfo({ year, hour });
  };
  
  const handleBackgroundClick = () => {
      setFocusTarget(null);
      setSelectedInfo(null);
  };

  const currentLayout = LAYOUT_PRESETS[layoutIndex];
  const displayName = isKorean ? (LAYOUT_NAMES_KR[currentLayout.name] || currentLayout.name) : currentLayout.name;
  const subName = isKorean ? currentLayout.name : (LAYOUT_NAMES_KR[currentLayout.name] || "");

  return (
    <S.Container>
      <S.LoadingOverlay $visible={loading} />
      
      <Canvas 
        camera={{ position: [0, 0, 100], fov: 60 }}
        onPointerMissed={handleBackgroundClick}
      >
        <color attach="background" args={["#000"]} />
        <AtlasCubeGrid 
            layoutIndex={layoutIndex} 
            onLoad={() => setLoading(false)} 
            onCubeClick={handleCubeClick}
        />
        <OrbitControls 
            ref={controlsRef}
            enablePan={false} 
            enableZoom={true} 
            minDistance={10} 
            maxDistance={300}
            autoRotate={!useGyro} // Keep rotating even if focused, unless gyro is on
            autoRotateSpeed={0.5}
            enabled={!useGyro} // Disable OrbitControls when Gyro is on to avoid conflict
        />
        {useGyro && <DeviceOrientationControls />}
        <CameraAnimator targetPosition={focusTarget} controlsRef={controlsRef} />
        
      </Canvas>

      <S.UIOverlay>
        <S.LanguageToggle onClick={() => setIsKorean(!isKorean)}>
          {isKorean ? "EN" : "KR"}
        </S.LanguageToggle>
        
        {selectedInfo && (
            <S.SelectionInfo>
                <S.SelectionTitle>
                    {isKorean ? "선택된 기록" : "Selected Record"}
                </S.SelectionTitle>
                <S.SelectionDetail>
                    {selectedInfo.year}
                    <span>{isKorean ? "불광천" : "Bulgwangcheon"}</span>
                </S.SelectionDetail>
                <S.SelectionDetail>
                    {selectedInfo.hour}
                </S.SelectionDetail>
            </S.SelectionInfo>
        )}

        <S.BottomControls>
            <S.LayoutSelector>
                <S.InfoIcon onClick={() => setShowInfo(true)}>
                    i
                </S.InfoIcon>
                
                <S.ArrowButton onClick={handlePrev}>←</S.ArrowButton>
                
                <S.LayoutInfo>
                    <S.LayoutName>{displayName}</S.LayoutName>
                    {subName && <S.LayoutSub>{subName}</S.LayoutSub>}
                </S.LayoutInfo>
                
                <S.ArrowButton onClick={handleNext}>→</S.ArrowButton>
                
                <S.ShakeButton onClick={handleGyroToggle} style={{  }}>
                    <svg viewBox="0 0 24 24">
                        <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-4.2-5.78v1.75l3.2-1.79c.05-.03.09-.07.12-.12.03-.04.05-.09.05-.15 0-.1-.05-.2-.13-.26l-3.24-2.16v1.75c-3.09-.46-4.63-2.79-4.63-2.79 1.1 3.72 4.63 3.77 4.63 3.77z"/>
                    </svg>
                </S.ShakeButton>
            </S.LayoutSelector>
        </S.BottomControls>
        
        {showInfo && (
            <S.InfoModalOverlay onClick={() => setShowInfo(false)}>
                <S.InfoModal onClick={e => e.stopPropagation()}>
                    <S.CloseButton onClick={() => setShowInfo(false)}>×</S.CloseButton>
                    <S.ModalLabel>Artwork Name</S.ModalLabel>
                    <S.ModalTitle>
                        GTNSODCSICSHECPCCOSPSEPABTDANGODCITAOGAIGV1GIOBSOEDSF1T2AF0HT2HCA1B1PPWFTCIOTDIAWPATGAIWFTBOTDCSENOANABAANATCMIAITAONAAPEONMAALMT(GenerativeTopologicalNavigationStudyOfDifferentCoordinateSystemsIncludingCubeSphereCylinderHelixEllipticCylindricalParabolicCylindricalConicalOblateSpheroidalProlateSpheroidalEllipsoidalParaboloidalAndBisphericalToDefineANewGrammarOfDatabaseCinemaInTheAgeOfGenerativeAIGeneratedVia144GenerativeImagesOfBulgwangcheonStreamOfEunpyeongDistrictSeoulFrom1915To2025AndFrom00HrTo22HrCreatingA12By12ParametricPlaneWhichFormsTheConceptualInterpretationOfTemporalDimensionInAssociationWithParametricApproachToGenerativeAIWhichFormsTheBasisOfTheseDifferentCoordinateSystemsEstablishingNotOnlyANewAestheticButAlsoANewApproachToCreatingMovingImageAndInterpretingTheActOfNavigationAsAProvocativeExpressionOfNewMediaArtAsLevManovichTheorised)
                    </S.ModalTitle>
                    <S.ModalContent>
                        {isKorean ? (
                            <>
                                <h3>국문 요약</h3>
                                <p>
                                    본 프로젝트는 큐브, 구, 원통, 나선, 타원 원통, 포물선 원통, 원뿔, 편구, 장구, 타원체, 포물면, 그리고 이구 좌표계(Bispherical) 등 다양한 좌표계를 활용한 <strong>생성형 위상학적 내비게이션(Generative Topological Navigation)</strong> 연구입니다.
                                </p>
                                <p>
                                    이 작업은 생성형 AI 시대에 <strong>"데이터베이스 시네마(Database Cinema)"의 새로운 문법</strong>을 정의하는 것을 목표로 합니다. 작품의 시각적 기반은 서울 은평구 <strong>불광천</strong>의 모습을 담은 <strong>144장의 생성형 이미지</strong>로 구성되며, 이는 <strong>1915년부터 2025년</strong>까지의 연도와 <strong>00시부터 22시</strong>까지의 시간을 축으로 하는 <strong>12x12 파라메트릭 평면(Parametric Plane)</strong>을 형성합니다.
                                </p>
                                <p>
                                    이러한 구조는 생성형 AI의 파라메트릭 접근 방식과 다양한 좌표계의 수학적 기초를 결합하여 시간적 차원을 개념적으로 해석합니다. 결과적으로 이 작품은 새로운 미학을 정립할 뿐만 아니라 무빙 이미지를 제작하는 새로운 접근 방식을 제시하며, <strong>레프 마노비치(Lev Manovich)</strong>가 이론화한 바와 같이 <strong>'내비게이션(탐색) 행위'</strong> 자체를 뉴미디어 아트의 도발적인 표현 양식으로 해석합니다.
                                </p>

                                <h3>Generative Topological Navigation</h3>
                                <p>
                                    : A Study of Coordinate Systems and Database Cinema
                                </p>
                                <p>
                                    This project presents a <strong>Generative Topological Navigation Study</strong> utilizing a comprehensive array of distinct coordinate systems—specifically Cube, Sphere, Cylinder, Helix, Elliptic Cylindrical, Parabolic Cylindrical, Conical, Oblate Spheroidal, Prolate Spheroidal, Ellipsoidal, Paraboloidal, and Bispherical frameworks.
                                </p>
                                <p>
                                    The primary objective is to define a <strong>new grammar of "Database Cinema"</strong> in the age of Generative AI. The visual foundation of this work consists of <strong>144 generative images</strong> depicting the <strong>Bulgwangcheon Stream</strong> in the Eunpyeong District of Seoul. These images are structured within a <strong>12x12 parametric plane</strong>, mapping a historical timeline from <strong>1915 to 2025</strong> (x-axis) and a daily cycle from <strong>00:00 to 22:00</strong> (y-axis).
                                </p>
                                <p>
                                    This grid forms a conceptual interpretation of the temporal dimension, intrinsically linking the parametric nature of generative AI to the mathematical basis of the diverse coordinate systems employed. By navigating this latent space, the project establishes not only a new aesthetic but also a novel approach to creating moving images. Ultimately, it reinterprets the act of <strong>navigation as a provocative expression of New Media Art</strong>, expanding upon the theoretical frameworks originally proposed by <strong>Lev Manovich</strong>.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3>Generative Topological Navigation</h3>
                                <p>
                                    : A Study of Coordinate Systems and Database Cinema
                                </p>
                                <p>
                                    This project presents a <strong>Generative Topological Navigation Study</strong> utilizing a comprehensive array of distinct coordinate systems—specifically Cube, Sphere, Cylinder, Helix, Elliptic Cylindrical, Parabolic Cylindrical, Conical, Oblate Spheroidal, Prolate Spheroidal, Ellipsoidal, Paraboloidal, and Bispherical frameworks.
                                </p>
                                <p>
                                    The primary objective is to define a <strong>new grammar of "Database Cinema"</strong> in the age of Generative AI. The visual foundation of this work consists of <strong>144 generative images</strong> depicting the <strong>Bulgwangcheon Stream</strong> in the Eunpyeong District of Seoul. These images are structured within a <strong>12x12 parametric plane</strong>, mapping a historical timeline from <strong>1915 to 2025</strong> (x-axis) and a daily cycle from <strong>00:00 to 22:00</strong> (y-axis).
                                </p>
                                <p>
                                    This grid forms a conceptual interpretation of the temporal dimension, intrinsically linking the parametric nature of generative AI to the mathematical basis of the diverse coordinate systems employed. By navigating this latent space, the project establishes not only a new aesthetic but also a novel approach to creating moving images. Ultimately, it reinterprets the act of <strong>navigation as a provocative expression of New Media Art</strong>, expanding upon the theoretical frameworks originally proposed by <strong>Lev Manovich</strong>.
                                </p>

                                <h3>국문 요약</h3>
                                <p>
                                    본 프로젝트는 큐브, 구, 원통, 나선, 타원 원통, 포물선 원통, 원뿔, 편구, 장구, 타원체, 포물면, 그리고 이구 좌표계(Bispherical) 등 다양한 좌표계를 활용한 <strong>생성형 위상학적 내비게이션(Generative Topological Navigation)</strong> 연구입니다.
                                </p>
                                <p>
                                    이 작업은 생성형 AI 시대에 <strong>"데이터베이스 시네마(Database Cinema)"의 새로운 문법</strong>을 정의하는 것을 목표로 합니다. 작품의 시각적 기반은 서울 은평구 <strong>불광천</strong>의 모습을 담은 <strong>144장의 생성형 이미지</strong>로 구성되며, 이는 <strong>1915년부터 2025년</strong>까지의 연도와 <strong>00시부터 22시</strong>까지의 시간을 축으로 하는 <strong>12x12 파라메트릭 평면(Parametric Plane)</strong>을 형성합니다.
                                </p>
                                <p>
                                    이러한 구조는 생성형 AI의 파라메트릭 접근 방식과 다양한 좌표계의 수학적 기초를 결합하여 시간적 차원을 개념적으로 해석합니다. 결과적으로 이 작품은 새로운 미학을 정립할 뿐만 아니라 무빙 이미지를 제작하는 새로운 접근 방식을 제시하며, <strong>레프 마노비치(Lev Manovich)</strong>가 이론화한 바와 같이 <strong>'내비게이션(탐색) 행위'</strong> 자체를 뉴미디어 아트의 도발적인 표현 양식으로 해석합니다.
                                </p>
                            </>
                        )}
                        
                        <p style={{ marginTop: '30px', fontSize: '12px', opacity: 0.5 }}>
                            Jeanyoon Choi (최정윤) | Kaist XD Lab<br/>
                            <a href="https://www.portfolio-jyc.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>
                                www.portfolio-jyc.org
                            </a>
                        </p>
                        
                        <S.CancelButton onClick={() => setShowInfo(false)}>
                            Close
                        </S.CancelButton>
                    </S.ModalContent>
                </S.InfoModal>
            </S.InfoModalOverlay>
        )}
      </S.UIOverlay>
    </S.Container>
  );
}
