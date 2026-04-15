CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(512),
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'transcript')),
  video_id text,
  video_title text,
  video_url text,
  pdf_file text,
  chunk_index int NOT NULL,
  techniques text[] DEFAULT '{}',
  fighters text[] DEFAULT '{}',
  category text NOT NULL CHECK (category IN ('mechanics', 'analysis', 'drill', 'injury_prevention', 'theory')),
  char_count int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX content_chunks_embedding_idx ON content_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX content_chunks_category_idx ON content_chunks (category);
CREATE INDEX content_chunks_source_type_idx ON content_chunks (source_type);

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(512),
  match_count int DEFAULT 10,
  filter_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  source_type text,
  video_id text,
  video_title text,
  video_url text,
  pdf_file text,
  chunk_index int,
  techniques text[],
  fighters text[],
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.content,
    cc.source_type,
    cc.video_id,
    cc.video_title,
    cc.video_url,
    cc.pdf_file,
    cc.chunk_index,
    cc.techniques,
    cc.fighters,
    cc.category,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM content_chunks cc
  WHERE (filter_categories IS NULL OR cc.category = ANY(filter_categories))
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
