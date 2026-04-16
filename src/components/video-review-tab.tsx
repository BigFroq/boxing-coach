"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Video, Loader2, AlertCircle, Play } from "lucide-react";

interface AnalysisResult {
  summary: string;
  phases: { phase: string; feedback: string }[];
  strengths: string[];
  improvements: string[];
  coaching_advice: string[];
  citations: { type: "video" | "course"; title: string; url?: string; file?: string }[];
}

export function VideoReviewTab() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file (mp4, mov, webm)");
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      setError("Video must be under 200MB");
      return;
    }

    setError(null);
    setAnalysis(null);
    setFrames([]);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const extractFrames = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setExtracting(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Failed to initialize canvas for frame extraction.");
        setExtracting(false);
        return;
      }

      // Wait for video metadata
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) {
          resolve();
        } else {
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        }
      });

      const duration = video.duration;
      // Scale frames based on video length: ~1 frame per 5 seconds, min 8, max 20
      const maxFrames = Math.min(20, Math.max(8, Math.round(duration / 5)));
      const interval = Math.max(duration / maxFrames, 0.5);
      const extractedFrames: string[] = [];

      canvas.width = Math.min(video.videoWidth, 640);
      canvas.height = Math.min(video.videoHeight, 480);
      // Maintain aspect ratio
      const scale = Math.min(640 / video.videoWidth, 480 / video.videoHeight);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      for (let time = 0; time < duration && extractedFrames.length < maxFrames; time += interval) {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.addEventListener("seeked", () => resolve(), { once: true });
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        extractedFrames.push(dataUrl);
      }

      setFrames(extractedFrames);
    } catch {
      setError("Failed to extract frames from the video. Try a different format or shorter clip.");
    } finally {
      setExtracting(false);
    }
  }, []);

  const analyzeVideo = useCallback(async () => {
    if (frames.length === 0) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/video-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: frames.map((f) => f.split(",")[1]), // Strip data:image/jpeg;base64, prefix
          filename: videoFile?.name || "video",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Analysis failed");
      }

      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze video.";
      setError(`Analysis failed: ${message}. Please try again.`);
    } finally {
      setAnalyzing(false);
    }
  }, [frames, videoFile]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />

      <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Upload Area */}
        {!videoUrl ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 sm:p-12 text-center cursor-pointer hover:border-accent transition-colors"
          >
            <Upload size={40} className="mx-auto mb-4 text-muted" />
            <h2 className="text-lg font-semibold mb-2">Upload a Video Clip</h2>
            <p className="text-sm text-muted mb-1">
              Sparring, bag work, or shadow boxing — up to one round (3 min)
            </p>
            <p className="text-xs text-muted">MP4, MOV, or WebM under 200MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <>
            {/* Video Preview */}
            <div className="rounded-xl overflow-hidden bg-surface border border-border">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full max-h-[200px] sm:max-h-[300px] md:max-h-[400px] object-contain bg-black"
                preload="auto"
              />
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">{videoFile?.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setVideoUrl(null);
                      setVideoFile(null);
                      setFrames([]);
                      setAnalysis(null);
                    }}
                    className="text-sm text-muted hover:text-foreground transition-colors"
                  >
                    Remove
                  </button>
                  {frames.length === 0 && (
                    <button
                      onClick={extractFrames}
                      disabled={extracting}
                      className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      {extracting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Extracting frames...
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          Extract Frames
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted Frames */}
            {frames.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{frames.length} frames extracted</h3>
                  {!analysis && (
                    <button
                      onClick={analyzeVideo}
                      disabled={analyzing}
                      className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Analyzing with Punch Doctor methodology...
                        </>
                      ) : (
                        <>
                          <Video size={14} />
                          Analyze Technique
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {frames.map((frame, i) => (
                    <img
                      key={i}
                      src={frame}
                      alt={`Frame ${i + 1}`}
                      className="rounded-lg border border-border w-full aspect-video object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Results */}
            {analysis && (
              <div className="space-y-4 pb-6">
                <h3 className="text-lg font-semibold">Analysis Results</h3>

                {/* Summary */}
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h4 className="text-sm font-medium text-accent mb-2">Overview</h4>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>

                {/* Phase Breakdown */}
                {analysis.phases.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-sm font-medium text-accent mb-3">Phase Breakdown</h4>
                    <div className="space-y-3">
                      {analysis.phases.map((p, i) => (
                        <div key={i}>
                          <span className="text-xs font-semibold uppercase text-muted">
                            {p.phase}
                          </span>
                          <p className="text-sm leading-relaxed mt-1">{p.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strengths */}
                {analysis.strengths.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-sm font-medium text-green-500 mb-2">Strengths</h4>
                    <ul className="space-y-1">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-green-500 shrink-0">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {analysis.improvements.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-sm font-medium text-yellow-500 mb-2">Areas to Improve</h4>
                    <ul className="space-y-1">
                      {analysis.improvements.map((s, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-yellow-500 shrink-0">!</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Coaching Advice (RAG-grounded) */}
                {analysis.coaching_advice && analysis.coaching_advice.length > 0 && (
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                    <h4 className="text-sm font-medium text-accent mb-2">Punch Doctor Coaching Tips</h4>
                    <ul className="space-y-2">
                      {analysis.coaching_advice.map((tip, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-accent shrink-0">{i + 1}.</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source Videos */}
                {analysis.citations && analysis.citations.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-sm font-medium text-muted mb-3">Learn More — Recommended Videos</h4>
                    <div className="flex gap-2 flex-wrap">
                      {analysis.citations.map((c, i) => (
                        <a
                          key={i}
                          href={c.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs hover:border-accent transition-colors max-w-[280px]"
                        >
                          <span className="text-accent shrink-0">&#9654;</span>
                          <span className="truncate">{c.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analyze Again */}
                <button
                  onClick={() => {
                    setVideoUrl(null);
                    setVideoFile(null);
                    setFrames([]);
                    setAnalysis(null);
                  }}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  Upload another video
                </button>
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
