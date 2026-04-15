import { VoyageAIClient } from "voyageai";

let client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");
    client = new VoyageAIClient({ apiKey });
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const voyageClient = getClient();
  const result = await voyageClient.embed({
    input: [text],
    model: "voyage-3-lite",
  });
  return result.data![0].embedding!;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const voyageClient = getClient();
  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await voyageClient.embed({
      input: batch,
      model: "voyage-3-lite",
    });
    for (const item of result.data!) {
      allEmbeddings.push(item.embedding!);
    }
  }

  return allEmbeddings;
}
