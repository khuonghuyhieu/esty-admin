import { metrics } from "./fixtures";
import { Icon } from "./icon";
import styles from "./application-preview.module.css";

export function MetricCards() {
  return <section className={styles.metrics} aria-label="Sample workspace metrics">{metrics.map((metric) => <article key={metric.id} className={styles.metric}>
    <div className={styles.metricTop}><span className={`${styles.iconDisc} ${styles[metric.tone]}`}><Icon name={metric.icon} /></span><span className={metric.trend ? styles.trend : styles.muted}>{metric.note}</span></div>
    <p className={styles.metricValue}>{metric.value}</p><h2>{metric.label}</h2>
  </article>)}</section>;
}
