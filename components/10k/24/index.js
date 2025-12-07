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

let jsZipPromise = null;

const YEARS = Array.from({ length: 12 }, (_, i) => 1915 + i * 10); // 1915..2025 step 10 (12 items)
const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December"
];
const HOURS = Array.from({ length: 12 }, (_, i) => i * 2).map((h) => `${String(h).padStart(2, "0")}:00`);
const monthToNumber = (m) => {
  const idx = MONTHS.indexOf(m);
  return idx >= 0 ? String(idx + 1).padStart(2, "0") : m;
};

const formatId = (year, month, hour) => {
  const mm = monthToNumber(month);
  const hh = String(hour).split(":")[0].padStart(2, "0");
  return `${year}_${mm}_${hh}`;
};


const AXES = ["year", "month", "hour"];

export default function SceneTransformerDualAxis() {
  const [axisA, setAxisA] = useState("month");
  const [axisB, setAxisB] = useState("hour");
  const [anchorYear, setAnchorYear] = useState(2025);
  const [anchorMonth, setAnchorMonth] = useState("July");
  const [anchorHour, setAnchorHour] = useState("12:00");
  const [location, setLocation] = useState("bulgwangcheon");
  const [quality, setQuality] = useState("low");
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [batch, setBatch] = useState([]);
  const [running, setRunning] = useState(false);
  const [zipPreparing, setZipPreparing] = useState(false);

  const axisOptions = useMemo(() => {
    const remaining = AXES.filter((x) => x !== axisA);
    if (!remaining.includes(axisB)) return remaining[0] || "hour";
    return axisB;
  }, [axisA, axisB]);

  const valuesForAxis = (axis) => {
    if (axis === "year") return YEARS;
    if (axis === "month") return MONTHS;
    return HOURS;
  };

  const buildPrompt = (year, month, hour) => {
    const hourText = `${hour} local time`;
    const hourInt = Number(String(hour).split(":")[0]);
    const meridiem = hourInt < 12 ? "morning" : "evening";

    const baseLocation =
      location === "bulgwangcheon"
        ? [
            "Photo-real Bulgwangcheon, Eunpyeong-gu",
            "camera centered in the stream, river receding straight back",
            "banks with walkways on both sides, background buildings aligned behind the banks",
            "bridge centered; keep exact perspective and composition",
          ].join(", ")
        : [
            "Photo-real Bukhansan overlook toward old Seoul four-gate area",
            "large rock fixed on left foreground, small grass patch in front, drop-off behind it",
            "wide Seoul cityscape beyond the drop-off; keep the same skyline framing",
            "do not change camera angle or composition",
          ].join(", ");

    return [
      "Ultra-realistic, photographic quality.",
      baseLocation + ".",
      `Depict ${month} ${year}, ${hourText} (${hourInt}:00 ${meridiem}), with era-accurate Seoul skyline/architecture for that year.`,
      "Reflect the correct season for that month (foliage, sky, atmosphere, clothing cues if visible).",
      "Lighting/sky must match time-of-day and season: bright daylight for midday; warm low sun for late afternoon; dark night with artificial lights for 22:00; pre-dawn faint light for early hours.",
      "Maintain the exact described vantage and framing; do not alter camera angle or composition.",
      additionalPrompt ? `Additional directives: ${additionalPrompt}` : "",
    ].filter(Boolean).join(" ");
  };

  const buildPlan = () => {
    const valuesA = valuesForAxis(axisA);
    const valuesB = valuesForAxis(axisB);
    const plan = [];
    for (const a of valuesA) {
      for (const b of valuesB) {
        const year = axisA === "year" ? a : axisB === "year" ? b : anchorYear;
        const month = axisA === "month" ? a : axisB === "month" ? b : anchorMonth;
        const hour = axisA === "hour" ? a : axisB === "hour" ? b : anchorHour;
        const label = formatId(year, month, hour);
        plan.push({
          label,
          year,
          month,
          hour,
          filename: label,
        });
      }
    }
    return plan;
  };

  const handleGenerate = async () => {
    if (running) return;
    const plan = buildPlan();
    setBatch(plan.map((p) => ({ ...p, status: "pending", imageUrl: null, durationMs: null, startedAt: null })));
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

  const loadJsZip = () => {
    if (typeof window === "undefined") return Promise.reject(new Error("No window"));
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jsZipPromise) return jsZipPromise;
    jsZipPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      script.async = true;
      script.onload = () => {
        if (window.JSZip) resolve(window.JSZip);
        else reject(new Error("JSZip not available after load"));
      };
      script.onerror = () => reject(new Error("Failed to load JSZip"));
      document.body.appendChild(script);
    });
    return jsZipPromise;
  };

  const handleZipAll = async () => {
    if (zipPreparing) return;
    setZipPreparing(true);
    try {
      const JSZip = await loadJsZip();
      const zip = new JSZip();
      const doneItems = batch.filter((b) => b.imageUrl);
      for (const item of doneItems) {
        const resp = await fetch(item.imageUrl);
        const blob = await resp.blob();
        zip.file(`${item.filename}.png`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `batch_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip error", err);
      alert("Failed to create zip: " + err?.message);
    } finally {
      setZipPreparing(false);
    }
  };

  const canRun = !running;
  const axisBValue = axisOptions; // ensured distinct

  return (
    <Container>
      <Title>Scene Time Machine · Dual Axis (Text-only)</Title>

      <Controls>
        <ControlGroup>
          <Label>Axis A (vary)</Label>
          <Select value={axisA} onChange={(e) => setAxisA(e.target.value)}>
            {AXES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Axis B (vary)</Label>
          <Select value={axisB} onChange={(e) => setAxisB(e.target.value)}>
            {AXES.filter((x) => x !== axisA).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Year</Label>
          <Select value={anchorYear} onChange={(e) => setAnchorYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Month</Label>
          <Select value={anchorMonth} onChange={(e) => setAnchorMonth(e.target.value)}>
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <Label>Anchor Time</Label>
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

        <GenerateButton onClick={handleGenerate} disabled={!canRun}>
          {running ? "Batch running..." : "Generate Batch"}
        </GenerateButton>
        <GenerateButton onClick={handleZipAll} disabled={zipPreparing || batch.every((b) => !b.imageUrl)}>
          {zipPreparing ? "Preparing zip..." : "Download ZIP (done items)"}
        </GenerateButton>
      </Controls>

      <PreviewContainer>
        <ImageBox>
          <ImageLabel>Reference (text-only mode)</ImageLabel>
          <div style={{ color: "#888", padding: "12px", textAlign: "center" }}>
            No input image used. Prompt enforces location perspective & time-of-day/season/year.
          </div>
        </ImageBox>
      </PreviewContainer>

      <ResultsContainer>
        <Label style={{ display: "block", marginBottom: "8px" }}>
          Dual-axis sweep ({axisA} × {axisBValue}) — total {batch.length} items
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
                <div style={{ color: "#888", fontSize: 11 }}>
                  {item.filename}
                </div>
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

