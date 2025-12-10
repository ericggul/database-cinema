import styled from "styled-components";

export const Container = styled.div`
  width: 100vw;
  height: 100vh;
  background: #111;
  color: white;
  position: relative;
`;

export const Overlay = styled.div`
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

export const Title = styled.h1`
  font-size: 1.2rem;
  margin: 0 0 10px 0;
  color: #fff;
`;

export const Info = styled.div`
  font-size: 0.9rem;
  color: #ccc;
  line-height: 1.5;
`;
