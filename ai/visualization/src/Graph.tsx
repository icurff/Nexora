import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SessionScene } from './session';
import type { GraphData, GraphNode, GraphMode } from './data';
import { useAnalysis } from './GraphAnalysis';
import type { AnalysisState, ColorMode } from './GraphAnalysis';

interface Props {
  data: GraphData;
  referenceData?: GraphData;
  mode: GraphMode;
  session: SessionScene;
  users: boolean;
  items: boolean;
  rotate: boolean;
  links: boolean;
  selected: string | null;
  reset: number;
  onSelect: (key: string) => void;
}
export function Graph(props: Props) {
  const a = useAnalysis(props.data, props.referenceData ?? props.data, props.mode, props.selected, props.session);
  return <>
    <GraphScene {...props} data={a.sceneData} analysis={a.analysis} />
    <details style={{ position: 'absolute', top: 8, right: 8, zIndex: 5, width: 'min(245px, 48%)', maxHeight: '85%', overflow: 'auto', background: '#111c2eee', color: '#dce7f7', border: '1px solid #34465c', borderRadius: 8, padding: 8, fontSize: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Phân tích embedding</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <label>Color by <select value={a.colorMode} onChange={e => a.setColorMode(e.target.value as ColorMode)}>
          <option value="status">Trạng thái</option><option value="category">Category</option><option value="popularity">Popularity</option>
        </select></label>
        {a.colorMode === 'category' && <div style={{ maxHeight: 130, overflow: 'auto' }}>
          {a.metadataError ? <small>{a.metadataError}</small> : <small>{a.categories.length} danh mục DB</small>}
          {a.categories.map(c => <div key={c}><span style={{ color: a.categoryColors[c] }}>● </span>{c}</div>)}
        </div>}
        {a.colorMode === 'popularity' && <small><span style={{color: '#456cff'}}>● Thấp</span> — <span style={{color: '#ff4949'}}>● Cao</span> · log(1 + popularity)</small>}
        <button disabled={!a.anchor} onClick={a.focus}>Focus selected node</button>
        <label><input type="checkbox" checked={a.showSimilar} onChange={e => a.setShowSimilar(e.target.checked)} /> Top-K similar items</label>
        <label>K <select value={a.topK} onChange={e => a.setTopK(Number(e.target.value))}>{[3,5,10,20].map(k => <option key={k}>{k}</option>)}</select></label>
        <label><input type="checkbox" checked={a.hide} onChange={e => a.setHide(e.target.checked)} /> Hide unrelated nodes</label>
        {a.anchor ? <small>{a.anchor.name ?? a.meta.get(a.anchor.sourceId)?.name ?? a.anchor.sourceId} · {a.anchor.vector.length}D</small> : <small>Chọn node trên graph để phân tích.</small>}
        {a.showSimilar && <div style={{ maxHeight: 160, overflow: 'auto' }}>
          <small>Cosine trên vector gốc · {a.neighbors.length} Item · không phải ranking API</small>
          {a.neighbors.map((n, i) => <button key={n.key} style={{display:'block', width:'100%', textAlign:'left', marginTop:4, fontSize:11}} onClick={() => props.onSelect(n.key)}>{i+1}. {n.node.name ?? a.meta.get(n.node.sourceId)?.name ?? n.node.sourceId} · {n.cosine.toFixed(4)}</button>)}
          <small>Dây tím nét đứt: cosine; LIVE có thể hiện thêm Item từ model.</small>
        </div>}
        <small>Node phân tích: {a.sceneData.nodes.filter(n => (!a.analysis.visible || a.analysis.visible.has(n.key)) && (n.type === 'user' ? props.users : props.items)).length} / {a.sceneData.nodes.length} · số đếm tracking gốc không đổi.</small>
        {a.hide && <small>Ẩn node ngoài láng giềng / phiên / Top-K; tạm ẩn quỹ đạo, không đổi tọa độ.</small>}
      </div>
    </details>
  </>;
}
function GraphScene(props: Props & { analysis: AnalysisState }) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const savedCamera = useRef<{
    mode: GraphMode; run: string; reset: number;
    position: THREE.Vector3; target: THREE.Vector3;
  } | null>(null);
  const trail = useRef<Map<string, [number, number, number][]>>(new Map());
  const trailRun = useRef('');
  const [error, setError] = useState('');
  const lastFocus = useRef(0);
  useEffect(() => {
    current.current = props;
  });
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        'Không khởi tạo được WebGL. Hãy bật tăng tốc đồ họa hoặc thử trình duyệt hỗ trợ WebGL 2. Bạn vẫn có thể xem dữ liệu ở bảng bên cạnh.',
      );
      return;
    }
    setError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Không gian embedding 3D. Kéo để xoay, cuộn để zoom, kéo chuột phải để pan. Dùng ô tìm ID để chọn bằng bàn phím.',
    );
    renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 4;
    controls.maxDistance = 500;
    const sphere = new THREE.SphereGeometry(
      props.mode === 'coldstart' ? 1.2 : 0.48,
      10,
      8,
    );
    const meshes: { mesh: THREE.InstancedMesh; nodes: GraphNode[] }[] = [];
    const dummy = new THREE.Object3D();
    for (const type of ['user', 'item'] as const) {
      const nodes = props.data.nodes.filter((n) => n.type === type);
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
      });
      const mesh = new THREE.InstancedMesh(sphere, material, nodes.length);
      nodes.forEach((node, index) => {
        dummy.position.set(...node.position);
        dummy.scale.setScalar(node.sessionGeometry ? 1.5 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        if (props.mode === 'coldstart' && type === 'item')
          mesh.setColorAt(
            index,
            new THREE.Color(
              node.observed
                ? '#52e3bd'
                : node.recommendationSource === 'lightgcn_session'
                  ? '#f3bd70'
                  : node.recommendationSource === 'rule_based'
                    ? '#7c9eff'
                    : '#536279',
            ),
          );
      });
      mesh.computeBoundingSphere();
      scene.add(mesh);
      meshes.push({ mesh, nodes });
    }
    const grid = new THREE.PolarGridHelper(95, 12, 5, 96, '#20344a', '#172436');
    grid.position.y = -55;
    scene.add(grid);
    const axes = new THREE.AxesHelper(12);
    axes.position.set(-60, -55, 0);
    scene.add(axes);
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 12),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        wireframe: true,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.visible = false;
    scene.add(ring);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#56baa9',
      transparent: true,
      opacity: 0.13,
    });
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      lineMaterial,
    );
    scene.add(lines);
    const similarityLines = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#ce99ff', dashSize: 1.2, gapSize: 0.7, transparent: true, opacity: 0.85 }));
    scene.add(similarityLines);
    const sessionPosition = new THREE.Vector3(-55, 25, 0);
    const sessionNode = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 20, 16),
      new THREE.MeshBasicMaterial({ color: '#ce99ff' }),
    );
    sessionNode.position.copy(sessionPosition);
    scene.add(sessionNode);
    const historyLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: '#52e3bd',
        transparent: true,
        opacity: 0.9,
      }),
    );
    const recommendationLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: '#f3bd70',
        dashSize: 1.4,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.95,
      }),
    );
    const ruleLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: '#7c9eff',
        dashSize: 1.4,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.95,
      }),
    );
    scene.add(historyLines, recommendationLines, ruleLines);
    const byKey = new Map(props.data.nodes.map((n) => [n.key, n]));
    // Store only observed projected positions, never invented intermediate samples.
    if (trailRun.current !== props.data.model.runId || props.mode !== 'coldstart') {
      trail.current.clear();
      trailRun.current = props.data.model.runId;
    }
    const trailPoints: number[] = [];
    if (props.mode === 'coldstart') {
      const present = new Set(props.data.nodes.filter((n) => n.sessionGeometry).map((n) => n.key));
      for (const key of trail.current.keys()) if (!present.has(key)) trail.current.delete(key);
      for (const n of props.data.nodes) {
        if (!n.sessionGeometry) continue;
        const points = trail.current.get(n.key) ?? [];
        const last = points[points.length - 1];
        if (!last || Math.hypot(...n.position.map((v, i) => v - last[i])) > 1e-6)
          points.push([...n.position]);
        if (points.length > 20) points.shift();
        trail.current.set(n.key, points);
        for (let i = 1; i < points.length; i++)
          trailPoints.push(...points[i - 1], ...points[i]);
      }
    }
    const trajectory = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#ce99ff', transparent: true, opacity: 0.75 }),
    );
    trajectory.geometry.setAttribute('position', new THREE.Float32BufferAttribute(trailPoints, 3));
    scene.add(trajectory);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let start = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        meshes.filter((x) => x.mesh.visible).map((x) => x.mesh),
      ).find(h => {
        if (h.instanceId === undefined) return false;
        const n = meshes.find(x => x.mesh === h.object)?.nodes[h.instanceId];
        return !!n && (!current.current.analysis.visible || current.current.analysis.visible.has(n.key));
      });
      if (hit?.instanceId !== undefined) {
        const entry = meshes.find((x) => x.mesh === hit.object)!;
        current.current.onSelect(entry.nodes[hit.instanceId].key);
      }
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const saved = savedCamera.current;
    if (saved && saved.mode === props.mode && saved.run === props.data.model.runId &&
        saved.reset === props.reset) {
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
    } else {
      camera.position.set(75, 48, 120);
      controls.target.set(0, 0, 0);
    }
    controls.update();
    let lastReset = props.reset,
      previous = '',
      frame = 0;
    function animate() {
      const p = current.current;
      if (lastReset !== p.reset) {
        camera.position.set(75, 48, 120);
        controls.target.set(0, 0, 0);
        controls.update();
        lastReset = p.reset;
      }
      if (lastFocus.current !== p.analysis.focusToken) {
        lastFocus.current = p.analysis.focusToken;
        const selectedNode = p.selected ? byKey.get(p.selected) : undefined;
        if (selectedNode) {
          const target = new THREE.Vector3(...selectedNode.position);
          const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(24);
          camera.position.copy(target).add(offset);
          controls.target.copy(target);
          controls.update();
        }
      }
      controls.autoRotate = p.rotate;
      meshes[0].mesh.visible =
        p.users && (p.mode !== 'coldstart' || !!p.session.groups);
      sessionNode.visible =
        p.mode === 'coldstart' &&
        !p.session.groups &&
        p.session.historyKeys.length +
          p.session.recommendationKeys.length +
          (p.session.ruleRecommendationKeys?.length ?? 0) >
          0;
      meshes[1].mesh.visible = p.items;
      trajectory.visible = p.mode === 'coldstart' && p.users && !p.analysis.visible;
      const signature = `${p.analysis.signature}|${p.selected}|${p.links}|${p.users}|${p.items}|${p.mode}|${p.session.historyKeys.join(',')}|${p.session.recommendationKeys.join(',')}|${p.session.ruleRecommendationKeys?.join(',')}|${JSON.stringify(p.session.groups)}`;
      if (signature !== previous) {
        previous = signature;
        const allowed = (key: string) => !p.analysis.visible || p.analysis.visible.has(key);
        for (const { mesh, nodes } of meshes) {
          nodes.forEach((n, i) => {
            dummy.position.set(...n.position);
            dummy.scale.setScalar(allowed(n.key) ? (n.sessionGeometry ? 1.5 : 1) : 0);
            dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
            const color = n.type === 'user' ? (p.mode === 'coldstart' ? '#ce99ff' : '#6b9fff') :
              p.analysis.colors[n.key] ?? (p.mode === 'interaction' ? '#52e3bd' : n.observed ? '#52e3bd' :
              n.recommendationSource === 'lightgcn_session' ? '#f3bd70' : n.recommendationSource === 'rule_based' ? '#7c9eff' : '#536279');
            mesh.setColorAt(i, new THREE.Color(color));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        const similar: number[] = [];
        const anchor = p.selected ? byKey.get(p.selected) : undefined;
        if (anchor && p.items && (anchor.type === 'item' || p.users)) {
          for (const n of p.analysis.neighbors) {
            const target = byKey.get(n.key);
            if (target && allowed(target.key)) similar.push(...anchor.position, ...target.position);
          }
        }
        similarityLines.geometry.dispose();
        similarityLines.geometry = new THREE.BufferGeometry();
        similarityLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(similar, 3));
        similarityLines.computeLineDistances();
        const node = p.selected ? byKey.get(p.selected) : undefined;
        ring.visible = !!node && (node.type === 'user' ? p.users : p.items);
        if (node) ring.position.set(...node.position);
        const positions: number[] = [];
        if (p.mode === 'interaction' && p.users && p.items)
          for (const edge of p.data.interactions?.edges ?? []) {
            if (!allowed(edge.source) || !allowed(edge.target)) continue;
            if (
              p.links ||
              edge.source === p.selected ||
              edge.target === p.selected
            ) {
              positions.push(
                ...byKey.get(edge.source)!.position,
                ...byKey.get(edge.target)!.position,
              );
            }
          }
        lines.geometry.dispose();
        lines.geometry = new THREE.BufferGeometry();
        lines.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        );
        lineMaterial.color.set('#f3bd70');
        lineMaterial.opacity = p.links ? 0.20 : 0.8;
        for (const [object, field] of [
          [historyLines, 'historyKeys'],
          [recommendationLines, 'recommendationKeys'],
          [ruleLines, 'ruleRecommendationKeys'],
        ] as const) {
          const segments: number[] = [];
          const groups = p.session.groups ?? [{ source: '', ...p.session }];
          if (p.mode === 'coldstart' && p.items && p.users)
            for (const group of groups) {
              const origin = group.source
                ? byKey.get(group.source)?.position
                : sessionPosition.toArray();
              if (!origin || (group.source && !allowed(group.source))) continue;
              for (const key of new Set(group[field] ?? [])) {
                const target = byKey.get(key);
                if (target?.type === 'item' && allowed(key))
                  segments.push(...origin, ...target.position);
              }
            }
          object.geometry.dispose();
          object.geometry = new THREE.BufferGeometry();
          object.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(segments, 3),
          );
          object.computeLineDistances();
        }
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();
    return () => {
      savedCamera.current = {
        mode: props.mode, run: props.data.model.runId, reset: lastReset,
        position: camera.position.clone(), target: controls.target.clone(),
      };
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Scene lifetime follows the immutable export, controls read current props each frame.
  }, [props.data]);
  return (
    <div className="canvas-host" ref={host}>
      {error && (
        <p className="canvas-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
