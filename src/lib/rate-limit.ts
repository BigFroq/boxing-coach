import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const ratelimit =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        analytics: false,
        prefix: "boxing-coach",
      })
    : null;

// Key on IP only: userId comes from the unauthenticated request body, so a
// caller rotating userIds would mint a fresh bucket per request.
function getRateLimitKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || "unknown";
  return `ip:${ip}`;
}

export async function enforceRateLimit(request: Request): Promise<Response | null> {
  if (!ratelimit) return null; // soft-fail if unconfigured (dev)
  const key = getRateLimitKey(request);
  const { success, limit, remaining, reset } = await ratelimit.limit(key);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: reset },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }
  return null;
}
