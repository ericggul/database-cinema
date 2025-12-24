import { useState, useRef, useCallback } from 'react';

export function useFrameRecorder({
  totalFrames = 1800, // Default 60s @ 30fps
  fps = 30,
  onFrame, // (time) => void
  onStart,
  onStop
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  
  const frameRef = useRef(0);
  const isRecordingRef = useRef(false);
  const canvasRef = useRef(null);
  const sequenceNameRef = useRef(null);

  const uploadFrame = useCallback(async (blob, frameIndex) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result;
        try {
          const response = await fetch('/api/save-frame', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sequenceName: sequenceNameRef.current,
              frameIndex,
              image: base64data
            }),
          });
          
          if (!response.ok) {
            throw new Error('Failed to save frame');
          }
          resolve();
        } catch (error) {
          console.error("Upload failed", error);
          reject(error);
        }
      };
      reader.readAsDataURL(blob);
    });
  }, []);

  const processFrame = useCallback(async () => {
    if (!isRecordingRef.current || !canvasRef.current) return;

    const frame = frameRef.current;
    
    if (frame >= totalFrames) {
      stopRecording();
      return;
    }

    // 1. Set Time
    const time = frame / fps;
    if (onFrame) onFrame(time);

    // 2. Wait for Render (Double RAF to ensure GPU commit)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Add settling delay for high quality (anti-aliasing, textures)
        setTimeout(() => {
          // 3. Capture
          canvasRef.current.toBlob(async (blob) => {
            if (blob) {
              try {
                // Wait for upload to finish before moving to next frame
                await uploadFrame(blob, frame);
                
                // 4. Next Frame
                frameRef.current++;
                setCurrentFrame(frameRef.current);
                setProgress((frameRef.current / totalFrames) * 100);
                
                // Loop
                processFrame();
              } catch (err) {
                console.error("Frame processing error", err);
                stopRecording();
              }
            } else {
              console.error("Failed to capture blob");
              stopRecording();
            }
          }, 'image/png', 1.0);
        }, 100); // 100ms delay
      });
    });
  }, [fps, totalFrames, onFrame, uploadFrame]);

  const startRecording = useCallback((canvas, sequenceName) => {
    if (!canvas) {
      console.error("No canvas provided");
      return;
    }
    
    canvasRef.current = canvas;
    isRecordingRef.current = true;
    frameRef.current = 0;
    sequenceNameRef.current = sequenceName || `seq_${Date.now()}`;
    
    setIsRecording(true);
    setCurrentFrame(0);
    setProgress(0);
    
    if (onStart) onStart();
    
    // Start loop
    processFrame();
  }, [onStart, processFrame]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (onStop) onStop();
  }, [onStop]);

  return {
    isRecording,
    progress,
    currentFrame,
    totalFrames,
    startRecording,
    stopRecording
  };
}
