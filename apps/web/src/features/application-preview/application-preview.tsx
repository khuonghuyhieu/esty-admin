import { ApplicationShell } from "./application-shell";
import { MetricCards } from "./metric-card";
import { ActivityChart } from "./activity-chart";
import { ActivityFeed } from "./activity-feed";
import styles from "./application-preview.module.css";

export function ApplicationPreview() {
  return <ApplicationShell><MetricCards /><div className={styles.panels}><ActivityChart /><ActivityFeed /></div></ApplicationShell>;
}
