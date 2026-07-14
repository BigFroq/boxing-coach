import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

// Renders the uploaded clip with the pose skeleton baked in, as a real
// video file the user can download or share. Uses canvas.captureStream +
// MediaRecorder (MP4 on Chrome/Safari, WebM fallback), so the export runs
// in real time — the clip plays through once, silently.

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  "video/webm",
];

export interface AnnotatedClipExport {
  blob: Blob;
  extension: "mp4" | "webm";
}

export async function exportAnnotatedClip(
  srcUrl: string,
  onProgress: (fraction: number) => void
): Promise<AnnotatedClipExport> {
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error("This browser can't record video");

  const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
  const makeLandmarker = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/pose_landmarker_lite.task",
        delegate,
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  // The results-screen overlay already holds a WebGL context; a second GPU
  // delegate can fail to get one, so fall back to CPU for the export.
  const landmarker = await makeLandmarker("GPU").catch(() => makeLandmarker("CPU"));

  const video = document.createElement("video");
  video.src = srcUrl;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load clip for export"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  const drawer = new DrawingUtils(ctx);

  // Route the clip's audio into the recording without playing it out loud:
  // a MediaElementSource disconnects the element from the speakers. A
  // suspended AudioContext emits no samples and stalls the MP4 muxer, so
  // only include audio if the context is actually running.
  const audioCtx = new AudioContext();
  await audioCtx.resume().catch(() => {});
  const stream = canvas.captureStream(30);
  if (audioCtx.state === "running") {
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaElementSource(video).connect(dest);
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  } else {
    video.muted = true;
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  // Drive drawing with a timer: rAF and requestVideoFrameCallback don't
  // fire for an off-DOM video (they're tied to compositing), which would
  // leave the recording empty.
  let warned = false;
  const draw = () => {
    if (video.readyState < 2) return; // no frame data yet
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const lm = landmarker.detectForVideo(video, performance.now()).landmarks?.[0];
      if (lm) {
        drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#3cf0ff",
          lineWidth: 3,
        });
        drawer.drawLandmarks(lm, { color: "#ff8c28", radius: 3 });
      }
    } catch (e) {
      // skeleton skipped this frame; plain frame still recorded
      if (!warned) {
        warned = true;
        console.warn("Export skeleton draw failing:", e);
      }
    }
  };
  const drawTimer = setInterval(draw, 1000 / 30);

  const ended = new Promise<void>((resolve) => {
    video.onended = () => resolve();
  });
  const progressTimer = setInterval(() => {
    if (video.duration) onProgress(video.currentTime / video.duration);
  }, 200);

  try {
    recorder.start(1000);
    // Autoplay policy can block unmuted playback; fall back to a silent export.
    await video.play().catch(() => {
      video.muted = true;
      return video.play();
    });
    await ended;
  } finally {
    clearInterval(drawTimer);
    clearInterval(progressTimer);
    landmarker.close();
    void audioCtx.close();
  }

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  return {
    blob: new Blob(chunks, { type: mimeType }),
    extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
  };
}
