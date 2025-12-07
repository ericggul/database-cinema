import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, PerspectiveCamera, OrthographicCamera } from "@react-three/drei";
import { useControls, Leva } from "leva";
import * as THREE from "three";
import styled from "styled-components";

// --- Constants ---
const YEARS = Array.from({ length: 12 }, (_, i) => 1915 + (i * 10));
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// Generate Image List: Year x Hour (Month is fixed to 07)
const IMAGE_FILES = [];
for (let y = 0; y < 12; y++) {
  const year = YEARS[y];
  for (let h = 0; h < 12; h++) {
    const hour = h * 2;
    const hourStr = String(hour).padStart(2, "0");
    IMAGE_FILES.push(`${year}_07_${hourStr}.png`);
  }
}

const IMAGE_PATHS = IMAGE_FILES.map(f => `/generated-img/July_불광천/${f}`);

// --- Styles ---
const Container = styled.div`
  width: 100vw;
  height: 100vh;
  background: #111;
  color: white;
  position: relative;
`;

const Overlay = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 10;
  max-width: 300px;
`;

const Title = styled.h1`
  font-size: 1.2rem;
  margin: 0 0 10px 0;
  color: #fff;
`;

const Info = styled.div`
  font-size: 0.9rem;
  color: #ccc;
  line-height: 1.5;
`;

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

function AtlasCubeGrid({ onHover, onClick, config }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  const { N, spacing, cubeSize, doubleSide } = config;

  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);
  
  const { count, tempObject, indexArray } = useMemo(() => {
    const count = N * N * N;
    const tempObject = new THREE.Object3D();
    const indexArray = new Float32Array(count);
    
    let i = 0;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          // Cycle through the 144 images (12 Years x 12 Hours)
          // We map x to Year and z to Hour, repeating every 12 units
          const yearIdx = x % 12;
          const hourIdx = z % 12;
          
          const atlasIndex = (yearIdx * 12) + hourIdx;
          indexArray[i] = atlasIndex;
          i++;
        }
      }
    }
    
    return { count, tempObject, indexArray };
  }, [N]); // Re-calculate when N changes

  useEffect(() => {
    if (!meshRef.current || !atlas) return;
    
    let i = 0;
    const offset = (N - 1) * spacing / 2; // Center the grid

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          const xPos = (x * spacing) - offset;
          const yPos = (y * spacing) - offset;
          const zPos = (z * spacing) - offset;
          
          tempObject.position.set(xPos, yPos, zPos);
          tempObject.scale.set(cubeSize, cubeSize, cubeSize);
          tempObject.updateMatrix();
          meshRef.current.setMatrixAt(i, tempObject.matrix);
          i++;
        }
      }
    }
    
    meshRef.current.geometry.setAttribute(
      'aAtlasIndex',
      new THREE.InstancedBufferAttribute(indexArray, 1)
    );
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [atlas, N, spacing, cubeSize]); // Update positions when config changes

  if (!atlas) return <Html center>Generating Atlas...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        
        // Reverse engineer indices
        // i = x*(N*N) + y*N + z
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
        key={doubleSide ? 'double' : 'front'} // Force re-render on side change
        uniforms={{
          uAtlas: { value: atlas.texture },
          uGridSize: { value: new THREE.Vector2(atlas.cols, atlas.rows) }
        }}
        vertexShader={AtlasMaterial.vertexShader}
        fragmentShader={AtlasMaterial.fragmentShader}
        side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
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
    N: { value: 12, min: 1, max: 24, step: 1, label: "Grid Size (N)" },
    spacing: { value: 1.2, min: 0.1, max: 5.0, step: 0.1 },
    cubeSize: { value: 1.0, min: 0.1, max: 2.0, step: 0.1 },
    cameraType: { options: ['Perspective', 'Orthographic'], value: 'Perspective' },
    doubleSide: { value: false, label: "Double Sided" }
  });

  return (
    <Container>
      <Leva collapsed={false} /> {/* Explicitly render Leva panel */}
      
      <div style={{
        width: recordMode ? '1840px' : '100vw',
        height: recordMode ? '432px' : '100vh',
        margin: recordMode ? '0 auto' : '0',
        border: recordMode ? '2px solid red' : 'none',
        position: 'relative',
        transition: 'all 0.3s ease',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
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
          
          {config.cameraType === 'Perspective' ? (
            <PerspectiveCamera makeDefault position={[20, 20, 20]} fov={50} />
          ) : (
            <OrthographicCamera makeDefault position={[20, 20, 20]} zoom={20} />
          )}

          <AtlasCubeGrid 
            onHover={setHovered} 
            onClick={setSelected} 
            config={config}
          />
          
          <OrbitControls enableDamping target={[0, 0, 0]} />
          {/* GridHelper removed as requested */}
        </Canvas>
      </div>

      <Overlay>
        <Title>Interactive Grid (July Bulgwangcheon)</Title>
        <Info>
          Grid: {config.N} x {config.N} x {config.N}<br/>
          Total: {config.N ** 3}<br/>
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
            {recordMode ? "Exit Record Mode" : "Enter Record Mode (1840x432)"}
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
