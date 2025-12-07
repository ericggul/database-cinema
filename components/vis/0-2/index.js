import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import styled from "styled-components";

// --- Constants ---
const YEARS = Array.from({ length: 12 }, (_, i) => 1995 + i); // 1995-2006
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// 144 Images from public/generated-img/1995_북한산
const IMAGE_FILES = [
  "1995_01_00.png", "1995_01_02.png", "1995_01_04.png", "1995_01_06.png", "1995_01_08.png", "1995_01_10.png", "1995_01_12.png", "1995_01_14.png", "1995_01_16.png", "1995_01_18.png", "1995_01_20.png", "1995_01_22.png",
  "1995_02_00.png", "1995_02_02.png", "1995_02_04.png", "1995_02_06.png", "1995_02_08.png", "1995_02_10.png", "1995_02_12.png", "1995_02_14.png", "1995_02_16.png", "1995_02_18.png", "1995_02_20.png", "1995_02_22.png",
  "1995_03_00.png", "1995_03_02.png", "1995_03_04.png", "1995_03_06.png", "1995_03_08.png", "1995_03_10.png", "1995_03_12.png", "1995_03_14.png", "1995_03_16.png", "1995_03_18.png", "1995_03_20.png", "1995_03_22.png",
  "1995_04_00.png", "1995_04_02.png", "1995_04_04.png", "1995_04_06.png", "1995_04_08.png", "1995_04_10.png", "1995_04_12.png", "1995_04_14.png", "1995_04_16.png", "1995_04_18.png", "1995_04_20.png", "1995_04_22.png",
  "1995_05_00.png", "1995_05_02.png", "1995_05_04.png", "1995_05_06.png", "1995_05_08.png", "1995_05_10.png", "1995_05_12.png", "1995_05_14.png", "1995_05_16.png", "1995_05_18.png", "1995_05_20.png", "1995_05_22.png",
  "1995_06_00.png", "1995_06_02.png", "1995_06_04.png", "1995_06_06.png", "1995_06_08.png", "1995_06_10.png", "1995_06_12.png", "1995_06_14.png", "1995_06_16.png", "1995_06_18.png", "1995_06_20.png", "1995_06_22.png",
  "1995_07_00.png", "1995_07_02.png", "1995_07_04.png", "1995_07_06.png", "1995_07_08.png", "1995_07_10.png", "1995_07_12.png", "1995_07_14.png", "1995_07_16.png", "1995_07_18.png", "1995_07_20.png", "1995_07_22.png",
  "1995_08_00.png", "1995_08_02.png", "1995_08_04.png", "1995_08_06.png", "1995_08_08.png", "1995_08_10.png", "1995_08_12.png", "1995_08_14.png", "1995_08_16.png", "1995_08_18.png", "1995_08_20.png", "1995_08_22.png",
  "1995_09_00.png", "1995_09_02.png", "1995_09_04.png", "1995_09_06.png", "1995_09_08.png", "1995_09_10.png", "1995_09_12.png", "1995_09_14.png", "1995_09_16.png", "1995_09_18.png", "1995_09_20.png", "1995_09_22.png",
  "1995_10_00.png", "1995_10_02.png", "1995_10_04.png", "1995_10_06.png", "1995_10_08.png", "1995_10_10.png", "1995_10_12.png", "1995_10_14.png", "1995_10_16.png", "1995_10_18.png", "1995_10_20.png", "1995_10_22.png",
  "1995_11_00.png", "1995_11_02.png", "1995_11_04.png", "1995_11_06.png", "1995_11_08.png", "1995_11_10.png", "1995_11_12.png", "1995_11_14.png", "1995_11_16.png", "1995_11_18.png", "1995_11_20.png", "1995_11_22.png",
  "1995_12_00.png", "1995_12_02.png", "1995_12_04.png", "1995_12_06.png", "1995_12_08.png", "1995_12_10.png", "1995_12_12.png", "1995_12_14.png", "1995_12_16.png", "1995_12_18.png", "1995_12_20.png", "1995_12_22.png"
];
const IMAGE_PATHS = IMAGE_FILES.map(f => `/generated-img/1995_북한산/${f}`);

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
        resolve(null); // Resolve null to keep index sync
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

function AtlasCubeGrid({ onHover, onClick }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);
  
  const { count, tempObject, indexArray } = useMemo(() => {
    const count = 12 * 12 * 12; // 1728 items
    const tempObject = new THREE.Object3D();
    const indexArray = new Float32Array(count);
    
    let i = 0;
    for (let x = 0; x < 12; x++) { // Year
      for (let y = 0; y < 12; y++) { // Month
        for (let z = 0; z < 12; z++) { // Hour
          // Map to 144 images (Month * 12 + Hour)
          // Since we reuse 1995 data for all years
          const atlasIndex = (y * 12) + z;
          indexArray[i] = atlasIndex;
          i++;
        }
      }
    }
    
    return { count, tempObject, indexArray };
  }, []);

  useEffect(() => {
    if (!meshRef.current || !atlas) return;
    
    let i = 0;
    for (let x = 0; x < 12; x++) { // Year
      for (let y = 0; y < 12; y++) { // Month
        for (let z = 0; z < 12; z++) { // Hour
          // Layout: 12x12x12 Cube
          const xPos = x - 5.5;
          const yPos = y - 5.5;
          const zPos = z - 5.5;
          
          tempObject.position.set(xPos * 1.2, yPos * 1.2, zPos * 1.2);
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
  }, [atlas]);

  if (!atlas) return <Html center>Generating Atlas (144 images)...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        // i = x*144 + y*12 + z
        const z = id % 12;
        const y = Math.floor((id / 12)) % 12;
        const x = Math.floor(id / 144);
        
        // Texture index is based on Month/Hour only
        const textureIndex = (y * 12) + z;
        
        onHover({
          year: YEARS[x],
          month: MONTHS[y],
          hour: HOURS[z],
          id: id,
          textureIndex: textureIndex
        });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        const z = id % 12;
        const y = Math.floor((id / 12)) % 12;
        const x = Math.floor(id / 144);
        
        onClick({
          year: YEARS[x],
          month: MONTHS[y],
          hour: HOURS[z],
          id: id
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
      a.download = `recording_1995_${Date.now()}.webm`;
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

export default function Vis1995() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const activeItem = hovered || selected;
  
  const { recording, startRecording, stopRecording } = useRecorder();
  const [recordMode, setRecordMode] = useState(false);

  return (
    <Container>
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
          camera={{ position: [20, 20, 20], fov: 50 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            window._canvas = gl.domElement;
          }}
        >
          <color attach="background" args={['#111']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <AtlasCubeGrid onHover={setHovered} onClick={setSelected} />
          
          <OrbitControls enableDamping target={[0, 0, 0]} />
          <gridHelper args={[30, 30, 0x444444, 0x222222]} position={[0, -8, 0]} />
        </Canvas>
      </div>

      <Overlay>
        <Title>1995 Bukhansan (Scaled to 1728)</Title>
        <Info>
          Grid: 12 (Year) x 12 (Month) x 12 (Hour)<br/>
          (Data reused from 1995)<br/>
          <br/>
          {activeItem ? (
            <>
              <strong>Year:</strong> {activeItem.year}<br/>
              <strong>Month:</strong> {activeItem.month}<br/>
              <strong>Hour:</strong> {activeItem.hour}<br/>
              <strong>ID:</strong> {activeItem.id}
            </>
          ) : (
            "Hover over a cube"
          )}
        </Info>
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto' }}>
          <button 
            onClick={() => setRecordMode(!recordMode)}
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
