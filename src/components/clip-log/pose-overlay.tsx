"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Client-side skeleton overlay for the clip-review preview video.
// Visual layer only — no measurement, no numbers. If the model or GPU
// isn't available it silently renders nothing and the plain video shows through.

const TRAIL_LEN = 16; // frames of fading hand-path trail
type Pt = { x: number; y: number } | null;

// MediaPipe's GPU delegate needs a WebGL2 context. Some browsers/environments
// can't create one (WebGL disabled, context limit reached) — probing here lets
// us pick CPU up front instead of triggering MediaPipe's native emscripten error.
const supportsWebGL2 = () => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
};

export function PoseOverlay({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let landmarker: PoseLandmarker | null = null;
    let cancelled = false;
    let raf = 0;
    let lastTs = -1;
    const drawer = new DrawingUtils(ctx);
    const trailL: Pt[] = [];
    const trailR: Pt[] = [];

    const pushWrist = (trail: Pt[], p: NormalizedLandmark | undefined) => {
      trail.push(p && (p.visibility ?? 1) > 0.5 ? { x: p.x, y: p.y } : null);
      if (trail.length > TRAIL_LEN) trail.shift();
    };

    const drawTrail = (trail: Pt[], color: string) => {
      const w = canvas.width;
      const h = canvas.height;
      for (let k = 1; k < trail.length; k++) {
        const a = trail[k - 1];
        const b = trail[k];
        if (!a || !b) continue; // break across gaps
        const f = k / trail.length;
        ctx.globalAlpha = f;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, 11 * f);
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const scheduleNext = () => {
      const v = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => render());
      else raf = requestAnimationFrame(render);
    };

    const render = () => {
      if (cancelled || !landmarker) return;
      const w = video.clientWidth;
      const h = video.clientHeight;
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (video.readyState >= 2 && video.videoWidth) {
        const ts = performance.now();
        if (ts !== lastTs) {
          lastTs = ts;
          const lm = landmarker.detectForVideo(video, ts).landmarks?.[0];
          if (lm) {
            drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
              color: "#3cf0ff",
              lineWidth: 3,
            });
            drawer.drawLandmarks(lm, { color: "#ff8c28", radius: 3 });
            pushWrist(trailL, lm[15]);
            pushWrist(trailR, lm[16]);
          } else {
            pushWrist(trailL, undefined);
            pushWrist(trailR, undefined);
          }
          drawTrail(trailL, "#50ff50"); // lead hand
          drawTrail(trailR, "#ff5050"); // rear hand
        }
      }
      scheduleNext();
    };

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
        if (cancelled) return;
        const make = (delegate: "GPU" | "CPU") =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: "/pose_landmarker_lite.task",
              delegate,
            },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        try {
          landmarker = supportsWebGL2() ? await make("GPU") : await make("CPU");
        } catch {
          // GPU context creation failed at runtime — retry once on CPU.
          if (cancelled) return;
          landmarker = await make("CPU");
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        scheduleNext();
      } catch (e) {
        // Silent fallback: plain video remains visible, no overlay.
        console.warn("Pose overlay unavailable:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      landmarker?.close();
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
