import React, { useState } from "react";
import styled from "styled-components";

const Container = styled.div`
  width: 100vw;
  height: 100vh;
  background: black;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-family: monospace;
`;

const InputContainer = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  z-index: 10;
`;

const Input = styled.input`
  background: transparent;
  border: 1px solid #333;
  color: white;
  padding: 10px;
  width: 300px;
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: #666;
  }
`;

const Button = styled.button`
  background: #333;
  color: white;
  border: none;
  padding: 10px 20px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;

  &:hover {
    background: #444;
  }

  &:disabled {
    background: #222;
    cursor: not-allowed;
    color: #555;
  }
`;

const ImageContainer = styled.div`
  width: 512px;
  height: 512px;
  border: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
`;

const GeneratedImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const LoadingText = styled.div`
  color: #666;
  font-size: 14px;
`;

export default function MobiusContainer0() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;

    setLoading(true);
    setImageUrl(null);

    try {
      const response = await fetch("/api/dalle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (response.ok) {
        setImageUrl(data.imageUrl);
      } else {
        console.error("Error:", data.message);
        alert("Error generating image: " + data.message);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error generating image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <InputContainer>
        <Input
          type="text"
          placeholder="Enter prompt..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating..." : "Generate"}
        </Button>
      </InputContainer>

      <ImageContainer>
        {loading && <LoadingText>Generating image...</LoadingText>}
        {imageUrl && <GeneratedImage src={imageUrl} alt="Generated" />}
        {!loading && !imageUrl && <LoadingText>No image generated</LoadingText>}
      </ImageContainer>
    </Container>
  );
}
