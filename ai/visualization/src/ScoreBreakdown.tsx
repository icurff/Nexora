import { useState } from 'react';

export interface RankingBreakdown {
  session_score: number | null;
  popularity_score: number | null;
  user_score: number | null;
  session_weight: number;
  popularity_weight: number;
  user_weight: number;
  session_contribution: number;
  popularity_contribution: number;
  user_contribution: number;
  final_score: number;
}

export interface RankingItem {
  id: string;
  name?: string;
  rank?: number;
  breakdown?: RankingBreakdown;
}

const metrics = [
  {
    label: 'Session LightGCN',
    key: 'session_contribution',
    weight: 'session_weight',
    color: '#2dd4bf',
  },
  {
    label: 'Popularity',
    key: 'popularity_contribution',
    weight: 'popularity_weight',
    color: '#7095f5',
  },
  {
    label: 'User Embedding',
    key: 'user_contribution',
    weight: 'user_weight',
    color: '#c084fc',
  },
] as const;

export function parseBreakdown(
  value: unknown,
  score: number,
): RankingBreakdown | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const b = value as RankingBreakdown;

  const required = [
    b.session_weight,
    b.popularity_weight,
    b.user_weight,
    b.session_contribution,
    b.popularity_contribution,
    b.user_contribution,
    b.final_score,
  ];

  if (!required.every(Number.isFinite)) return undefined;

  const weights = [
    b.session_weight,
    b.popularity_weight,
    b.user_weight,
  ];

  if (weights.some((w) => w < 0 || w > 1))
    return undefined;

  if (Math.abs(weights.reduce((a, v) => a + v, 0) - 1) > 1e-5)
    return undefined;

  for (const [raw, weight, contribution] of [
    [b.session_score, b.session_weight, b.session_contribution],
    [b.popularity_score, b.popularity_weight, b.popularity_contribution],
    [b.user_score, b.user_weight, b.user_contribution],
  ] as const) {
    if (raw === null) {
      if (weight !== 0 || contribution !== 0) return undefined;
    } else if (
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      Math.abs(raw * weight - contribution) > 1e-5
    ) {
      return undefined;
    }
  }

  const total =
    b.session_contribution +
    b.popularity_contribution +
    b.user_contribution;

  if (
    Math.abs(total - b.final_score) > 1e-5 ||
    Math.abs(b.final_score - score) > 1e-5
  ) return undefined;

  return b;
}

export function ScoreBreakdown({
  items,
}: {
  items: RankingItem[];
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');

  const ranked = items
    .filter(
      (item): item is RankingItem & {
        breakdown: RankingBreakdown;
      } => !!item.breakdown,
    )
    .slice()
    .sort(
      (a, b) =>
        b.breakdown.final_score - a.breakdown.final_score,
    );

  if (!ranked.length) return null;

  const a = ranked.find((i) => i.id === first) ?? ranked[0];
  const b = ranked.find((i) => i.id === second) ?? ranked[1];

  const policy = ranked[0].breakdown;
  const scale = Math.max(
    0.01,
    ...ranked.flatMap((item) =>
      metrics.map((m) => Math.abs(item.breakdown[m.key])),
    ),
  );

  const delta = b ? a.breakdown.final_score - b.breakdown.final_score : 0;
  const winner = delta >= 0 ? a : b;
  const loser = delta >= 0 ? b : a;
  const advantages = winner && loser
    ? metrics.filter((m) => winner.breakdown[m.key] - loser.breakdown[m.key] > 1e-8)
    : [];
  const disadvantages = winner && loser
    ? metrics.filter((m) => winner.breakdown[m.key] - loser.breakdown[m.key] < -1e-8)
    : [];

  const samePolicy = ranked.every((item) =>
    metrics.every(
      (m) => item.breakdown[m.weight] === policy[m.weight],
    ),
  );

  return (
    <section className="ranking-breakdown">
      <h3>Explainable Ranking</h3>
      <p className="hint">
        Phân tích điểm thực tế từ AI Serving.
        Điểm chuẩn hóa không phải xác suất.
      </p>

      {samePolicy && (
        <div className="ranking-weights">
          {metrics
            .filter((m) => policy[m.weight] > 0)
            .map((m) => (
              <div key={m.key}>
                <small>{m.label}</small>
                <strong style={{ color: m.color }}>
                  {(policy[m.weight] * 100).toFixed(0)}%
                </strong>
              </div>
            ))}
        </div>
      )}

      <div className="ranking-table-scroll">
        <table className="ranking-table">
          <thead>
            <tr>
              <th scope="col">Hạng</th>
              <th scope="col">Sản phẩm</th>
              {metrics.filter((m) => ranked.some((i) => i.breakdown[m.weight] > 0)).map((m) => (
                <th scope="col" key={m.key}>{m.label}</th>
              ))}
              <th scope="col">Tổng điểm</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item, index) => (
              <tr key={item.id}>
                <td>#{item.rank ?? index + 1}</td>
                <td>
                  <div className="ranking-product-name" title={item.name ?? `Item ${item.id}`}>
                    {item.name ?? `Item ${item.id}`}
                  </div>
                  {item.name && <small>ID #{item.id}</small>}
                </td>
                {metrics.filter((m) => ranked.some((i) => i.breakdown[m.weight] > 0)).map((m) => {
                  const value = item.breakdown[m.key];
                  const width = Math.abs(value) / scale * 50;
                  return (
                    <td key={m.key}>
                      <strong style={{ color: m.color }}>{value.toFixed(4)}</strong>
                      <div className="ranking-track" aria-hidden="true">
                        <div className="ranking-fill" style={{
                          background: m.color,
                          width: `${width}%`,
                          left: value >= 0 ? '50%' : `${50 - width}%`,
                        }} />
                      </div>
                    </td>
                  );
                })}
                <td className="ranking-final">{item.breakdown.final_score.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Các cột thành phần là điểm đã nhân trọng số. Vạch giữa biểu thị 0.</p>

      {ranked.length >= 2 && b && (
        <div className="ranking-comparison">
          <h3>Vì sao thứ hạng khác nhau?</h3>

          <div className="ranking-selects">
          <label>Sản phẩm A
          <select
            value={a.id}
            onChange={(e) => setFirst(e.target.value)}
          >
            {ranked.map((i) => (
              <option key={i.id} value={i.id}>
                #{i.rank ?? ranked.indexOf(i) + 1} · {i.id} · {i.name ? i.name.slice(0, 65) : 'Item'}
              </option>
            ))}
          </select>
          </label>
          <label>Sản phẩm B
          <select
            value={b.id}
            onChange={(e) => setSecond(e.target.value)}
          >
            {ranked.map((i) => (
              <option key={i.id} value={i.id}>
                #{i.rank ?? ranked.indexOf(i) + 1} · {i.id} · {i.name ? i.name.slice(0, 65) : 'Item'}
              </option>
            ))}
          </select>
          </label>
          </div>

          {metrics.map((m) => {
            const delta =
              a.breakdown[m.key] - b.breakdown[m.key];

            return (
              <div className="ranking-delta" key={m.key}>
                <span>{m.label}</span>
                <strong style={{ color: m.color }}>
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(4)}
                </strong>
              </div>
            );
          })}

          <hr />

          <strong>
            Chênh lệch tổng điểm:{' '}
            {(a.breakdown.final_score -
              b.breakdown.final_score).toFixed(4)}
          </strong>

          <p className="hint">
            {a.id === b.id
              ? 'Hãy chọn hai sản phẩm khác nhau.'
              : a.breakdown.final_score > b.breakdown.final_score
                ? `A xếp trên B nhờ ${advantages.map((m) => m.label).join(', ')}${disadvantages.length ? `, bù lại bất lợi ở ${disadvantages.map((m) => m.label).join(', ')}` : ''}.`
                : a.breakdown.final_score < b.breakdown.final_score
                  ? `B xếp trên A nhờ ${advantages.map((m) => m.label).join(', ')}${disadvantages.length ? `, bù lại bất lợi ở ${disadvantages.map((m) => m.label).join(', ')}` : ''}.`
                  : 'Hai sản phẩm có cùng tổng điểm; thứ tự phụ thuộc quy tắc xử lý đồng hạng.'}
          </p>
        </div>
      )}
    </section>
  );
}
