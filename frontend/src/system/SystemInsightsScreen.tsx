import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle } from "../components";
import { systemApi, type InsightBlock, type InsightCell, type Insights } from "./api";

export interface SystemInsightsScreenProps {
  accessToken: string;
}

const RANGES = [7, 30, 90] as const;
const RANGE_KEY = "platform-system:insights-days";
const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const INSIGHTS_CSS = `
.ps-insights .ps-tile { min-height: 100%; }
.ps-insights .ps-tile-value { font-size: 1.5rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.ps-insights .ps-spark { display: block; width: 100%; height: 36px; margin-top: .35rem; }
.ps-insights .ps-spark .ps-spark-line { fill: none; stroke: var(--tblr-primary, #066fd1); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.ps-insights .ps-spark .ps-spark-area { fill: var(--tblr-primary, #066fd1); opacity: .08; }
.ps-insights .ps-spark rect.ps-hit { fill: transparent; }
.ps-insights .ps-spark rect.ps-hit:hover { fill: var(--tblr-primary, #066fd1); opacity: .12; }
.ps-insights .ps-bar { display: flex; align-items: center; gap: .5rem; min-width: 8rem; }
.ps-insights .ps-bar-track { flex: 1; height: 6px; border-radius: 3px; background: var(--tblr-bg-surface-secondary, #f1f5f9); overflow: hidden; }
.ps-insights .ps-bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--tblr-primary, #066fd1); }
.ps-insights td.ps-heat { position: relative; text-align: right; font-variant-numeric: tabular-nums; }
.ps-insights td.ps-heat > span { position: relative; }
.ps-insights td.ps-heat::before { content: ""; position: absolute; inset: 2px; border-radius: 4px; background: var(--tblr-primary, #066fd1); opacity: var(--ps-heat, 0); }
.ps-insights .table td, .ps-insights .table th { white-space: nowrap; }
`;

function readDays(): number {
  try {
    const stored = Number(window.localStorage.getItem(RANGE_KEY));
    return (RANGES as readonly number[]).includes(stored) ? stored : 30;
  } catch {
    return 30;
  }
}

function formatValue(value: number, unit: string): string {
  return `${NUMBER.format(value)}${unit}`;
}

/**
 * One series as a tile: its value over the range (a total's latest value,
 * a daily count's sum), the change against the period before, and a
 * sparkline of the range - each day hoverable for its exact value.
 */
function SeriesTile({ series, start }: { series: Insights["series"][number]; start: string }) {
  const current = series.points.filter(([d]) => d >= start);
  const previous = series.points.filter(([d]) => d < start);
  const sum = (points: [string, number][]) => points.reduce((total, [, v]) => total + v, 0);
  const daily = series.kind === "daily";
  const value = daily ? sum(current) : (current.at(-1)?.[1] ?? 0);
  const before = daily ? (previous.length ? sum(previous) : null) : (previous.at(-1)?.[1] ?? null);
  const change = before === null ? null : value - before;
  const changeText =
    change === null
      ? "No earlier data"
      : change === 0
        ? "No change"
        : `${change > 0 ? "▲" : "▼"} ${formatValue(Math.abs(change), series.unit)}${before ? ` (${Math.round((100 * Math.abs(change)) / Math.abs(before))}%)` : ""}`;

  const width = 240;
  const height = 36;
  const values = current.map(([, v]) => v);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = current.length > 1 ? width / (current.length - 1) : 0;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const line = current.map(([, v], i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join("");

  return (
    <div className="col-6 col-md-4 col-xl-3">
      <div className="ps-tile" title={series.help || undefined}>
        <div className="text-secondary small text-truncate">{series.label}</div>
        <div className="ps-tile-value">{formatValue(value, series.unit)}</div>
        <div className="text-secondary small">
          {changeText}
          {change !== null && <span className="visually-hidden"> compared with the previous period</span>}
        </div>
        {current.length > 1 && (
          <svg className="ps-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${series.label} per day`}>
            <path className="ps-spark-area" d={`${line}L${width},${height}L0,${height}Z`} />
            <path className="ps-spark-line" d={line} vectorEffect="non-scaling-stroke" />
            {current.map(([d, v], i) => (
              <rect key={d} className="ps-hit" x={Math.max(0, i * step - step / 2)} y={0} width={step || width} height={height}>
                <title>{`${DAY.format(new Date(`${d}T00:00:00`))}: ${formatValue(v, series.unit)}`}</title>
              </rect>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

function Cell({ cell, align }: { cell: InsightCell; align?: "end" }) {
  const className = align === "end" ? "text-end" : undefined;
  if (cell === null || cell === undefined || typeof cell !== "object") return <td className={className}>{cell}</td>;
  if (cell.heat !== undefined)
    return (
      <td className="ps-heat" title={cell.hint} style={{ ["--ps-heat" as string]: String(0.08 + 0.6 * cell.heat) }}>
        <span>{cell.text}</span>
      </td>
    );
  if (cell.bar !== undefined)
    return (
      <td title={cell.hint}>
        <div className="ps-bar">
          <span className="ps-bar-track" aria-hidden="true">
            <span className="ps-bar-fill" style={{ width: `${Math.max(0, Math.min(1, cell.bar)) * 100}%` }} />
          </span>
          <span className="text-end" style={{ minWidth: "3rem", fontVariantNumeric: "tabular-nums" }}>
            {cell.text}
          </span>
        </div>
      </td>
    );
  return (
    <td className={className} title={cell.hint}>
      {cell.text}
    </td>
  );
}

function Block({ block }: { block: InsightBlock }) {
  if (block.kind === "tiles")
    return (
      <div className="mb-3">
        {block.title && <div className="fw-semibold mb-2">{block.title}</div>}
        <div className="row g-3">
          {block.items.map((item) => (
            <div key={item.label} className="col-6 col-md-4 col-xl-3" title={item.hint}>
              <div className="text-secondary small">{item.label}</div>
              <div className="ps-tile-value">{typeof item.value === "number" ? NUMBER.format(item.value) : item.value}</div>
              {item.hint && <div className="text-secondary small">{item.hint}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <div className="mb-3">
      {block.title && <div className="fw-semibold mb-2">{block.title}</div>}
      {block.rows.length === 0 ? (
        <div className="text-secondary small">{block.empty ?? "Nothing yet."}</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-vcenter card-table mb-0">
            <thead>
              <tr>
                {block.columns.map((column, i) => (
                  <th key={i} className={column.align === "end" ? "text-end" : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <Cell key={c} cell={cell} align={block.columns[c]?.align} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The admin's Insights page (`/api/v1/system-settings/insights`): how the
 * instance is used and how well it runs. Daily numbers every module
 * registers (`InsightSeries`) as tiles with the change against the
 * previous period and a sparkline, for the last 7, 30 or 90 days (also as
 * CSV), then each module's sections (`InsightSection`) - activation,
 * retention, adoption, quality - as tiles and tables.
 */
function SystemInsightsScreen({ accessToken }: SystemInsightsScreenProps) {
  const api = useMemo(() => systemApi(accessToken), [accessToken]);
  const [days, setDays] = useState(readDays);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .insights(days)
      .then((result) => !cancelled && setData(result))
      .catch((thrown: unknown) => !cancelled && setError(thrown instanceof Error ? thrown.message : String(thrown)));
    return () => {
      cancelled = true;
    };
  }, [api, days]);

  function pick(next: number) {
    setError(null);
    setDays(next);
    try {
      window.localStorage.setItem(RANGE_KEY, String(next));
    } catch {
      // Not remembered.
    }
  }

  async function downloadCsv() {
    try {
      const csv = await api.insightsCsv(days);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `insights-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }

  const groups = useMemo(() => {
    const byGroup = new Map<string, Insights["series"]>();
    for (const series of data?.series ?? []) byGroup.set(series.group, [...(byGroup.get(series.group) ?? []), series]);
    return [...byGroup];
  }, [data]);

  return (
    <div className="ps-insights">
      <style href="platform-system-insights" precedence="default">
        {INSIGHTS_CSS}
      </style>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="btn-group" role="group" aria-label="Range">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`btn btn-sm ${option === days ? "btn-primary" : "btn-outline-secondary"}`}
              aria-pressed={option === days}
              onClick={() => pick(option)}
            >
              {option} days
            </button>
          ))}
        </div>
        {data && (
          <span className="text-secondary small">
            {DAY.format(new Date(`${data.start}T00:00:00`))} – {DAY.format(new Date(`${data.end}T00:00:00`))}, compared with the{" "}
            {days} days before
          </span>
        )}
        <Button variant="secondary" outline size="sm" className="ms-auto" onClick={() => void downloadCsv()}>
          Export CSV
        </Button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!data ? (
        !error && <div className="text-secondary">Loading…</div>
      ) : (
        <div className="row g-3">
          {groups.map(([group, series]) => (
            <div key={group} className="col-12">
              <Card>
                <CardHeader>
                  <CardTitle>{group}</CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="row g-4">
                    {series.map((s) => (
                      <SeriesTile key={s.key} series={s} start={data.start} />
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          ))}
          {data.sections.map((section) => (
            <div key={section.key} className="col-12">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>{section.title}</CardTitle>
                    {section.description && <div className="text-secondary small">{section.description}</div>}
                  </div>
                </CardHeader>
                <CardBody>
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </CardBody>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SystemInsightsScreen;
