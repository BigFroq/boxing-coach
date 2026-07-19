"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, AlertCircle, RotateCcw, Download, Share2, MessageSquare, Dumbbell } from "lucide-react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import { saveClipLog, fetchRecentClips } from "@/lib/clip-log-storage";
import { saveClipCorrection } from "@/lib/clip-correction-storage";
import type { ClipLog } from "@/lib/clip-log-types";
import { PUNCH_TYPES, punchLabel, type PunchSlug } from "@/lib/punch-types";
import { ChatTab } from "@/components/chat-tab";
import { DiffCard } from "@/components/clip-log/diff-card";
import { Timeline } from "@/components/clip-log/timeline";
import { PoseOverlay } from "@/components/clip-log/pose-overlay";
import {
  exportAnnotatedClip,
  type AnnotatedClipExport,
} from "@/components/clip-log/export-annotated-clip";

interface AnalysisResult {
  summary: string;
  phases: { phase: string; feedback: string; score?: number }[];
  strengths: string[];
  improvements: string[];
  /** Which prompt shape produced these scores — stored alongside the log. */
  promptVersion?: string;
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

// Phase result card with an inline "Correct this" editor. Corrections feed the
// coach-calibration loop: saved rows get injected into future analysis prompts.
function PhaseCard({
  phase,
  feedback,
  score,
  userId,
  clipLogId,
}: {
  phase: string;
  feedback: string;
  score: number | null;
  userId: string;
  clipLogId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [correctedScore, setCorrectedScore] = useState(score ?? 5);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  const submit = async () => {
    setState("saving");
    const r = await saveClipCorrection({
      userId,
      clipLogId,
      phase,
      aiScore: score,
      aiFeedback: feedback,
      correctedScore,
      note: note.trim(),
    });
    setState(r.status === "saved" ? "saved" : "error");
    if (r.status === "saved") setEditing(false);
  };

  return (
    <div className="rounded-xl bg-surface-hover p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium text-accent">
          {phase}
          {score != null && <span className="ml-2 text-muted">{score}/10</span>}
        </div>
        {state === "saved" ? (
          <span className="text-xs text-green-400">Correction saved</span>
        ) : (
          !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Correct this
            </button>
          )
        )}
      </div>
      <p className="text-sm text-muted leading-relaxed">{feedback}</p>
      {editing && (
        <div className="mt-3 space-y-2 border-t border-surface pt-3">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`correct-${phase}`} className="text-muted">
              Right score:
            </label>
            <select
              id={`correct-${phase}`}
              value={correctedScore}
              onChange={(e) => setCorrectedScore(Number(e.target.value))}
              className="rounded-lg bg-surface px-2 py-1 text-sm"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did it miss? (e.g. elbow flares on the hook — that caps this at 4)"
            rows={2}
            className="w-full rounded-lg bg-surface px-3 py-2 text-sm placeholder:text-muted/60"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={state === "saving"}
              className="rounded-lg bg-surface px-3 py-1.5 text-sm hover:text-foreground transition-colors disabled:opacity-60"
            >
              {state === "saving" ? "Saving…" : "Save correction"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            {state === "error" && (
              <span className="text-xs text-red-400">Save failed — retry</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);
  const [punchType, setPunchType] = useState<PunchSlug | null>(null);
  const [discussing, setDiscussing] = useState(false);
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
    setCurrentClipId(null);
    setPunchType(null);
    setDiscussing(false);
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
    // up to 30fps (native phone framerate), long clips degrade gracefully.
    // "All the frames" isn't possible: the API caps at 100 images per request,
    // and Vercel's 4.5MB body limit keeps the budget at 80.
    const totalFrames = Math.max(1, Math.min(80, Math.ceil(duration * 30)));
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
        body: JSON.stringify({ frames, fps, filename: videoFile.name, punchType, userId }),
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
          punchType,
          promptVersion: result.promptVersion,
        }).then((res) => {
          if (res.status === "saved") {
            setRecentClips((prev) => [res.clip, ...prev]);
            setCurrentClipId(res.clip.id);
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
  }, [videoFile, extractFrames, userId, recentClips, punchType]);

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
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Summary</h3>
            {punchLabel(punchType) && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
                <Dumbbell size={12} />
                {punchLabel(punchType)}
              </span>
            )}
          </div>
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
            <PhaseCard
              key={i}
              phase={p.phase}
              feedback={p.feedback}
              score={typeof p.score === "number" ? p.score : null}
              userId={userId ?? "anon"}
              clipLogId={currentClipId}
            />
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

        {/* Follow-up dialog about THIS clip. The embedded chat gets clipLogId,
            so the route loads these scores and the punch's instruction set into
            its context. Only offered once the clip has actually persisted —
            without a row id there is nothing for the coach to look up. */}
        {currentClipId &&
          (discussing ? (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-semibold">Talk it through</span>
                <button
                  onClick={() => setDiscussing(false)}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Hide
                </button>
              </div>
              <div className="h-[32rem]">
                <ChatTab
                  systemContext="technique"
                  placeholder="Ask about this clip…"
                  suggestions={[]}
                  heroIcon={MessageSquare}
                  heroTitle="Talk it through"
                  heroSubtitle="Ask anything about this clip."
                  initialQuery="Walk me through this analysis — what should I fix first?"
                  extraContext={{ clipLogId: currentClipId }}
                  storageKeyOverride={`boxing-coach-clip-${currentClipId}`}
                  userId={userId}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDiscussing(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent/10 py-2.5 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
            >
              <MessageSquare size={14} />
              Talk it through with the coach
            </button>
          ))}

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
            <p className="text-xs text-muted">Up to 40 seconds — trim to one punch per clip; shorter videos get sharper analysis</p>
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

          {!analyzing && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Which punch should I assess?</legend>
              <p className="text-xs text-muted">
                Each punch is scored against its own protocol — picking the right one is
                what makes the feedback specific.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {PUNCH_TYPES.map((p) => {
                  const selected = punchType === p.slug;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setPunchType(p.slug)}
                      aria-pressed={selected}
                      className={`rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        selected
                          ? "bg-accent text-white"
                          : "bg-surface-hover text-muted hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
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
                disabled={!!error || !punchType}
                title={!punchType ? "Pick a punch first" : undefined}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {punchType ? `Analyze ${punchLabel(punchType)?.toLowerCase()}` : "Pick a punch first"}
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
