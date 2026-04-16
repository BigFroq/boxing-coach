"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Loader2, AlertCircle, RotateCcw } from "lucide-react";

interface AnalysisResult {
  summary: string;
  phases: { phase: string; feedback: string }[];
  strengths: string[];
  improvements: string[];
}

export function CoachClipReview() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reset = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setAnalyzing(false);
    setStatus("");
    setAnalysis(null);
    setError(null);
  };

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file (mp4, mov, webm)");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Video must be under 50MB");
      return;
    }
    setError(null);
    setAnalysis(null);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const extractFrames = useCallback(async (): Promise<string[]> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return [];

    return new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        const duration = video.duration;
        if (duration > 25) {
          setError(
            "Clip must be under 20 seconds. This video is " +
              Math.round(duration) +
              "s."
          );
          resolve([]);
          return;
        }

        const fps = 5;
        const totalFrames = Math.min(Math.floor(duration * fps), 60);
        const interval = duration / totalFrames;

        const maxW = 640,
          maxH = 480;
        const scale = Math.min(
          maxW / video.videoWidth,
          maxH / video.videoHeight,
          1
        );
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d")!;

        const frames: string[] = [];
        for (let i = 0; i < totalFrames; i++) {
          const time = i * interval;
          video.currentTime = time;
          await new Promise<void>((r) => {
            video.onseeked = () => r();
          });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          frames.push(dataUrl.split(",")[1]);
        }
        resolve(frames);
      };
      video.load();
    });
  }, []);

  const analyze = useCallback(async () => {
    if (!videoFile) return;
    setAnalyzing(true);
    setError(null);

    try {
      setStatus("Extracting frames...");
      const frames = await extractFrames();
      if (frames.length === 0) {
        setAnalyzing(false);
        return;
      }

      setStatus(`Analyzing ${frames.length} frames...`);
      const response = await fetch("/api/coach/clip-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, filename: videoFile.name }),
      });

      if (!response.ok) {
        throw new Error("Analysis failed");
      }

      const result = await response.json();
      setAnalysis(result);
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze clip. Please try again.");
    } finally {
      setAnalyzing(false);
      setStatus("");
    }
  }, [videoFile, extractFrames]);

  // Results view
  if (analysis) {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="rounded-xl bg-surface-hover p-5">
          <h3 className="text-sm font-semibold mb-2">Summary</h3>
          <p className="text-sm text-muted leading-relaxed">{analysis.summary}</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Phase Breakdown</h3>
          {analysis.phases.map((p, i) => (
            <div key={i} className="rounded-xl bg-surface-hover p-4">
              <div className="text-xs font-medium text-accent mb-1">{p.phase}</div>
              <p className="text-sm text-muted leading-relaxed">{p.feedback}</p>
            </div>
          ))}
        </div>

        {analysis.strengths.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Strengths</h3>
            <div className="space-y-1.5">
              {analysis.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-muted">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.improvements.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Areas to Improve</h3>
            <div className="space-y-1.5">
              {analysis.improvements.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-400 mt-0.5">!</span>
                  <span className="text-muted">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-lg bg-surface-hover px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <RotateCcw size={14} />
          Review another clip
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      {!videoFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="w-full max-w-sm rounded-xl border-2 border-dashed border-border hover:border-accent/50 p-8 text-center cursor-pointer transition-colors"
        >
          <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm font-medium mb-1">Upload a short clip</p>
          <p className="text-xs text-muted">Up to 20 seconds — single punch or combination</p>
          <p className="text-xs text-muted mt-1">MP4, MOV, or WebM • Max 50MB</p>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          <video
            ref={videoRef}
            src={videoUrl!}
            controls
            playsInline
            muted
            className="w-full rounded-xl"
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {analyzing ? (
            <div className="flex items-center justify-center gap-2 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm text-muted">{status}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={analyze}
                disabled={!!error}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Analyze technique
              </button>
              <button
                onClick={reset}
                className="rounded-lg bg-surface-hover px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
