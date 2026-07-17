"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, AlertCircle, RotateCcw, Download, Share2 } from "lucide-react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import { saveClipLog, fetchRecentClips } from "@/lib/clip-log-storage";
import type { ClipLog } from "@/lib/clip-log-types";
import { DiffCard } from "@/components/clip-log/diff-card";
import { Timeline } from "@/components/clip-log/timeline";
import { PoseOverlay } from "@/components/clip-log/pose-overlay";
import {
  exportAnnotatedClip,
  type AnnotatedClipExport,
} from "@/components/clip-log/export-annotated-clip";

interface AnalysisResult {
  summary: string;
  phases: { phase: string; feedback: string }[];
  strengths: string[];
  improvements: string[];
}

interface CoachClipReviewProps {
  userId?: string;
}

function getPhaseScore(
  analysis: { phases: { phase: string; score?: number }[] },
  phase: string
): number | null {
  const p = analysis.phases.find((x) => x.phase === phase);
  return typeof p?.score === "number" ? p.score : null;
}

export function CoachClipReview({ userId }: CoachClipReviewProps = {}) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentClips, setRecentClips] = useState<ClipLog[]>([]);
  const [priorClipForDiff, setPriorClipForDiff] = useState<ClipLog | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<AnnotatedClipExport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 30);
      if (!cancelled && r.status === "ok") setRecentClips(r.clips);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setAnalyzing(false);
    setStatus("");
    setAnalysis(null);
    setError(null);
    setExporting(false);
    setExportPct(0);
    setExportError(null);
    setExported(null);
  };

  const clipBaseName = () =>
    (videoFile?.name.replace(/\.[^.]+$/, "") || "clip") + "-analyzed";

  const ensureExported = async (): Promise<AnnotatedClipExport | null> => {
    if (exported) return exported;
    if (!videoUrl) return null;
    setExportError(null);
    setExporting(true);
    setExportPct(0);
    try {
      const result = await exportAnnotatedClip(videoUrl, (f) =>
        setExportPct(Math.round(f * 100))
      );
      setExported(result);
      return result;
    } catch (e) {
      console.error("Annotated clip export failed:", e);
      setExportError("Couldn't render the overlay video in this browser.");
      return null;
    } finally {
      setExporting(false);
    }
  };

  const downloadAnnotated = async () => {
    const result = await ensureExported();
    if (!result) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.blob);
    a.download = `${clipBaseName()}.${result.extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const shareAnnotated = async () => {
    const result = await ensureExported();
    if (!result) return;
    const file = new File([result.blob], `${clipBaseName()}.${result.extension}`, {
      type: result.blob.type,
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
    }
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

  const extractFrames = useCallback(async (): Promise<{
    frames: string[];
    fps: number;
  }> => {
    const empty = { frames: [], fps: 0 };
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return empty;

    // Wait for metadata if not ready
    if (video.readyState < 1) {
      await new Promise<void>((r) => {
        video.onloadedmetadata = () => r();
      });
    }

    const duration = video.duration;
    if (duration > 40) {
      setError(
        "Clip must be under 40 seconds. This video is " +
          Math.round(duration) +
          "s."
      );
      return empty;
    }

    // ponytail: fixed 80-frame budget spread across the clip — short clips get
    // up to 20fps (3-5 frames per punch), long clips degrade gracefully.
    // "All the frames" isn't possible: the API caps at 100 images per request.
    const totalFrames = Math.max(1, Math.min(80, Math.ceil(duration * 20)));
    const interval = duration / totalFrames;
    const effectiveFps = Math.round(totalFrames / duration);

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

    // Draw the pose skeleton onto each extracted frame so the coach model
    // sees explicit joint markers. If the landmarker can't load, frames go
    // out plain — same behavior as before.
    let landmarker: PoseLandmarker | null = null;
    try {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    } catch (e) {
      console.warn("Skeleton annotation unavailable, sending plain frames:", e);
    }
    const drawer = new DrawingUtils(ctx);

    const frames: string[] = [];
    const SEEK_TIMEOUT_MS = 500;
    for (let i = 0; i < totalFrames; i++) {
      const time = i * interval;
      const alreadyThere = Math.abs(video.currentTime - time) < 0.01;
      if (!alreadyThere) {
        await new Promise<void>((resolve) => {
          let done = false;
          const onSeeked = () => {
            if (done) return;
            done = true;
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.currentTime = time;
          setTimeout(() => onSeeked(), SEEK_TIMEOUT_MS);
        });
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (landmarker) {
        const lm = landmarker.detect(canvas).landmarks?.[0];
        if (lm) {
          drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#3cf0ff",
            lineWidth: 2,
          });
          drawer.drawLandmarks(lm, { color: "#ff8c28", radius: 2 });
        }
      }
      // ponytail: keep 80 frames under Vercel's 4.5MB body cap — noisy frames
      // drop to q0.5 (50KB × 80 ≈ 4MB worst case).
      let b64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      if (b64.length > 50_000) {
        b64 = canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
      }
      frames.push(b64);
    }
    landmarker?.close();
    return { frames, fps: effectiveFps };
  }, []);

  const analyze = useCallback(async () => {
    if (!videoFile) return;
    setAnalyzing(true);
    setError(null);

    try {
      setStatus("Extracting frames...");
      const { frames, fps } = await extractFrames();
      if (frames.length === 0) {
        setAnalyzing(false);
        return;
      }

      setStatus(`Analyzing ${frames.length} frames (${fps}/sec)...`);
      const response = await fetch("/api/coach/clip-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, fps, filename: videoFile.name, userId }),
      });

      if (!response.ok) {
        throw new Error("Analysis failed");
      }

      const result = await response.json();
      setAnalysis(result);
      setPriorClipForDiff(recentClips[0] ?? null);

      // Compute thumbnail from middle frame and persist asynchronously.
      // Failure does NOT surface to the user — analysis UX still works,
      // we just lose persistence for this clip. Tracked in PostHog.
      const middleFrame = frames[Math.floor(frames.length / 2)] ?? null;
      const durationSeconds = videoRef.current?.duration ?? null;
      if (userId && userId !== "anon") {
        void saveClipLog({
          userId,
          filename: videoFile.name,
          durationSeconds,
          analysis: result,
          thumbnailB64: middleFrame,
        }).then((res) => {
          if (res.status === "saved") {
            setRecentClips((prev) => [res.clip, ...prev]);
          }
        });
      }
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze clip. Please try again.");
    } finally {
      setAnalyzing(false);
      setStatus("");
    }
  }, [videoFile, extractFrames, userId, recentClips]);

  // Results view
  if (analysis) {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {videoUrl && (
          <div className="mx-auto w-full max-w-sm space-y-2">
            <div className="relative w-full">
              <video
                ref={resultVideoRef}
                src={videoUrl}
                controls
                playsInline
                muted
                loop
                autoPlay
                className="w-full rounded-xl"
              />
              <PoseOverlay videoRef={resultVideoRef} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadAnnotated}
                disabled={exporting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-surface-hover py-2.5 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-60"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rendering… {exportPct}%
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Download with overlay
                  </>
                )}
              </button>
              {typeof navigator !== "undefined" && !!navigator.share && (
                <button
                  onClick={shareAnnotated}
                  disabled={exporting}
                  aria-label="Share clip with overlay"
                  className="flex items-center justify-center rounded-lg bg-surface-hover px-4 py-2.5 text-muted hover:text-foreground transition-colors disabled:opacity-60"
                >
                  <Share2 size={14} />
                </button>
              )}
            </div>
            {exportError && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle size={14} />
                {exportError}
              </div>
            )}
          </div>
        )}
        <div className="rounded-xl bg-surface-hover p-5">
          <h3 className="text-sm font-semibold mb-2">Summary</h3>
          <p className="text-sm text-muted leading-relaxed">{analysis.summary}</p>
        </div>

        <DiffCard
          current={{
            loading: getPhaseScore(analysis, "Loading"),
            hipExplosion: getPhaseScore(analysis, "Hip Explosion"),
            energyTransfer: getPhaseScore(analysis, "Energy Transfer"),
            followThrough: getPhaseScore(analysis, "Follow Through"),
            overall: null,
          }}
          previous={priorClipForDiff}
        />

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
        <div className="w-full max-w-md space-y-6">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a clip"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="w-full rounded-xl border-2 border-dashed border-border hover:border-accent/50 p-8 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium mb-1">Upload a short clip</p>
            <p className="text-xs text-muted">Up to 40 seconds — single punch, combination, or short flurry</p>
            <p className="text-xs text-muted mt-1">MP4, MOV, or WebM • Max 50MB</p>
          </div>
          <Timeline clips={recentClips} />
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          <div className="relative w-full">
            <video
              ref={videoRef}
              src={videoUrl!}
              controls
              playsInline
              muted
              className="w-full rounded-xl"
            />
            <PoseOverlay videoRef={videoRef} />
          </div>

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
