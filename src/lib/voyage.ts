// Direct Voyage AI API calls with retry logic

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageEmbedResponse {
  data: { embedding: number[] }[];
}

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("Missing VOYAGE_API_KEY");
  return key;
}

async function callVoyageEmbed(input: string[], model: string): Promise<number[][]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({ input, model }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429 && attempt < 2) {
          const delay = 2000 * Math.pow(2, attempt);
          console.warn(`Voyage rate limited, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Voyage AI error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as VoyageEmbedResponse;
      return data.data.map((d) => d.embedding);
    } catch (err) {
      if (attempt < 2 && err instanceof TypeError) {
        // Network error — retry
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Voyage AI: max retries exceeded");
}

export async function embedText(text: string): Promise<number[]> {
  const embeddings = await callVoyageEmbed([text], "voyage-3-lite");
  return embeddings[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await callVoyageEmbed(batch, "voyage-3-lite");
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
