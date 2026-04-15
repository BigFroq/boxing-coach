-- Migration: Knowledge Graph tables, search function, and centrality computation

CREATE TABLE knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN (
    'concept', 'fighter', 'technique', 'phase', 'drill', 'injury_prevention'
  )),
  content text NOT NULL,
  aliases text[] DEFAULT '{}',
  embedding vector(512),
  centrality float DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX knowledge_nodes_embedding_idx ON knowledge_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
CREATE INDEX knowledge_nodes_type_idx ON knowledge_nodes (node_type);
CREATE INDEX knowledge_nodes_slug_idx ON knowledge_nodes (slug);

CREATE TABLE knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node uuid REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_chunk uuid REFERENCES content_chunks(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'REQUIRES', 'DEMONSTRATES', 'TRAINS', 'SOURCED_FROM',
    'CORRECTS', 'SEQUENCES', 'RELATED'
  )),
  weight float DEFAULT 0.8 CHECK (weight >= 0 AND weight <= 1),
  evidence text,
  source_chunk uuid REFERENCES content_chunks(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT edge_has_target CHECK (target_node IS NOT NULL OR target_chunk IS NOT NULL)
);

CREATE INDEX knowledge_edges_source_idx ON knowledge_edges (source_node);
CREATE INDEX knowledge_edges_target_node_idx ON knowledge_edges (target_node);
CREATE INDEX knowledge_edges_target_chunk_idx ON knowledge_edges (target_chunk);
CREATE INDEX knowledge_edges_type_idx ON knowledge_edges (edge_type);

CREATE TABLE query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  context text,
  sub_queries text[],
  retrieved_node_ids uuid[],
  retrieved_chunk_ids uuid[],
  response_preview text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION search_graph(
  query_embedding vector(512),
  entry_keywords text[],
  max_hops int DEFAULT 2,
  max_results int DEFAULT 20
)
RETURNS TABLE (
  item_type text,
  item_id uuid,
  content text,
  title text,
  node_type text,
  video_url text,
  hop_distance int,
  edge_weight float,
  node_centrality float,
  graph_score float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
  entry_nodes AS (
    SELECT
      kn.id,
      kn.title,
      kn.content,
      kn.node_type,
      kn.centrality,
      0 AS hop,
      1.0::float AS path_weight,
      (1 - (kn.embedding <=> query_embedding))::float AS vector_sim
    FROM knowledge_nodes kn
    WHERE (
      kn.title ILIKE ANY(SELECT '%' || k || '%' FROM unnest(entry_keywords) k)
      OR kn.aliases && entry_keywords
    )
    ORDER BY kn.embedding <=> query_embedding
    LIMIT 5
  ),
  traversal AS (
    SELECT id, title, content, node_type, centrality, hop, path_weight, vector_sim,
           ARRAY[id] AS visited
    FROM entry_nodes
    UNION ALL
    (SELECT
      kn.id, kn.title, kn.content, kn.node_type, kn.centrality,
      t.hop + 1,
      t.path_weight * ke.weight,
      0::float,
      t.visited || kn.id
    FROM traversal t
    JOIN knowledge_edges ke ON ke.source_node = t.id
    JOIN knowledge_nodes kn ON kn.id = ke.target_node
    WHERE t.hop < max_hops AND NOT (kn.id = ANY(t.visited))
    UNION ALL
    SELECT
      kn.id, kn.title, kn.content, kn.node_type, kn.centrality,
      t.hop + 1,
      t.path_weight * ke.weight,
      0::float,
      t.visited || kn.id
    FROM traversal t
    JOIN knowledge_edges ke ON ke.target_node = t.id
    JOIN knowledge_nodes kn ON kn.id = ke.source_node
    WHERE t.hop < max_hops AND NOT (kn.id = ANY(t.visited)))
  )
  SELECT
    'node'::text AS item_type,
    t.id AS item_id,
    t.content,
    t.title,
    t.node_type,
    NULL::text AS video_url,
    t.hop AS hop_distance,
    t.path_weight AS edge_weight,
    t.centrality AS node_centrality,
    (t.path_weight * (1.0 / (t.hop + 1)) * GREATEST(t.centrality, 0.1))::float AS graph_score
  FROM traversal t

  UNION ALL

  SELECT
    'chunk'::text,
    cc.id,
    cc.content,
    cc.video_title,
    cc.category,
    cc.video_url,
    t.hop + 1,
    t.path_weight * ke.weight,
    t.centrality,
    (t.path_weight * ke.weight * (1.0 / (t.hop + 2)) * GREATEST(t.centrality, 0.1))::float
  FROM traversal t
  JOIN knowledge_edges ke ON ke.source_node = t.id AND ke.target_chunk IS NOT NULL
  JOIN content_chunks cc ON cc.id = ke.target_chunk

  ORDER BY graph_score DESC
  LIMIT max_results;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_centrality()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE knowledge_nodes kn SET centrality = COALESCE(scores.raw / max_scores.max_raw, 0)
  FROM (
    SELECT node_id, SUM(weight) AS raw FROM (
      SELECT source_node AS node_id, weight FROM knowledge_edges
      UNION ALL
      SELECT target_node AS node_id, weight FROM knowledge_edges WHERE target_node IS NOT NULL
    ) edges GROUP BY node_id
  ) scores,
  (SELECT MAX(raw) AS max_raw FROM (
    SELECT node_id, SUM(weight) AS raw FROM (
      SELECT source_node AS node_id, weight FROM knowledge_edges
      UNION ALL
      SELECT target_node AS node_id, weight FROM knowledge_edges WHERE target_node IS NOT NULL
    ) edges GROUP BY node_id
  ) s) max_scores
  WHERE kn.id = scores.node_id;

  UPDATE knowledge_nodes SET centrality = 0
  WHERE id NOT IN (
    SELECT source_node FROM knowledge_edges
    UNION
    SELECT target_node FROM knowledge_edges WHERE target_node IS NOT NULL
  );
END;
$$;
