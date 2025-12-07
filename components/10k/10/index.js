/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Title,
  Controls,
  ControlGroup,
  Label,
  Select,
  Input,
  GenerateButton,
  PreviewContainer,
  ImageBox,
  StyledImg,
  ImageLabel,
  LoadingOverlay,
  ResultsContainer,
  ScrollArea,
  BatchStrip,
  BatchCard,
  BatchLabel,
  Thumb,
  ThumbPlaceholder,
  StatusBadge,
} from "./styles";

export default function SceneTransformerReplicate() {
  const YEARS = useMemo(() => [1935, 1945, 1955, 1965, 1975, 1985, 1995, 2005, 2015, 2025], []);
  const MONTHS = useMemo(() => [
    "January","February","March","April","May","June","July","August","September","October","November","December"
  ], []);
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`), []);

  const [baseImage, setBaseImage] = useState(null);
  const [loadingBase, setLoadingBase] = useState(false);
  const [axis, setAxis] = useState("year"); // year | month | hour
  const [anchorYear, setAnchorYear] = useState(2024);
  const [anchorMonth, setAnchorMonth] = useState("July");
  const [anchorHour, setAnchorHour] = useState("12:00");
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [batch, setBatch] = useState([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingBase(true);
        const resp = await fetch("/img/test2.jpg");
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setBaseImage(reader.result);
          setLoadingBase(false);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error("Failed to load base image", err);
        setLoadingBase(false);
      }
    };
    load();
  }, []);

  const downscaleDataUrl = (dataUrl, maxSize = 512, quality = 0.8) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  const buildPrompt = (year, month, hour) => {
    const hourText = `${hour} local time`;
    return `Realistic view of Bulgwangcheon in Eunpyeong-gu, same structure and layout, at ${month} ${year}, ${hourText}. Keep bridges, river path, and buildings intact; only adjust lighting/season/time cues. ${additionalPrompt ? `Additional directives: ${additionalPrompt}` : ""}`;
  };

  const buildBatchPlan = () => {
    if (axis === "year") {
      return YEARS.map((y) => ({
        label: `${y}`,
        year: y,
        month: anchorMonth,
        hour: anchorHour,
      }));
    }
    if (axis === "month") {
      return MONTHS.map((m) => ({
        label: m,
        year: anchorYear,
        month: m,
        hour: anchorHour,
      }));
    }
    return HOURS.map((h) => ({
      label: h,
      year: anchorYear,
      month: anchorMonth,
      hour: h,
    }));
  };

  const handleBatchGenerate = async () => {
    if (!baseImage || running) return;
    const plan = buildBatchPlan();
    setBatch(plan.map((p) => ({ ...p, status: "pending", imageUrl: null })));
    setRunning(true);
    const compactBase = await downscaleDataUrl(baseImage, 512, 0.8);

    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      setBatch((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "running" } : p
        )
      );

      try {
        const prompt = buildPrompt(item.year, item.month, item.hour);
        const response = await fetch("/api/replicate/transform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: compactBase,
            prompt,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          setBatch((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: "done", imageUrl: data.imageUrl } : p
            )
          );
        } else {
          setBatch((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: "error", error: data.message } : p
            )
          );
        }
      } catch (err) {
        setBatch((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", error: err?.message } : p
          )
        );
      }
    }

    setRunning(false);
  };

  return (
    <Container>
      <Title>Scene Time Machine · Replicate (fast)</Title>

      <Controls>
        <ControlGroup>
          <Label>Axis</Label>
          <Select value={axis} onChange={(e) => setAxis(e.target.value)}>
            <option value="year">Year sweep (1935→2025)</option>
            <option value="month">Month sweep (Jan→Dec)</option>
            <option value="hour">Time sweep (00:00→22:00)</option>
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Year (for month/hour sweeps)</Label>
          <Select value={anchorYear} onChange={(e) => setAnchorYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Month (for year/hour sweeps)</Label>
          <Select value={anchorMonth} onChange={(e) => setAnchorMonth(e.target.value)}>
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Time (for year/month sweeps)</Label>
          <Select value={anchorHour} onChange={(e) => setAnchorHour(e.target.value)}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup style={{ width: "100%" }}>
          <Label>Additional Instructions (optional)</Label>
          <Input
            type="text"
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            placeholder="e.g. softer light, light mist, calm water"
            style={{ width: "100%" }}
          />
        </ControlGroup>

        <GenerateButton onClick={handleBatchGenerate} disabled={!baseImage || running || loadingBase}>
          {running ? "Batch running..." : loadingBase ? "Loading base..." : "Generate Batch"}
        </GenerateButton>
      </Controls>

      <PreviewContainer>
        <ImageBox>
          <ImageLabel>Base Scene (downscaled client-side)</ImageLabel>
          {baseImage ? (
            <StyledImg src={baseImage} alt="Base" />
          ) : (
            <div style={{ color: "#444" }}>{loadingBase ? "Loading..." : "Missing base image"}</div>
          )}
          {loadingBase && <LoadingOverlay>Loading...</LoadingOverlay>}
        </ImageBox>
      </PreviewContainer>

      <ResultsContainer>
        <Label style={{ display: "block", marginBottom: "8px" }}>
          {axis === "year" && "Batch results by decade (1935 → 2025)"}
          {axis === "month" && "Batch results across months (Jan → Dec)"}
          {axis === "hour" && "Batch results across day (00:00 → 22:00)"}
        </Label>
        <ScrollArea>
          <BatchStrip>
            {batch.map((item) => (
              <BatchCard key={item.label}>
                <BatchLabel>{item.label}</BatchLabel>
                <Thumb>
                  {item.imageUrl && <img src={item.imageUrl} alt={item.label} />}
                  {!item.imageUrl && (
                    <ThumbPlaceholder>
                      {item.status === "running" && "Generating..."}
                      {item.status === "pending" && "Queued"}
                      {item.status === "error" && "Error"}
                    </ThumbPlaceholder>
                  )}
                </Thumb>
                <StatusBadge $status={item.status}>{item.status}</StatusBadge>
              </BatchCard>
            ))}
          </BatchStrip>
        </ScrollArea>
      </ResultsContainer>
    </Container>
  );
}

