import { useState, useEffect, Suspense, useMemo } from "react";
import styled from "styled-components";
import dynamic from "next/dynamic";

const Container = styled.div`
  ${({ theme }) => theme.WholeContainer || `
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
  `}
  background: black;
  color: white;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  font-family: Inter, sans-serif;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  font-family: Inter, sans-serif;
  text-align: center;
`;

const MetadataInfo = styled.div`
  position: fixed;
  top: 1rem;
  left: 1rem;
  background: rgba(0, 0, 0, 0.8);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-family: 'Inter', monospace;
  font-size: 0.75rem;
  z-index: 1000;
  opacity: 0.7;
  transition: opacity 0.3s ease;
  
  &:hover {
    opacity: 1;
  }
`;

function LoadingFallback({ metadata }) {
  return (
    <LoadingContainer>
      <div>Loading {metadata.title}...</div>
      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        Path: {metadata.fullPath}
      </div>
    </LoadingContainer>
  );
}

function ErrorFallback({ metadata, error }) {
  return (
    <ErrorContainer>
      <div>Failed to load: {metadata.title}</div>
      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
        Path: {metadata.fullPath}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#ff6b6b', maxWidth: '80%' }}>
        {error || 'Component not found or failed to load'}
      </div>
      <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '1rem' }}>
        Make sure the component exists at the expected path
      </div>
    </ErrorContainer>
  );
}

export default function ShibuyaViewer({ componentPath, metadata }) {
  const [error, setError] = useState(null);
  const [showMetadata, setShowMetadata] = useState(false);

  // Create the dynamic component with error handling
  const DynamicComponent = useMemo(() => {
    try {
      return dynamic(
        () => import(`../${componentPath.replace('components/', '')}`).catch(err => {
          console.error(`Failed to load component: ${componentPath}`, err);
          setError(err.message || 'Component not found');
          throw err;
        }),
        {
          loading: () => <LoadingFallback metadata={metadata} />,
          ssr: false
        }
      );
    } catch (err) {
      console.error(`Error creating dynamic component: ${componentPath}`, err);
      setError(err.message || 'Failed to create component');
      return null;
    }
  }, [componentPath, metadata]);

  // Reset error when componentPath changes
  useEffect(() => {
    setError(null);
  }, [componentPath]);

  // Keyboard shortcut to toggle metadata
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'i' && e.ctrlKey) {
        e.preventDefault();
        setShowMetadata(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (error || !DynamicComponent) {
    return (
      <Container>
        <ErrorFallback metadata={metadata} error={error} />
      </Container>
    );
  }

  return (
    <Container>
      {showMetadata && (
        <MetadataInfo>
          <div><strong>{metadata.title}</strong></div>
          <div>Category: {metadata.category}</div>
          {metadata.subcategory && <div>Subcategory: {metadata.subcategory}</div>}
          <div>ID: {metadata.id}</div>
          <div>Path: {componentPath}</div>
          <div style={{ fontSize: '0.6rem', marginTop: '0.5rem', opacity: 0.7 }}>
            Press Ctrl+I to toggle
          </div>
        </MetadataInfo>
      )}
      
      <Suspense fallback={<LoadingFallback metadata={metadata} />}>
        <DynamicComponent />
      </Suspense>
    </Container>
  );
} 