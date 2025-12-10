import React, { useState, useRef, useEffect } from "react";
import keyframes from "../keyframes3.json";
import * as THREE from "three";
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

// --- Animation Hooks ---

// Number Lerp Hook
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
      
      // Ease out quart
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

export default function InfoPanelView() {
  const [recordMode, setRecordMode] = useState(false);
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

  // --- Animated Values ---
  const layoutKr = LAYOUT_NAMES_KR[displayData.layout] || displayData.layout;
  
  // Smooth N
  const smoothN = useNumberLerp(displayData.N, 500);
  
  // Format Camera: (r, theta, phi)
  // Use fixed decimals for clean look
  const rVal = displayData.r.toFixed(0);
  const thetaVal = displayData.theta.toFixed(0);
  const phiVal = displayData.phi.toFixed(0);

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
          border: recordMode ? "1px solid #f00" : "none",
        }}
      >
        {/* Top: Angle */}
        <TopSection>
          <AngleText>
            ({rVal}, {thetaVal}, {phiVal})
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
