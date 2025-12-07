import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, useTexture } from "@react-three/drei";
import * as THREE from "three";
import styled from "styled-components";

// --- Constants ---
const YEARS = Array.from({ length: 12 }, (_, i) => 1915 + i * 10);
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);

// Dummy images from public/generated-img/test
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

// --- 3D Components ---

import { Html } from "@react-three/drei";
import { Suspense } from "react";

function CubeGrid({ onHover, onClick }) {
  // Load all textures
  // useTexture will suspend until all are loaded.
  const textures = useTexture(IMAGE_PATHS);
  
  // Group data by texture index
  const groups = useMemo(() => {
    const g = Array.from({ length: IMAGE_PATHS.length }, () => []);
    
    let idx = 0;
    for (let x = 0; x < 12; x++) { // Year
      for (let y = 0; y < 12; y++) { // Month
        for (let z = 0; z < 12; z++) { // Hour
          const textureIndex = idx % IMAGE_PATHS.length;
          g[textureIndex].push({
            x: x - 5.5, // Center the grid
            y: y - 5.5,
            z: z - 5.5,
            year: YEARS[x],
            month: MONTHS[y],
            hour: HOURS[z],
            id: idx
          });
          idx++;
        }
      }
    }
    return g;
  }, []);

  return (
    <>
      {groups.map((data, i) => (
        <TextureGroup 
          key={i} 
          texture={textures[i]} 
          data={data} 
          onHover={onHover}
          onClick={onClick}
        />
      ))}
    </>
  );
}

function TextureGroup({ texture, data, onHover, onClick }) {
  const meshRef = useRef();
  useEffect(() => {
    if (!meshRef.current) return;
    
    const tempObject = new THREE.Object3D();
    data.forEach((item, i) => {
      tempObject.position.set(item.x * 1.2, item.y * 1.2, item.z * 1.2); // 1.2 spacing
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data]);

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, data.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const instanceId = e.instanceId;
        if (instanceId !== undefined && data[instanceId]) {
          onHover(data[instanceId]);
        }
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const instanceId = e.instanceId;
        if (instanceId !== undefined && data[instanceId]) {
          onClick(data[instanceId]);
        }
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial map={texture} />
    </instancedMesh>
  );
}

function Loader() {
  return (
    <Html center>
      <div style={{ color: 'white', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '10px' }}>
        Loading 1728 cubes...
      </div>
    </Html>
  );
}

export default function Vis10k() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const activeItem = hovered || selected;

  return (
    <Container>
      <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
        <color attach="background" args={['#111']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        <Suspense fallback={<Loader />}>
          <CubeGrid onHover={setHovered} onClick={setSelected} />
        </Suspense>
        
        <OrbitControls enableDamping />
        <gridHelper args={[30, 30, 0x444444, 0x222222]} position={[0, -8, 0]} />
      </Canvas>

      <Overlay>
        <Title>10k Visualization</Title>
        <Info>
          Total Cubes: 12 x 12 x 12 = 1728<br/>
          <br/>
          {activeItem ? (
            <>
              <strong>Year:</strong> {activeItem.year}<br/>
              <strong>Month:</strong> {activeItem.month}<br/>
              <strong>Hour:</strong> {activeItem.hour}<br/>
              <strong>ID:</strong> {activeItem.id}
            </>
          ) : (
            "Hover over a cube to see details"
          )}
        </Info>
      </Overlay>
    </Container>
  );
}
