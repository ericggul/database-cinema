import styled from "styled-components";

export const Container = styled.div`
  width: 100vw;
  height: 100vh;
  overflow-y: auto;
  background: black;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: white;
  font-family: monospace;
  box-sizing: border-box;
`;

export const Title = styled.h1`
  margin-bottom: 30px;
  font-size: 24px;
`;

export const Controls = styled.div`
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 1200px;
`;

export const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Label = styled.label`
  font-size: 12px;
  color: #888;
`;

export const Select = styled.select`
  background: #222;
  color: white;
  border: 1px solid #444;
  padding: 10px;
  border-radius: 4px;
  font-family: inherit;
  outline: none;
  min-width: 150px;

  &:focus {
    border-color: #666;
  }
`;

export const Input = styled.input`
  background: #222;
  color: white;
  border: 1px solid #444;
  padding: 10px;
  border-radius: 4px;
  font-family: inherit;
  outline: none;
  min-width: 150px;

  &:focus {
    border-color: #666;
  }
`;

export const GenerateButton = styled.button`
  background: white;
  color: black;
  border: none;
  padding: 12px 30px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  font-size: 16px;
  transition: opacity 0.2s;
  margin-top: 10px;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const PreviewContainer = styled.div`
  display: flex;
  gap: 24px;
  width: 100%;
  max-width: 1200px;
  justify-content: center;
  flex-wrap: wrap;
`;

export const ImageBox = styled.div`
  width: 512px;
  height: 512px;
  border: 1px solid #333;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #111;
  position: relative;
`;

export const StyledImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

export const ImageLabel = styled.div`
  position: absolute;
  top: -25px;
  left: 0;
  color: #888;
`;

export const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

export const ResultsContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const ScrollArea = styled.div`
  width: 100%;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 6px;

  scrollbar-width: thin;
  scrollbar-color: #444 #111;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-track {
    background: #111;
  }
`;

export const BatchStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(12, minmax(120px, 1fr));
  gap: 6px;
  width: 100%;
`;

export const BatchCard = styled.div`
  background: #111;
  border: 1px solid #222;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
`;

export const BatchLabel = styled.div`
  font-size: 12px;
  color: #aaa;
`;

export const Thumb = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

export const ThumbPlaceholder = styled.div`
  color: #555;
  font-size: 11px;
  text-align: center;
  padding: 4px;
`;

export const StatusBadge = styled.div`
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #fff;
  background: ${(p) =>
    p.$status === "done"
      ? "#2e8b57"
      : p.$status === "running"
      ? "#b8860b"
      : p.$status === "error"
      ? "#8b0000"
      : "#444"};
`;

