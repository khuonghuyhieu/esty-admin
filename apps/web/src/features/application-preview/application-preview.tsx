"use client";

import { useBoardSearch } from "./application-shell";
import { ProjectsTable } from "./projects-table";
import { MetricCards } from "./metric-card";
import { ActivityChart } from "./activity-chart";
import { ActivityFeed } from "./activity-feed";
import styles from "./application-preview.module.css";

export function ApplicationPreview() {
  const search = useBoardSearch();
  return <><MetricCards /><div className={styles.panels}><ActivityChart /><ActivityFeed /></div><ProjectsTable query={search.query} onQueryChange={search.onQueryChange} /></>;
}
