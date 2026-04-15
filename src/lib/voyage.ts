// Direct Voyage AI API calls — avoids voyageai SDK module resolution issues with Next.js bundler

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
    throw new Error(`Voyage AI error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as VoyageEmbedResponse;
  return data.data.map((d) => d.embedding);
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
