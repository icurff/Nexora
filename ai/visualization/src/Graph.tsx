import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SessionScene } from './session';
import type { GraphData, GraphNode, GraphMode } from './data';

interface Props {
  data: GraphData;
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
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const [error, setError] = useState('');
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
        color:
          props.mode === 'coldstart' && type === 'item'
            ? '#ffffff'
            : type === 'user'
              ? '#6b9fff'
              : '#52e3bd',
      });
      const mesh = new THREE.InstancedMesh(sphere, material, nodes.length);
      nodes.forEach((node, index) => {
        dummy.position.set(...node.position);
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
      )[0];
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
    let lastReset = -1,
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
      controls.autoRotate = p.rotate;
      meshes[0].mesh.visible = p.users && p.mode !== 'coldstart';
      sessionNode.visible =
        p.mode === 'coldstart' &&
        p.session.historyKeys.length +
          p.session.recommendationKeys.length +
          (p.session.ruleRecommendationKeys?.length ?? 0) >
          0;
      meshes[1].mesh.visible = p.items;
      const signature = `${p.selected}|${p.links}|${p.users}|${p.items}|${p.mode}|${p.session.historyKeys.join(',')}|${p.session.recommendationKeys.join(',')}|${p.session.ruleRecommendationKeys?.join(',')}`;
      if (signature !== previous) {
        previous = signature;
        const node = p.selected ? byKey.get(p.selected) : undefined;
        ring.visible =
          !!node &&
          (node.type === 'user' ? p.users && p.mode !== 'coldstart' : p.items);
        if (node) ring.position.set(...node.position);
        const positions: number[] = [];
        if (p.mode === 'interaction' && p.users && p.items)
          for (const edge of p.data.interactions?.edges ?? []) {
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
        lineMaterial.opacity = p.links ? 0.55 : 0.8;
        for (const [object, keys] of [
          [historyLines, p.session.historyKeys],
          [recommendationLines, p.session.recommendationKeys],
          [ruleLines, p.session.ruleRecommendationKeys ?? []],
        ] as const) {
          const segments: number[] = [];
          if (p.mode === 'coldstart' && p.items)
            for (const key of new Set(keys)) {
              const target = byKey.get(key);
              if (target?.type === 'item')
                segments.push(...sessionPosition.toArray(), ...target.position);
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
