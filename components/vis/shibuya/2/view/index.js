import React, { useState, useRef, useEffect } from "react";
import keyframes from "../keyframes3.json";
import * as THREE from "three";
import html2canvas from "html2canvas";
import {
  Container,
  RecordContainer,
  TopSection,
  AngleText,
  MiddleSection,
  NameKr,
  NameEn,
  BottomSection,
  DimensionsText,
  Controls,
  Button,
} from "./styles";

// Updated Korean Layout Names (Coordinate Systems)
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

// --- Animation Hooks ---

function useNumberLerp(targetValue, duration = 300, decimals = 0) {
  const [display, setDisplay] = useState(targetValue);
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    startValueRef.current = display;
    startTimeRef.current = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / duration);
      
      const ease = 1 - Math.pow(1 - progress, 4);
      
      const current = startValueRef.current + (targetValue - startValueRef.current) * ease;
      setDisplay(current);

      if (progress < 1) {
        requestRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(targetValue);
      }
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [targetValue, duration]);

  return decimals === 0 ? Math.round(display) : display.toFixed(decimals);
}

// --- Recorder Hook ---
function useRecorder(onStop) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const requestRef = useRef(null);

  const startRecording = (element) => {
    if (!element) {
      console.error("No element to record");
      return;
    }
    
    setRecording(true);
    chunksRef.current = [];

    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');

    // Ensure we have a stream
    const stream = canvas.captureStream(30); 
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 
    });

    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      if (blob.size === 0) {
        console.error("Recording failed: Empty blob");
        alert("Recording failed: No data captured.");
        if (onStop) onStop();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `info_view_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      if (onStop) onStop();
    };

    mediaRecorder.start();

    const captureFrame = async () => {
      if (mediaRecorder.state === 'inactive') return;

      try {
        // html2canvas capture
        const capturedCanvas = await html2canvas(element, {
          backgroundColor: '#0D0D0D', // Explicit background
          width: 420,
          height: 432,
          scale: 1,
          logging: false,
          useCORS: true,
        });
        
        ctx.drawImage(capturedCanvas, 0, 0);
        
        requestRef.current = requestAnimationFrame(captureFrame);
      } catch (err) {
        console.error("Frame capture failed", err);
      }
    };

    captureFrame();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  };

  return { recording, startRecording, stopRecording };
}

export default function InfoPanelView() {
  const [isAnimating, setIsAnimating] = useState(false);
  
  // State for display
  const [displayData, setDisplayData] = useState({
    layout: keyframes[0].config.layout,
    N: keyframes[0].config.N,
    r: keyframes[0].camera.spherical.radius,
    theta: keyframes[0].camera.spherical.theta,
    phi: keyframes[0].camera.spherical.phi,
  });
  
  const animationTime = useRef(0);
  const requestRef = useRef(null);
  const startTimeRef = useRef(null);
  const containerRef = useRef(null);

  // Animation loop
  const animate = (time) => {
    if (!startTimeRef.current) startTimeRef.current = time;
    const elapsed = (time - startTimeRef.current) / 1000; // seconds
    animationTime.current = elapsed;

    // --- Interpolation Logic ---
    const totalDuration = keyframes[keyframes.length - 1].time;
    
    if (elapsed >= totalDuration) {
      stopAnimation();
      return;
    }

    // Find current segment
    let startIdx = 0;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (elapsed >= keyframes[i].time && elapsed < keyframes[i + 1].time) {
        startIdx = i;
        break;
      }
    }
    const endIdx = startIdx + 1;
    const startFrame = keyframes[startIdx];
    const endFrame = keyframes[endIdx];
    
    const duration = endFrame.time - startFrame.time;
    const segmentElapsed = elapsed - startFrame.time;
    
    // Progress Calculation
    let progress;
    if (elapsed >= 14) {
      const DELAY = 1.0; 
      const animDuration = Math.max(0.1, duration - DELAY);
      if (segmentElapsed < DELAY) {
        progress = 0;
      } else {
        progress = Math.min(1, (segmentElapsed - DELAY) / animDuration);
      }
    } else {
      progress = segmentElapsed / duration;
    }
    
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);

    // Interpolate Camera
    const startSph = startFrame.camera.spherical;
    const endSph = endFrame.camera.spherical;
    
    const r = THREE.MathUtils.lerp(startSph.radius, endSph.radius, easedProgress);
    const theta = THREE.MathUtils.lerp(startSph.theta, endSph.theta, easedProgress);
    const phi = THREE.MathUtils.lerp(startSph.phi, endSph.phi, easedProgress);

    // Update State
    setDisplayData({
      layout: startFrame.config.layout,
      N: startFrame.config.N,
      r,
      theta,
      phi
    });

    requestRef.current = requestAnimationFrame(animate);
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

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // --- Recorder ---
  const { recording, startRecording, stopRecording } = useRecorder();

  const handleToggleRecord = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording(containerRef.current);
      // Auto-play animation from 0 when recording starts
      startAnimation();
    }
  };

  // --- Animated Values ---
  const layoutKr = LAYOUT_NAMES_KR[displayData.layout] || displayData.layout;
  
  // Smooth N
  const smoothN = useNumberLerp(displayData.N, 500);
  
  // Format Camera: (r, theta, phi) - 1 Decimal Place
  const rVal = displayData.r.toFixed(1);
  const thetaVal = displayData.theta.toFixed(1);
  const phiVal = displayData.phi.toFixed(1);

  return (
    <Container>
      <Controls>
        <Button onClick={handleToggleRecord} style={{ borderColor: recording ? 'red' : 'rgba(255,255,255,0.3)', color: recording ? 'red' : 'white' }}>
          {recording ? "Stop Recording" : "Record View"}
        </Button>
        <Button onClick={isAnimating ? stopAnimation : startAnimation}>
          {isAnimating ? "Stop Animation" : "Play Animation"}
        </Button>
      </Controls>

      <RecordContainer
        ref={containerRef}
        id="record-container" // ID for easier debugging if needed
        style={{
          border: "none", // Removed red border to prevent it from showing in recording
        }}
      >
        {/* Top: Angle */}
        <TopSection>
          <AngleText>
            ({rVal}, {thetaVal}°, {phiVal}°)
          </AngleText>
        </TopSection>

        {/* Middle: Names */}
        <MiddleSection>
          <NameKr>{layoutKr}</NameKr>
          <NameEn>{displayData.layout}</NameEn>
        </MiddleSection>

        {/* Bottom: Dimensions */}
        <BottomSection>
          <DimensionsText>
            ({smoothN}, {smoothN}, {smoothN})
          </DimensionsText>
        </BottomSection>
      </RecordContainer>
    </Container>
  );
}
