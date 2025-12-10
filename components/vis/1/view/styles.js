import styled from "styled-components";

export const Container = styled.div`
  width: 100vw;
  height: 100vh;
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const RecordContainer = styled.div`
  position: relative;
  width: 420px;
  height: 432px;
  background: #0D0D0D;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
`;

// Top: Angle (r, theta, phi)
export const TopSection = styled.div`
  position: absolute;
  top: 40px; /* Adjusted for visual balance */
  width: 100%;
  display: flex;
  justify-content: center;
`;

export const AngleText = styled.div`
  font-style: normal;
  font-weight: 500;
  font-size: 20px;
  line-height: 26px;
  text-align: center;
  color: #F5F5F5;
`;

// Middle: Names
export const MiddleSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px; /* Space between Korean and English */
`;

export const NameKr = styled.div`
  width: 303px;
  height: 67px;
  font-style: normal;
  font-weight: 500;
  font-size: 60px;
  line-height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #F5F5F5;
  white-space: nowrap;
`;

export const NameEn = styled.div`
  width: 303px;
  height: 67px;
  font-style: normal;
  font-weight: 500;
  font-size: 60px;
  line-height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #F5F5F5;
  text-transform: uppercase;
`;

// Bottom: Dimensions
export const BottomSection = styled.div`
  position: absolute;
  bottom: 40px; /* Adjusted for visual balance */
  width: 100%;
  display: flex;
  justify-content: center;
`;

export const DimensionsText = styled.div`
  font-style: normal;
  font-weight: 500;
  font-size: 20px;
  line-height: 26px;
  text-align: center;
  color: #F5F5F5;
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
`;
