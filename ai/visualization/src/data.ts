export interface GraphNode {
  key: string;
  type: 'user' | 'item';
  index: number;
  sourceId: string;
  position: [number, number, number];
  vector: number[];
  norm: number;
  popularity: number | null;
  trainDegree: number | null;
  productId?: string;
  name?: string;
  layout?: 'schematic';
  observed?: boolean;
  recommendationSource?: 'lightgcn_session' | 'rule_based';
  mappingUnknown?: boolean;
}
export type GraphMode = 'interaction' | 'coldstart';
export interface GraphPair {
  source: string;
  target: string;
}
export interface GraphEdge extends GraphPair {
  cosine: number;
  dot: number;
}
export interface GraphData {
  schemaVersion: number;
  model: {
    family: string;
    runId: string;
    config: {
      embedding_dim: number;
      layers: number;
      positive_sampling: string;
      lr: number;
      l2_reg: number;
    };
    seed: number;
    bestEpoch: number;
  };
  totals: { users: number; items: number };
  sample: { users: number; items: number; seed: number };
  projection: { method: string; explainedVariance: number[] };
  provenance: {
    sha256: Record<string, string>;
    interactionEdgesExported: boolean;
    edgeMeaning: string;
    layerEmbeddingsAvailable: boolean;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  interactions: null | {
    totalEdges: number;
    sampledEligibleEdges: number;
    edgeLimit: number;
    edges: GraphPair[];
    source: string;
    sha256: string;
    popularityMatchesItemDegrees: boolean;
  };
}
export async function loadData(): Promise<GraphData> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/graph.json`);
  if (!response.ok)
    throw new Error(
      'Chưa có dữ liệu export. Chạy .venv/bin/python scripts/export_data.py trong ai/visualization, rồi tải lại.',
    );
  let value: GraphData;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      'Không đọc được graph.json. Hãy chạy script export dữ liệu rồi tải lại.',
    );
  }
  if (
    value.schemaVersion !== 2 ||
    !value.nodes?.length ||
    !value.model ||
    !value.edges ||
    typeof value.provenance?.interactionEdgesExported !== 'boolean' ||
    (value.provenance.interactionEdgesExported &&
      (!value.interactions || !Array.isArray(value.interactions.edges))) ||
    (!value.provenance.interactionEdgesExported && value.interactions !== null)
  )
    throw new Error(
      'Dữ liệu không đúng schema v2. Hãy export lại từ artifacts.',
    );
  return value;
}
