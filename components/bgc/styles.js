import styled, { keyframes } from "styled-components";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const Container = styled.div`
  width: 100vw;
  height: 100dvh; /* Mobile viewport fix */
  background-color: #000;
  position: relative;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  color: white;
`;

export const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #000;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: opacity 1s ease-in-out;
  opacity: ${props => props.$visible ? 1 : 0};
  
  &::after {
    content: "LOADING";
    font-size: 12px;
    letter-spacing: 2px;
    opacity: 0.5;
    animation: ${fadeIn} 1s infinite alternate;
  }
`;

export const UIOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Align bottom controls */
  padding: 20px;
  box-sizing: border-box;
`;



export const LanguageToggle = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  pointer-events: auto;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 10px;
  transition: color 0.2s;
  z-index: 30;

  &:hover {
    color: white;
  }
`;

export const BottomControls = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  width: 100%;
  margin-bottom: 20px; /* Space from bottom */
  z-index: 20;
`;

export const LayoutSelector = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between; /* Space out elements */
  gap: 10px;
  padding: 10px 20px;
  border-radius: 30px; /* More rounded */
  width: 90%; /* Wider */
  max-width: 500px; /* Max width constraint */
  
  /* Glass UI */
  background: rgba(30, 30, 30, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
`;

export const ControlGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const ArrowButton = styled.button`
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 8px;
  opacity: 0.7;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 1;
  }
`;

export const LayoutInfo = styled.div`
  text-align: center;
  flex: 1; /* Take up remaining space */
`;

export const LayoutName = styled.div`
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 2px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const LayoutSub = styled.div`
  font-size: 11px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const IconButton = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
  
  svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
`;

export const InfoIcon = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
  font-family: serif;
  font-style: italic;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  width: 36px;
  height: 36px;

  &:hover {
    color: white;
  }
`;

export const ShakeButton = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;

  &:hover {
    color: white;
  }

  svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
`;

export const InfoModalOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  pointer-events: auto;
  animation: ${fadeIn} 0.3s ease-out;
`;

export const InfoModal = styled.div`
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  overflow-y: auto;
  color: white;
  position: relative;
  
  /* Scrollbar styling */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
`;

export const ModalLabel = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
`;

export const ModalTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 15px;
  line-height: 1.4;
  word-break: break-all; /* For the long title */
  opacity: 0.8;
`;

export const ModalContent = styled.div`
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  
  p {
    margin-bottom: 15px;
  }
  
  strong {
    font-weight: 600;
    color: white;
  }
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: white;
    margin: 25px 0 10px 0;
    border-left: 2px solid rgba(255, 255, 255, 0.5);
    padding-left: 10px;
  }
`;

export const CloseButton = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
  }
`;

export const CancelButton = styled.button`
  width: 100%;
  padding: 15px;
  margin-top: 30px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

export const SelectionInfo = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  pointer-events: none;
  z-index: 20;
  text-align: left;
  animation: ${fadeIn} 0.5s ease-out;
  
  /* Glass UI - Modified to avoid screen blur issues */
  background: rgba(20, 20, 20, 0.85); /* Darker, less transparent */
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 15px 20px;
  border-radius: 16px;
`;

export const SelectionTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
`;

export const SelectionDetail = styled.div`
  font-size: 16px;
  font-weight: 400;
  color: white;
  letter-spacing: 0.5px;
  
  span {
    opacity: 0.7;
    font-size: 14px;
    margin-left: 6px;
  }
`;


