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
  const YEARS = useMemo(() => [1965, 1975, 1985, 1995, 2005, 2015, 2025, 2035, 2045, 2055, 2065, 2075], []);
  const MONTHS = useMemo(() => [
    "January","February","March","April","May","June","July","August","September","October","November","December"
  ], []);
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`), []);

  const [axis, setAxis] = useState("year"); // year | month | hour
  const [anchorYear, setAnchorYear] = useState(2025);
  const [anchorMonth, setAnchorMonth] = useState("July");
  const [anchorHour, setAnchorHour] = useState("12:00");
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [quality, setQuality] = useState("low"); // low | medium | high
  const [location, setLocation] = useState("miyashita"); // miyashita | bukhan
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
      location === "miyashita"
        ? [
            "Photo-real Miyashita Park, Shibuya, Tokyo",
            "Rooftop park atmosphere, 'urban space lifted into the air'",
            "Camera angled to capture the vast sky above the park, with glimpses of the surrounding Shibuya skyline at the edges",
            "The sky is the main subject, showcasing meteorological phenomena (clouds, light, wind patterns)",
            "Sky Condition: Realistic Tokyo sky with variable cloud cover, atmospheric haze, and dynamic lighting. Avoid generic clear blue skies.",
            "Do not change angle or composition",
          ].join(", ")
        : location === "scramble"
        ? [
            "Photo-real Shibuya Scramble Crossing, Shibuya, Tokyo",
            "Fixed Camera Position: Eye-level view from the Shibuya Station side looking towards Q-FRONT.",
            "Main Subject: The Scramble Crossing in the foreground.",
            "Background Composition: Q-FRONT (Tsutaya) building on the right. 109 Building visible in the distance on the left.",
            "Sky Visibility: Low angle shot (looking up) to ensure the sky occupies the top 50% of the frame.",
            "Lens: 24mm Wide Angle.",
            "Constraint: DO NOT ZOOM. DO NOT CHANGE ANGLE. KEEP THIS EXACT COMPOSITION.",
          ].join(", ")
        : [
            "Photo-real Bukhansan overlook toward old Seoul four-gate area",
            "large rock anchored on the left foreground",
            "small patch of grass in front, then a drop-off/cliff",
            "wide Seoul cityscape beyond the drop-off, consistent skyline framing",
            "do not change angle or composition",
          ].join(", ");

    const getWeatherCondition = (m) => {
      if (m === "January") return "Heavy snow, winter atmosphere, accumulation on ground/trees.";
      if (m === "April") return "Cherry blossoms (Sakura) in full bloom, pink petals in the air, spring atmosphere.";
      if (m === "July") return "Heavy rain (Tsuyu season), wet pavement reflections, overcast dramatic sky.";
      if (m === "October") return "Autumn foliage, golden/red leaves, crisp clear autumn air.";
      if (m === "December") return "Winter atmosphere, festive Christmas decorations. A large Christmas tree is visible in the park. If night, dazzling Christmas illuminations and city lights.";
      return `Typical Tokyo weather for ${m}: variable clouds, humid atmosphere, potential urban haze, not perfectly clear.`;
    };
    const weatherCondition = getWeatherCondition(month);

    return `Ultra-realistic, photographic quality. ${baseLocation}. 
    STRICTLY ADHERE to the specified Year, Month, and Time:
    - Year ${year}: The image MUST reflect the historical era (buildings, cars, fashion, atmosphere) of ${year}.
    - Month ${month}: The image MUST reflect the season (foliage, weather, clothing) of ${month}.
    - Time ${hour}: The image MUST reflect the exact lighting conditions of ${hourText}. Time is strictly 24-hour format. 12:00 is NOON (Bright Daylight). 00:00 is MIDNIGHT (Dark Night).
    - Weather: ${weatherCondition} The sky and weather conditions MUST match this description.
    - If the time is evening or night (e.g., 18:00 - 05:00), capture the vibrant Shibuya nightscape with neon lights, illuminated signage, and city glow appropriate for the era.
    ${year > 2025 ? `
    FUTURE SPECULATION:
    - For years after 2025, speculate on the future evolution of Tokyo/Shibuya.
    - Depict advanced technology, evolved architecture, and futuristic fashion while maintaining the recognizable layout of Shibuya.
    - The atmosphere should reflect a plausible sci-fi future appropriate for the year ${year}.
    ` : ""}
    Depict ${month} ${year} at ${hourText}. Maintain the exact described vantage and framing. ${additionalPrompt ? `Additional directives: ${additionalPrompt}` : ""}`;
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
            <option value="year">Year sweep (1965→2075)</option>
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
            <option value="miyashita">Miyashita Park (Shibuya)</option>
            <option value="scramble">Shibuya Scramble</option>
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
            No input image used. Prompt enforces Miyashita Park perspective & time-of-day/season/year.
          </div>
        </ImageBox>
      </PreviewContainer>

      <ResultsContainer>
        <Label style={{ display: "block", marginBottom: "8px" }}>
          {axis === "year" && "Batch results by decade (1965 → 2075)"}
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

