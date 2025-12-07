import React, { useMemo, useState } from "react";
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

export default function SceneTransformerStandard() {
  const YEARS = useMemo(() => [1935, 1945, 1955, 1965, 1975, 1985, 1995, 2005, 2015, 2025], []);
  const MONTHS = useMemo(() => [
    "January","February","March","April","May","June","July","August","September","October","November","December"
  ], []);
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`), []);

  const [axis, setAxis] = useState("year"); // year | month | hour
  const [anchorYear, setAnchorYear] = useState(2024);
  const [anchorMonth, setAnchorMonth] = useState("July");
  const [anchorHour, setAnchorHour] = useState("12:00");
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [quality, setQuality] = useState("low"); // low | medium | high
  const [location, setLocation] = useState("bulgwangcheon"); // bulgwangcheon | bukhan
  const [batch, setBatch] = useState([]);
  const [running, setRunning] = useState(false);

  const monthToNumber = (m) => {
    const idx = MONTHS.indexOf(m);
    return idx >= 0 ? String(idx + 1).padStart(2, "0") : m;
  };

  const formatId = (year, month, hour) => {
    const mm = monthToNumber(month);
    const hh = String(hour).split(":")[0].padStart(2, "0");
    return `${year}_${mm}_${hh}`;
  };

  const buildPrompt = (year, month, hour) => {
    const hourText = `${hour} local time`;
    const baseLocation =
      location === "bulgwangcheon"
        ? [
            "Photo-real Bulgwangcheon, Eunpyeong-gu",
            "camera at the center of the stream, river receding straight back",
            "banks on both sides visible with walkways, background buildings aligned behind the banks",
            "bridge centered in frame",
            "do not change angle or composition",
          ].join(", ")
        : [
            "Photo-real Bukhansan overlook toward old Seoul four-gate area",
            "large rock anchored on the left foreground",
            "small patch of grass in front, then a drop-off/cliff",
            "wide Seoul cityscape beyond the drop-off, consistent skyline framing",
            "do not change angle or composition",
          ].join(", ");

    return `Ultra-realistic, photographic quality. ${baseLocation}. Depict ${month} ${year} at ${hourText} with era-accurate buildings/skyline, seasonal foliage for that month, and lighting/sky matching the time (night must be dark with artificial lights; noon bright daylight). Maintain the exact described vantage and framing. ${additionalPrompt ? `Additional directives: ${additionalPrompt}` : ""}`;
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
    if (running) return;
    const plan = buildBatchPlan();
    setBatch(plan.map((p) => ({
      ...p,
      status: "pending",
      imageUrl: null,
      durationMs: null,
      startedAt: null,
      label: formatId(p.year, p.month, p.hour),
    })));
    setRunning(true);

    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      setBatch((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "running", startedAt: Date.now(), durationMs: null } : p
        )
      );

      try {
        const prompt = buildPrompt(item.year, item.month, item.hour);
        const response = await fetch("/api/dalle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            quality,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          const ended = Date.now();
          setBatch((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: "done",
                    imageUrl: data.imageUrl,
                    durationMs: p.startedAt ? ended - p.startedAt : null,
                  }
                : p
            )
          );
        } else {
          setBatch((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: "error",
                    error: data.message,
                    durationMs: p.startedAt ? Date.now() - p.startedAt : null,
                  }
                : p
            )
          );
        }
      } catch (err) {
        setBatch((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "error",
                  error: err?.message,
                  durationMs: p.startedAt ? Date.now() - p.startedAt : null,
                }
              : p
          )
        );
      }
    }

    setRunning(false);
  };

  return (
    <Container>
      <Title>Scene Time Machine · Text-only (No Base Image)</Title>

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

        <ControlGroup>
          <Label>Location</Label>
          <Select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="bulgwangcheon">Bulgwangcheon (Eunpyeong-gu)</option>
            <option value="bukhan">Bukhansan view over old Seoul gates</option>
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Quality</Label>
          <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="low">low (faster/cheaper)</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </Select>
        </ControlGroup>

        <ControlGroup style={{ width: "100%" }}>
          <Label>Additional Instructions (optional)</Label>
          <Input
            type="text"
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            placeholder="e.g. lighter mood, minimal rain, softer lighting"
            style={{ width: "100%" }}
          />
        </ControlGroup>

        <GenerateButton onClick={handleBatchGenerate} disabled={running}>
          {running ? "Batch running..." : "Generate Batch"}
        </GenerateButton>
      </Controls>

      <PreviewContainer>
        <ImageBox>
          <ImageLabel>Reference (text-only mode)</ImageLabel>
          <div style={{ color: "#888", padding: "12px", textAlign: "center" }}>
            No input image used. Prompt enforces Bulgwangcheon perspective & time-of-day/season/year.
          </div>
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
                {item.durationMs != null && (
                  <div style={{ color: "#888", fontSize: 11 }}>
                    {(item.durationMs / 1000).toFixed(1)}s
                  </div>
                )}
              </BatchCard>
            ))}
          </BatchStrip>
        </ScrollArea>
      </ResultsContainer>
    </Container>
  );
}

