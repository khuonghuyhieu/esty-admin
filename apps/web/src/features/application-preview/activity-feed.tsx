import { activity } from "./fixtures";
import styles from "./application-preview.module.css";

const categories = ["Drawings", "Shares", "Comments", "Invites"] as const;
const colors = { Drawings: "peach", Shares: "blue", Comments: "purple", Invites: "teal" } as const;

export function ActivityFeed() {
  return <section className={`${styles.panel} ${styles.activityPanel}`} aria-labelledby="activity-title">
    <h2 id="activity-title">Recent board activity</h2><p className={styles.subtitle}>Drawings, shares, and team actions from the last 24 hours</p>
    <dl className={styles.activityCounters}>{categories.map((category) => <div key={category}><dt><span className={`${styles.dot} ${styles[colors[category]]}`} />{category}</dt><dd>{activity.filter((event) => event.category === category).length}</dd></div>)}</dl>
    <ul className={styles.activityList}>{activity.map((event) => <li key={event.id}>
      <span className={`${styles.dot} ${styles[colors[event.category]]}`} />
      <div><div className={styles.eventHeading}><h3>{event.title}</h3><span>{event.time}</span></div><p>{event.description}</p></div>
    </li>)}</ul>
  </section>;
}
