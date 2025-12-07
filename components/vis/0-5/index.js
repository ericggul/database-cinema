import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
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

// --- Rubik's Logic ---

const N = 12;
const SPACING = 1.2;
const OFFSET = (N - 1) * SPACING / 2;

function getInitialCubes() {
  const cubes = [];
  let i = 0;
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        // Texture Index: Year(x) * 12 + Hour(z)
        const textureIndex = (x * 12) + z;
        
        cubes.push({
          id: i++,
          // Logical position (integer coordinates 0..11)
          lx: x, ly: y, lz: z,
          // Physical transform
          position: new THREE.Vector3(
            x * SPACING - OFFSET,
            y * SPACING - OFFSET,
            z * SPACING - OFFSET
          ),
          quaternion: new THREE.Quaternion(),
          textureIndex
        });
      }
    }
  }
  return cubes;
}

function RubiksGrid({ onHover, onClick, isSolving, setIsSolving }) {
  const meshRef = useRef();
  const [atlas, setAtlas] = useState(null);
  
  // Mutable state for animation
  const cubesRef = useRef(getInitialCubes());
  const moveQueueRef = useRef([]); // Queue of moves to execute (for solving)
  const currentMoveRef = useRef(null); // Currently animating move
  const progressRef = useRef(0); // Animation progress 0..1
  
  const currentMoveSpeedRef = useRef(10.0);

  // Generate Atlas
  useEffect(() => {
    createAtlas(IMAGE_PATHS).then(data => {
      const texture = new THREE.CanvasTexture(data.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setAtlas({ texture, cols: data.cols, rows: data.rows });
    }).catch(err => console.error("Atlas generation failed", err));
  }, []);

  // Initialize: Scramble instantly
  useEffect(() => {
    if (!atlas) return;
    scramble();
    updateInstancedMesh();
  }, [atlas]);

  const scramble = () => {
    const moves = [];
    // Generate 60 random moves
    for (let i = 0; i < 60; i++) {
      const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)];
      const index = Math.floor(Math.random() * N); // 0..11
      const dir = Math.random() > 0.5 ? 1 : -1; // 90 deg or -90 deg
      moves.push({ axis, index, dir });
    }
    
    // Apply instantly
    moves.forEach(move => applyMoveInstant(move));
    
    // Store reverse moves for solving
    // We need to reverse the order AND the direction
    const solveMoves = moves.reverse().map(m => ({ ...m, dir: -m.dir }));
    moveQueueRef.current = solveMoves;
  };

  const applyMoveInstant = (move) => {
    const { axis, index, dir } = move;
    const angle = dir * Math.PI / 2;
    const rotation = new THREE.Quaternion();
    rotation.setFromAxisAngle(
      new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), 
      angle
    );

    // Find cubes in this layer
    // We check logical coordinates (lx, ly, lz)
    const cubes = cubesRef.current;
    const layerCubes = cubes.filter(c => {
      if (axis === 'x') return Math.round(c.lx) === index;
      if (axis === 'y') return Math.round(c.ly) === index;
      if (axis === 'z') return Math.round(c.lz) === index;
      return false;
    });

    layerCubes.forEach(c => {
      // Rotate position around center (0,0,0)
      c.position.applyQuaternion(rotation);
      // Rotate orientation
      c.quaternion.premultiply(rotation);
      
      // Update logical coordinates
      // We need to rotate the integer vector (lx-center, ly-center, lz-center)
      const center = (N - 1) / 2;
      const vec = new THREE.Vector3(c.lx - center, c.ly - center, c.lz - center);
      vec.applyAxisAngle(
        new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
        angle
      );
      c.lx = Math.round(vec.x + center);
      c.ly = Math.round(vec.y + center);
      c.lz = Math.round(vec.z + center);
    });
  };

  const updateInstancedMesh = () => {
    if (!meshRef.current) return;
    const tempObj = new THREE.Object3D();
    
    cubesRef.current.forEach((c, i) => {
      tempObj.position.copy(c.position);
      tempObj.quaternion.copy(c.quaternion);
      tempObj.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObj.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  };

  // Animation Loop
  useFrame((state, delta) => {
    if (!isSolving) return;
    
    // If no current move, pop one
    if (!currentMoveRef.current) {
      if (moveQueueRef.current.length === 0) {
        setIsSolving(false); // Done!
        return;
      }
      currentMoveRef.current = moveQueueRef.current.shift();
      progressRef.current = 0;
      
      // Human Touch: Random speed for each move
      // Base speed 12, variance +/- 6 (Range: 6 to 18 moves/sec)
      // Faster moves = higher number
      currentMoveSpeedRef.current = 12.0 + (Math.random() - 0.5) * 12.0; 
      // Clamp minimum speed
      if (currentMoveSpeedRef.current < 6.0) currentMoveSpeedRef.current = 6.0;
    }

    // Animate current move
    const move = currentMoveRef.current;
    const speed = currentMoveSpeedRef.current; 
    progressRef.current += delta * speed;

    if (progressRef.current >= 1) {
      // Finish move
      applyMoveInstant(move); // Snap to final state
      updateInstancedMesh();
      currentMoveRef.current = null;
    } else {
      // Interpolate
      // We need to render the cubes in the active layer with partial rotation
      // And all other cubes static
      
      const { axis, index, dir } = move;
      const angle = dir * Math.PI / 2 * progressRef.current;
      const rotation = new THREE.Quaternion();
      rotation.setFromAxisAngle(
        new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), 
        angle
      );

      const tempObj = new THREE.Object3D();
      
      cubesRef.current.forEach((c, i) => {
        // Check if in layer
        let inLayer = false;
        if (axis === 'x') inLayer = Math.round(c.lx) === index;
        if (axis === 'y') inLayer = Math.round(c.ly) === index;
        if (axis === 'z') inLayer = Math.round(c.lz) === index;

        if (inLayer) {
          // Apply partial rotation
          const pos = c.position.clone().applyQuaternion(rotation);
          const quat = c.quaternion.clone().premultiply(rotation);
          tempObj.position.copy(pos);
          tempObj.quaternion.copy(quat);
        } else {
          // Static
          tempObj.position.copy(c.position);
          tempObj.quaternion.copy(c.quaternion);
        }
        
        tempObj.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObj.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  // Initial attribute setup
  useEffect(() => {
    if (!meshRef.current || !atlas) return;
    
    const count = N * N * N;
    const indexArray = new Float32Array(count);
    cubesRef.current.forEach((c, i) => {
      indexArray[i] = c.textureIndex;
    });
    
    meshRef.current.geometry.setAttribute(
      'aAtlasIndex',
      new THREE.InstancedBufferAttribute(indexArray, 1)
    );
    updateInstancedMesh();
  }, [atlas]);

  if (!atlas) return <Html center>Generating Atlas...</Html>;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, N * N * N]}
      onPointerMove={(e) => {
        e.stopPropagation();
        // Note: ID mapping is tricky because cubes move. 
        // We can use the instanceId to look up the cube in our array.
        const c = cubesRef.current[e.instanceId];
        if (c) {
          // Reverse engineer texture index
          // textureIndex = (Year * 12) + Hour
          const yearIdx = Math.floor(c.textureIndex / 12);
          const hourIdx = c.textureIndex % 12;
          
          onHover({
            year: YEARS[yearIdx],
            hour: HOURS[hourIdx],
            id: c.id,
            logicalPos: { x: c.lx, y: c.ly, z: c.lz }
          });
        }
      }}
      onPointerOut={() => onHover(null)}
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
      a.download = `recording_rubiks_${Date.now()}.webm`;
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

export default function VisRubiks() {
  const [hovered, setHovered] = useState(null);
  const [isSolving, setIsSolving] = useState(false);
  
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
          camera={{ position: [25, 25, 25], fov: 50 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            window._canvas = gl.domElement;
          }}
        >
          <color attach="background" args={['#111']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <RubiksGrid 
            onHover={setHovered} 
            isSolving={isSolving} 
            setIsSolving={setIsSolving}
          />
          
          <OrbitControls enableDamping target={[0, 0, 0]} />
        </Canvas>
      </div>

      <Overlay>
        <Title>Rubik's Cube Solving (July Bulgwangcheon)</Title>
        <Info>
          Status: {isSolving ? "Solving..." : "Scrambled / Solved"}<br/>
          <br/>
          {hovered ? (
            <>
              <strong>Year:</strong> {hovered.year}<br/>
              <strong>Hour:</strong> {hovered.hour}<br/>
              <strong>Pos:</strong> {hovered.logicalPos.x}, {hovered.logicalPos.y}, {hovered.logicalPos.z}
            </>
          ) : (
            "Hover over a cube"
          )}
        </Info>
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto' }}>
          <button 
            onClick={() => setIsSolving(true)}
            disabled={isSolving}
            style={{ 
              padding: '12px', 
              cursor: isSolving ? 'default' : 'pointer',
              background: isSolving ? '#555' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold'
            }}
          >
            {isSolving ? "Solving..." : "Start Solve (~5s)"}
          </button>

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
