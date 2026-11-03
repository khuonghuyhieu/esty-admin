"use client";

import { useState } from "react";
import { ApplicationShell } from "../application-preview/application-shell";
import { sampleSettings } from "./fixtures";
import styles from "./workspace-foundation.module.css";

export function SettingsScreen() {
  const [settings, setSettings] = useState(sampleSettings);
  const changed = settings.displayName !== sampleSettings.displayName || settings.email !== sampleSettings.email
    || settings.workspaceName !== sampleSettings.workspaceName;

  return <ApplicationShell section="settings">
    <div className={styles.settingsGrid}>
      <section className={styles.card} aria-labelledby="account-heading">
        <h2 id="account-heading" className={styles.sectionHeading}>Account</h2>
        <div className={styles.form}>
          <div className={styles.field}><label htmlFor="sample-display-name">Display name</label><input id="sample-display-name" name="display-name" autoComplete="off" value={settings.displayName} onChange={event => setSettings({ ...settings, displayName: event.target.value })} /></div>
          <div className={styles.field}><label htmlFor="sample-account-email">Email</label><input id="sample-account-email" name="email" type="email" autoComplete="off" spellCheck={false} value={settings.email} onChange={event => setSettings({ ...settings, email: event.target.value })} /></div>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="workspace-heading">
        <h2 id="workspace-heading" className={styles.sectionHeading}>Workspace</h2>
        <div className={styles.field}><label htmlFor="sample-workspace-name">Workspace name</label><input id="sample-workspace-name" name="workspace-name" autoComplete="off" value={settings.workspaceName} onChange={event => setSettings({ ...settings, workspaceName: event.target.value })} /></div>
      </section>
    </div>
    <div className={styles.saveBar}>
      <p role="status" className={styles.settingsStatus}>{changed ? "Unsaved changes" : ""}</p>
      <button type="button" onClick={event => event.preventDefault()}>Save changes</button>
    </div>
  </ApplicationShell>;
}
