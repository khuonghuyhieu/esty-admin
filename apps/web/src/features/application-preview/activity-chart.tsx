import { chartPoints, numberFormat } from "./fixtures";
import styles from "./application-preview.module.css";

export function ActivityChart() {
  const latest = chartPoints[chartPoints.length - 1];
  const strokes = chartPoints.map((point, index) => `${40 + index * 34},${190 - point.strokes * 0.085}`).join(" ");
  const sessions = chartPoints.map((point, index) => `${40 + index * 34},${190 - point.sessions * 0.085}`).join(" ");
  return <section className={styles.panel} aria-labelledby="canvas-title">
    <h2 id="canvas-title">Canvas activity</h2>
    <p className={styles.subtitle}>Daily strokes and live sessions over the past two weeks</p>
    <div className={styles.chartMetrics}>
      <div><p>Daily strokes</p><strong>{numberFormat.format(latest.strokes)}</strong><span className={styles.trend}>+12% vs yesterday</span></div>
      <div><p>Live sessions</p><strong>{latest.sessions}</strong><span className={styles.trend}>+8 vs last week</span></div>
    </div>
    <svg className={styles.chart} viewBox="0 0 500 220" role="img" aria-labelledby="chart-title" aria-describedby="chart-description">
      <title id="chart-title">Sample canvas activity, June 9–22</title>
      <desc id="chart-description">Daily strokes range from 860 to 1,842 and live sessions from 21 to 47. The solid peach line shows strokes; the dashed blue line shows sessions on the same scale. All fourteen values are available in the chart data below.</desc>
      {[0, 500, 1000, 1500, 2000].map((value) => <g key={value}><line x1={40} x2={482} y1={190 - value * 0.085} y2={190 - value * 0.085} stroke="var(--line)" strokeDasharray="3 5" /><text x={32} y={194 - value * 0.085} textAnchor="end">{value}</text></g>)}
      <line x1={40} y1={190} x2={482} y2={190} stroke="var(--ink)" />
      <polyline points={strokes} fill="none" stroke="#9c6b58" strokeWidth={2.5} strokeLinejoin="round" />
      <polyline points={sessions} fill="none" stroke="#27738b" strokeWidth={2} strokeDasharray="6 4" />
      {chartPoints.map((point, index) => <g key={point.label}><circle cx={40 + index * 34} cy={190 - point.strokes * 0.085} r={3.5} fill="var(--paper)" stroke="#9c6b58" strokeWidth={1.5} />{(index % 2 === 0 && index < 12) || index === 13 ? <text x={40 + index * 34} y={208} textAnchor="middle">{point.label}</text> : null}</g>)}
    </svg>
    <details className={styles.chartData}>
      <summary>View chart data</summary>
      <table><caption>Sample canvas activity</caption><thead><tr><th scope="col">Date</th><th scope="col">Strokes</th><th scope="col">Sessions</th></tr></thead><tbody>{chartPoints.map((point) => <tr key={point.label}><th scope="row">{point.label}</th><td>{numberFormat.format(point.strokes)}</td><td>{point.sessions}</td></tr>)}</tbody></table>
    </details>
  </section>;
}
