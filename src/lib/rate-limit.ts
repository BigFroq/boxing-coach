import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const ratelimit =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        analytics: false,
        prefix: "boxing-coach",
      })
    : null;

export function getRateLimitKey(
  request: Request,
  userId: string | undefined
): string {
  if (userId && userId !== "anon") return `user:${userId}`;
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || "unknown";
  return `ip:${ip}`;
}

export async function enforceRateLimit(
  request: Request,
  userId?: string
): Promise<Response | null> {
  if (!ratelimit) return null; // soft-fail if unconfigured (dev)
  const key = getRateLimitKey(request, userId);
  const { success, limit, remaining, reset } = await ratelimit.limit(key);
  if (!success) {
    return new Response(
      JSON.stringify({ error: "Too many requests", retryAfter: reset }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }
  return null;
}
