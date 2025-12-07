import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, PerspectiveCamera, OrthographicCamera } from "@react-three/drei";
import { useControls, Leva } from "leva";
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
  
  for (let i = 0; i < count; i++) {
    let x, y, z;

    switch (type) {
      case 'Sphere': {
        // Fibonacci Sphere
        const phi = Math.acos(1 - 2 * (i + 0.5) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = N * spacing * 0.6; 
        
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
        break;
      }

      case 'Cylinder': {
        // Dynamic Cylinder Layout
        // 1. Calculate Radius
        const r = N * spacing * 0.4;
        
        // 2. Calculate Circumference
        const circumference = 2 * Math.PI * r;
        
        // 3. Determine items per turn (based on cubeSize + gap)
        const itemWidth = cubeSize * 1.2; // 20% gap
        const itemsPerTurn = circumference / itemWidth;
        
        // 4. Calculate total turns needed
        const totalTurns = count / itemsPerTurn;
        
        // 5. Calculate Height
        const verticalSpacing = cubeSize * 1.2;
        const totalHeight = totalTurns * verticalSpacing;
        
        const theta = (i / count) * Math.PI * 2 * totalTurns;
        const h = (i / count) * totalHeight - (totalHeight / 2);
        
        x = r * Math.cos(theta);
        y = h;
        z = r * Math.sin(theta);
        break;
      }

      case 'Helix': {
        const r = N * spacing * 0.3;
        const theta = i * 0.2; 
        const h = (i / count) * N * spacing * 3 - (N * spacing * 1.5);
        
        x = r * Math.cos(theta);
        y = h;
        z = r * Math.sin(theta);
        break;
      }

      case 'Scatter': {
        const seed = i * 123.45;
        const rand = (n) => Math.sin(seed * n) * 43758.5453 % 1;
        const range = N * spacing;
        
        x = (rand(1) - 0.5) * range * 2;
        y = (rand(2) - 0.5) * range * 2;
        z = (rand(3) - 0.5) * range * 2;
        break;
      }
      
      default: // Should not happen for Cube as it's handled separately
        x = 0; y = 0; z = 0;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
};

function AtlasCubeGrid({ onHover, onClick, config }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  const { N, spacing, cubeSize, layout } = config;
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
    
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
           // Position
           pos[i*3] = (x * spacing) - offset;
           pos[i*3+1] = (y * spacing) - offset;
           pos[i*3+2] = (z * spacing) - offset;
           
           // Texture Index
           const yearIdx = x % 12;
           const hourIdx = z % 12;
           idx[i] = (yearIdx * 12) + hourIdx;
           
           i++;
        }
      }
    }
    return { cubePositions: pos, indexArray: idx };
  }, [N, spacing, count]);

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
        const hourIdx = z % 12;
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
        const hourIdx = z % 12;
        
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

// --- Recorder Hook ---
function useRecorder() {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = (canvas) => {
    if (!canvas) return;
    
    const stream = canvas.captureStream(60); 
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
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

export default function VisInteractive() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const activeItem = hovered || selected;
  
  const { recording, startRecording, stopRecording } = useRecorder();
  const [recordMode, setRecordMode] = useState(false);

  // --- Leva Controls ---
  const config = useControls({
    layout: { options: ['Cube', 'Sphere', 'Cylinder', 'Helix', 'Scatter'], value: 'Cube' },
    N: { value: 24, min: 1, max: 24, step: 1, label: "Grid Size (N)" },
    spacing: { value: 3, min: 0.1, max: 5.0, step: 0.1 },
    cubeSize: { value: 1.0, min: 0.1, max: 2.0, step: 0.1 },
  });

  // Window width for scaling
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1000);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scale = recordMode ? windowWidth / 6480 : 1;

  return (
    <Container>
      <Leva collapsed={false} /> 
      
      <div style={{
        width: '100vw',
        height: recordMode ? `${432 * scale}px` : '100vh',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        border: recordMode ? '2px solid red' : 'none',
        transition: 'height 0.3s ease',
        background: '#000', // Black background for letterboxing effect
      }}>
        <div style={{
          width: recordMode ? '6480px' : '100vw',
          height: recordMode ? '432px' : '100vh',
          transform: recordMode ? `scale(${scale})` : 'none',
          transformOrigin: 'center center',
          flexShrink: 0, 
        }}>
          <Canvas 
            gl={{ preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              window._canvas = gl.domElement;
            }}
          >
            <color attach="background" args={['#111']} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            
            <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={50} />

            <AtlasCubeGrid 
              onHover={setHovered} 
              onClick={setSelected} 
              config={config}
            />
            
            <OrbitControls enableDamping target={[0, 0, 0]} />
          </Canvas>
        </div>
      </div>

      <Overlay>
        <Title>Interactive Grid (Jan Bulgwangcheon)</Title>
        <Info>
          Grid: {config.N} x {config.N} x {config.N}<br/>
          Total: {config.N ** 3}<br/>
          Layout: {config.layout}<br/>
          <br/>
          {activeItem ? (
            <>
              <strong>Year:</strong> {activeItem.year}<br/>
              <strong>Month:</strong> {activeItem.month}<br/>
              <strong>Hour:</strong> {activeItem.hour}<br/>
              <strong>ID:</strong> {activeItem.id}<br/>
              <strong>Pos:</strong> {activeItem.gridPos.x}, {activeItem.gridPos.y}, {activeItem.gridPos.z}
            </>
          ) : (
            "Hover over a cube"
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
            {recordMode ? "Exit Record Mode" : "Enter Record Mode (6480x432)"}
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
              {recording ? "Stop Recording" : "Start Recording"}
            </button>
          )}
        </div>
      </Overlay>
    </Container>
  );
}
