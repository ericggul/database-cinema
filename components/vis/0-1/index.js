import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import styled from "styled-components";

// --- Constants ---
const YEARS = Array.from({ length: 12 }, (_, i) => 1915 + i * 10);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// Dummy images
const IMAGE_FILES = [
  "1995_01_00.png", "1995_01_02.png", "1995_01_04.png", "1995_01_06.png",
  "1995_01_08.png", "1995_01_10.png", "1995_01_12.png", "1995_01_14.png",
  "1995_01_16.png", "1995_01_18.png", "1995_01_20.png", "1995_01_22.png",
  "1995_02_00.png", "1995_02_02.png", "1995_02_04.png", "1995_02_06.png",
  "1995_02_08.png", "1995_02_10.png", "1995_02_12.png", "1995_02_14.png",
  "1995_02_16.png", "1995_02_18.png", "1995_02_20.png", "1995_02_22.png",
  "1995_03_00.png", "1995_03_02.png", "1995_03_04.png", "1995_03_06.png",
  "1995_03_08.png", "1995_03_10.png", "1995_03_12.png", "1995_03_14.png",
  "1995_03_16.png"
];
const IMAGE_PATHS = IMAGE_FILES.map(f => `/generated-img/test/${f}`);

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
  // Calculate grid size (e.g., sqrt(33) -> 6x6)
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  
  // We'll use a fixed size for each cell to keep it simple
  const cellSize = 512; // 512px per image
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');
  
  // Load all images
  const images = await Promise.all(
    urls.map(url => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    }))
  );
  
  // Draw images to canvas
  images.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(img, col * cellSize, row * cellSize, cellSize, cellSize);
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
    uGridSize: { value: new THREE.Vector2(1, 1) } // cols, rows
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
      // Calculate which cell to use
      float cols = uGridSize.x;
      float rows = uGridSize.y;
      
      // Index to grid coordinates
      float col = mod(vIndex, cols);
      float row = floor(vIndex / cols);
      
      // Scale UV to cell size
      vec2 cellUv = vUv / vec2(cols, rows);
      
      // Offset UV to correct cell
      // Note: Texture coordinates usually start bottom-left in GLSL, but canvas drawImage is top-left.
      // Three.js textures are usually flipped Y. Let's assume standard top-left mapping for now and adjust if needed.
      // Actually, let's just do simple grid math.
      
      // If texture is standard UV (0,0 bottom-left), and we drew row 0 at top...
      // Let's assume we need to flip Y for the row calculation if standard UVs are used.
      // For now, let's try standard mapping:
      // x offset = col / cols
      // y offset = (rows - 1.0 - row) / rows  <-- flip row for GLSL bottom-up
      
      vec2 offset = vec2(col / cols, (rows - 1.0 - row) / rows);
      
      vec4 color = texture2D(uAtlas, cellUv + offset);
      gl_FragColor = color;
    }
  `
};

function AtlasCubeGrid({ onHover, onClick }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  // Generate Atlas
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      // texture.flipY = false; // Match canvas coords? Let's try default first.
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);
  
  // Prepare Instance Data
  const { count, tempObject, colorArray, indexArray } = useMemo(() => {
    const count = 12 * 12 * 12;
    const tempObject = new THREE.Object3D();
    const indexArray = new Float32Array(count);
    
    let i = 0;
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) {
        for (let z = 0; z < 12; z++) {
          // Assign a texture index (0 to 32)
          // We cycle through the 33 images
          indexArray[i] = i % IMAGE_PATHS.length;
          i++;
        }
      }
    }
    
    return { count, tempObject, indexArray };
  }, []);

  // Update Instances
  useEffect(() => {
    if (!meshRef.current || !atlas) return;
    
    let i = 0;
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) {
        for (let z = 0; z < 12; z++) {
          tempObject.position.set(x - 5.5, y - 5.5, z - 5.5);
          tempObject.position.multiplyScalar(1.2);
          tempObject.updateMatrix();
          meshRef.current.setMatrixAt(i, tempObject.matrix);
          i++;
        }
      }
    }
    
    // Set the attribute
    meshRef.current.geometry.setAttribute(
      'aAtlasIndex',
      new THREE.InstancedBufferAttribute(indexArray, 1)
    );
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [atlas, indexArray, tempObject]); // Only update when atlas is ready (and thus we are ready to render)

  if (!atlas) return <Html center>Generating Atlas...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        // Reverse engineer data from id
        // i = x*144 + y*12 + z ... wait, loop order:
        // x(0..11) -> y(0..11) -> z(0..11)
        // i increments every z loop
        const z = id % 12;
        const y = Math.floor((id / 12)) % 12;
        const x = Math.floor(id / 144);
        
        onHover({
          year: YEARS[x],
          month: MONTHS[y],
          hour: HOURS[z],
          id: id,
          textureIndex: indexArray[id]
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
    
    const stream = canvas.captureStream(60); // 60 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5 Mbps
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
      a.download = `recording_${Date.now()}.webm`;
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

export default function VisAtlas() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const activeItem = hovered || selected;
  
  // Recording state
  const { recording, startRecording, stopRecording } = useRecorder();
  const [recordMode, setRecordMode] = useState(false); // Toggle 432x1840 size

  return (
    <Container>
      {/* Canvas Container that can be resized for recording */}
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
          gl={{ preserveDrawingBuffer: true }} // Required for recording
          onCreated={({ gl }) => {
            // Expose canvas for recording
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
        <Title>Texture Atlas Visualization</Title>
        <Info>
          Total Cubes: 1728<br/>
          Draw Calls: 1<br/>
          <br/>
          {activeItem ? (
            <>
              <strong>Year:</strong> {activeItem.year}<br/>
              <strong>Month:</strong> {activeItem.month}<br/>
              <strong>Hour:</strong> {activeItem.hour}<br/>
              <strong>ID:</strong> {activeItem.id}<br/>
              <strong>Tex ID:</strong> {activeItem.textureIndex}
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
