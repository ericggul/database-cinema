import React, { useState } from "react";
import styled from "styled-components";

const Container = styled.div`
  width: 100vw;
  min-height: 100vh;
  background: black;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: white;
  font-family: monospace;
  box-sizing: border-box;
`;

const Title = styled.h1`
  margin-bottom: 30px;
  font-size: 24px;
`;

const Controls = styled.div`
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 800px;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 12px;
  color: #888;
`;

const Select = styled.select`
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

const Input = styled.input`
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

const FileInput = styled.input`
  display: none;
`;

const FileButton = styled.label`
  background: #222;
  color: white;
  border: 1px dashed #444;
  padding: 20px;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
  min-width: 200px;
  transition: all 0.2s;

  &:hover {
    background: #333;
    border-color: #666;
  }
`;

const GenerateButton = styled.button`
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

const PreviewContainer = styled.div`
  display: flex;
  gap: 40px;
  width: 100%;
  max-width: 1200px;
  justify-content: center;
  flex-wrap: wrap;
`;

const ImageBox = styled.div`
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

const Image = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const ImageLabel = styled.div`
  position: absolute;
  top: -25px;
  left: 0;
  color: #888;
`;

const LoadingOverlay = styled.div`
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

export default function SceneTransformer() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [timeOfDay, setTimeOfDay] = useState("Noon");
  const [month, setMonth] = useState("May");
  const [year, setYear] = useState("2024");
  const [additionalPrompt, setAdditionalPrompt] = useState("");

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!imagePreview) return;

    setLoading(true);
    setGeneratedImage(null);

    try {
      const response = await fetch("/api/dalle/transform", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imagePreview,
          timeOfDay,
          month,
          year,
          additionalPrompt,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setGeneratedImage(data.imageUrl);
      } else {
        alert("Error: " + data.message);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Title>Scene Time Machine</Title>
      
      <Controls>
        <ControlGroup>
          <Label>Upload Image</Label>
          <FileButton>
            {selectedImage ? selectedImage.name : "Click to Upload Image"}
            <FileInput type="file" accept="image/*" onChange={handleImageUpload} />
          </FileButton>
        </ControlGroup>

        <ControlGroup>
          <Label>Time of Day</Label>
          <Select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)}>
            <option>Sunrise</option>
            <option>Morning</option>
            <option>Noon</option>
            <option>Afternoon</option>
            <option>Sunset</option>
            <option>Night</option>
            <option>Midnight</option>
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Month</Label>
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Year</Label>
          <Input 
            type="number" 
            value={year} 
            onChange={(e) => setYear(e.target.value)} 
            placeholder="Year"
          />
        </ControlGroup>

        <ControlGroup style={{width: '100%'}}>
          <Label>Additional Instructions (Optional)</Label>
          <Input 
            type="text" 
            value={additionalPrompt} 
            onChange={(e) => setAdditionalPrompt(e.target.value)} 
            placeholder="e.g. Add a futuristic flying car, make it raining..."
            style={{width: '100%'}}
          />
        </ControlGroup>

        <GenerateButton onClick={handleGenerate} disabled={!imagePreview || loading}>
          {loading ? "Transforming..." : "Generate Transformation"}
        </GenerateButton>
      </Controls>

      <PreviewContainer>
        <ImageBox>
          <ImageLabel>Original Scene</ImageLabel>
          {imagePreview ? (
            <Image src={imagePreview} alt="Original" />
          ) : (
            <div style={{color: '#444'}}>No image uploaded</div>
          )}
        </ImageBox>

        <ImageBox>
          <ImageLabel>Transformed Scene</ImageLabel>
          {generatedImage ? (
            <Image src={generatedImage} alt="Generated" />
          ) : (
            <div style={{color: '#444'}}>
              {loading ? "Analyzing & Generating..." : "Waiting for generation"}
            </div>
          )}
          {loading && <LoadingOverlay>Processing...</LoadingOverlay>}
        </ImageBox>
      </PreviewContainer>
    </Container>
  );
}
