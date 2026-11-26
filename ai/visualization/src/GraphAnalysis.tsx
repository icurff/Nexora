import { useEffect, useMemo, useState } from 'react';
import type { GraphData, GraphNode, GraphMode } from './data';
import type { SessionScene } from './session';

export type ColorMode = 'status' | 'category' | 'popularity';
type CategoryRow = { productId: string; sourceId: string; name: string; category: string };
export type Neighbor = { key: string; cosine: number; node: GraphNode };
export interface AnalysisState {
  colorMode: ColorMode;
  colors: Record<string, string>;
  visible: Set<string> | null;
  neighbors: Neighbor[];
  focusToken: number;
  signature: string;
}
const palette = (i: number, count: number) => `hsl(${Math.round(i * 360 / Math.max(count, 1))}, 78%, ${i % 2 ? 68 : 53}%)`;
export function cosine(a: number[], b: number[]): number | null {
  if (!a.length || a.length !== b.length) return null;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  const value = dot / Math.sqrt(aa * bb);
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : null;
}
export function useAnalysis(data: GraphData, reference: GraphData, mode: GraphMode,
  selected: string | null, session: SessionScene) {
  const [colorMode, setColorMode] = useState<ColorMode>('status');
  const [topK, setTopK] = useState(5);
  const [showSimilar, setShowSimilar] = useState(false);
  const [hide, setHide] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [metadata, setMetadata] = useState<CategoryRow[]>([]);
  const [metadataError, setMetadataError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/catalog500-categories.json`, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Chua export danh muc DB');
        const value = await res.json();
        if (value.runId !== reference.model.runId || !Array.isArray(value.items)) throw new Error('Sai model metadata');
        const ids = new Set(reference.nodes.filter(n => n.type === 'item').map(n => n.sourceId));
        const rows = value.items as CategoryRow[];
        if (rows.length !== ids.size || new Set(rows.map(r => r.sourceId)).size !== ids.size ||
          rows.some(r => !ids.has(r.sourceId) || typeof r.category !== 'string' || !r.category || typeof r.name !== 'string' || typeof r.productId !== 'string')) throw new Error('Mapping danh muc khong khop model');
        setMetadata(rows); setMetadataError('');
      }).catch((e: Error) => { if (!controller.signal.aborted) { setMetadata([]); setMetadataError(e.message); } });
    return () => controller.abort();
  }, [reference]);
  const meta = useMemo(() => new Map(metadata.map(r => [r.sourceId, r])), [metadata]);
  const categories = useMemo(() => [...new Set(metadata.map(r => r.category))].sort(), [metadata]);
  const categoryColors = useMemo(() => Object.fromEntries(categories.map((c, i) => [c, palette(i, categories.length)])), [categories]);
  const pool = useMemo(() => reference.nodes.filter(n => n.type === 'item'), [reference]);
  const baseItems = useMemo(() => new Map(data.nodes.filter(n => n.type === 'item').map(n => [n.sourceId, n])), [data]);
  const resolve = (node: GraphNode): GraphNode => {
    const m = meta.get(node.sourceId);
    return mode === 'coldstart' ? (baseItems.get(node.sourceId) ?? (m ? { ...node, key: `product:${m.productId}`, productId: m.productId, name: m.name, layout: 'pca' } : node)) : node;
  };
  const anchor = data.nodes.find(n => n.key === selected) ?? pool.map(resolve).find(n => n.key === selected);
  const neighbors: Neighbor[] = showSimilar && anchor ? pool.flatMap(n => {
    if (anchor.type === 'item' && n.sourceId === anchor.sourceId) return [];
    const score = cosine(anchor.vector, n.vector);
    const node = resolve(n);
    return score === null ? [] : [{ key: node.key, cosine: score, node }];
  }).sort((a, b) => b.cosine - a.cosine || a.key.localeCompare(b.key)).slice(0, topK) : [];
  const nodes = new Map(data.nodes.map(n => [n.key, n]));
  if (anchor) nodes.set(anchor.key, anchor);
  for (const n of neighbors) nodes.set(n.key, n.node);
  const related = new Set<string>();
  if (anchor) {
    related.add(anchor.key);
    for (const e of data.interactions?.edges ?? []) if (mode === 'interaction') {
      if (e.source === anchor.key) related.add(e.target);
      if (e.target === anchor.key) related.add(e.source);
    }
    if (mode === 'coldstart') for (const g of session.groups ?? []) {
      const keys = [...g.historyKeys, ...g.recommendationKeys, ...(g.ruleRecommendationKeys ?? [])];
      if (g.source === anchor.key) keys.forEach(k => related.add(k));
      if (keys.includes(anchor.key)) related.add(g.source);
    }
    neighbors.forEach(n => related.add(n.key));
  }
  const maxPopularity = Math.max(0, ...pool.map(n => n.popularity ?? 0));
  const colors: Record<string, string> = {};
  for (const n of nodes.values()) if (n.type === 'item') {
    if (colorMode === 'category') colors[n.key] = categoryColors[meta.get(n.sourceId)?.category ?? ''] ?? '#8794a6';
    if (colorMode === 'popularity') {
      const ratio = Math.log1p(Math.max(0, n.popularity ?? 0)) / (Math.log1p(maxPopularity) || 1);
      colors[n.key] = n.popularity === null ? '#8794a6' : `hsl(${Math.round(235 - 235 * ratio)}, 90%, 58%)`;
    }
  }
  // Do not recreate the WebGL scene when only analysis controls change.
  const extra = [...nodes.values()].filter(n => !data.nodes.some(old => old.key === n.key));
  const extraKey = JSON.stringify(extra);
  const sceneData = useMemo(() => extraKey === '[]' ? data : { ...data, nodes: [...data.nodes, ...JSON.parse(extraKey) as GraphNode[]] }, [data, extraKey]);
  const visible = hide && anchor ? related : null;
  const signature = JSON.stringify([colorMode, colors, visible ? [...visible] : null, neighbors.map(n => n.key)]);
  return { sceneData, anchor, neighbors, categories, categoryColors, meta, metadataError,
    colorMode, setColorMode, topK, setTopK, showSimilar, setShowSimilar, hide, setHide,
    focus: () => setFocusToken(n => n + 1),
    analysis: { colorMode, colors, visible, neighbors, focusToken, signature } as AnalysisState };
}
