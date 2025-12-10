import styled, { keyframes } from "styled-components";

export const Container = styled.div`
  width: 100vw;
  height: 100vh;
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const RecordContainer = styled.div`
  width: 420px;
  height: 432px;
  background: #000;
  color: #fff;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', monospace;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

export const LayoutName = styled.div`
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
  color: #fff;
  transition: opacity 0.3s ease;
`;

export const LayoutNameKr = styled.div`
  font-size: 1.5rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 40px;
  letter-spacing: 0.08em;
`;

export const CubeCount = styled.div`
  font-size: 5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 8px;
  font-variant-numeric: tabular-nums;
  transition: all 0.3s ease;
`;

export const CubeLabel = styled.div`
  font-size: 0.9rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.25em;
`;

export const Controls = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  gap: 10px;
  z-index: 100;
`;

export const Button = styled.button`
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  &.recording {
    background: rgba(255, 0, 0, 0.3);
    border-color: #f00;
  }
`;
