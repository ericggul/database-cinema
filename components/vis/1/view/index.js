import React, { useState, useRef, useEffect } from "react";
import keyframes from "../keyframes3.json";
import {
  Container,
  RecordContainer,
  LayoutName,
  LayoutNameKr,
  CubeCount,
  CubeLabel,
  Controls,
  Button,
} from "./styles";

// Layout name translations (English -> Korean)
const LAYOUT_NAMES_KR = {
  "Cube": "정육면체",
  "Sphere": "구",
  "Cylinder": "원기둥",
  "Helix": "나선",
  "Elliptic Cylinder": "타원 기둥",
  "Parabolic Cylinder": "포물선 기둥",
  "Conical": "원뿔",
  "Oblate Spheroidal": "편구",
  "Prolate Spheroidal": "장구",
  "Ellipsoidal": "타원체",
  "Paraboloidal": "포물면",
  "Bispherical": "쌍구",
};

// Get current config from keyframes based on time
function getConfigAtTime(currentTime) {
  const totalDuration = keyframes[keyframes.length - 1].time;
  
  if (currentTime >= totalDuration) {
    return keyframes[keyframes.length - 1].config;
  }

  // Find current segment
  let startIdx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (currentTime >= keyframes[i].time && currentTime < keyframes[i + 1].time) {
      startIdx = i;
      break;
    }
  }

  // Return start frame config (N and layout are discrete, no interpolation)
  return keyframes[startIdx].config;
}

// --- Recorder Hook ---
function useRecorder(onStart, onStop) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = (element) => {
    if (!element) return;
    
    if (onStart) onStart();

    // Create a canvas to capture the element
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');

    // Use html2canvas-like approach: render DOM to canvas each frame
    const captureFrame = () => {
      // For now, we'll use a simpler approach with a hidden canvas
      // that mirrors the content
    };

    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 10000000,
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
      a.download = `info_panel_${Date.now()}.webm`;
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

export default function InfoPanelView() {
  const [recordMode, setRecordMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [config, setConfig] = useState(keyframes[0].config);
  
  const animationTime = useRef(0);
  const requestRef = useRef(null);
  const startTimeRef = useRef(null);
  const containerRef = useRef(null);

  // Animation loop
  const animate = (time) => {
    if (!startTimeRef.current) startTimeRef.current = time;
    const elapsed = (time - startTimeRef.current) / 1000; // seconds
    animationTime.current = elapsed;

    // Update config based on current time
    const currentConfig = getConfigAtTime(elapsed);
    setConfig(currentConfig);

    if (elapsed < 60) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      stopAnimation();
    }
  };

  const startAnimation = () => {
    animationTime.current = 0;
    startTimeRef.current = null;
    setIsAnimating(true);
    requestRef.current = requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setIsAnimating(false);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const cubeCount = config.N ** 3;

  return (
    <Container>
      <Controls>
        <Button onClick={() => setRecordMode(!recordMode)}>
          {recordMode ? "Exit Record" : "Record Mode"}
        </Button>
        {recordMode && (
          <Button onClick={isAnimating ? stopAnimation : startAnimation}>
            {isAnimating ? "Stop" : "Play"}
          </Button>
        )}
      </Controls>

      <RecordContainer
        ref={containerRef}
        style={{
          border: recordMode ? "2px solid red" : "none",
        }}
      >
        <LayoutName>{config.layout}</LayoutName>
        <LayoutNameKr>
          {LAYOUT_NAMES_KR[config.layout] || config.layout}
        </LayoutNameKr>
        <CubeCount>{cubeCount.toLocaleString()}</CubeCount>
        <CubeLabel>Cubes</CubeLabel>
      </RecordContainer>
    </Container>
  );
}
