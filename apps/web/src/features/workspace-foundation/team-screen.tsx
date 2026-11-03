"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ApplicationShell } from "../application-preview/application-shell";
import { Icon } from "../application-preview/icon";
import { illustrativePermissions, illustrativeRoles } from "./fixtures";
import { selectMembers } from "./member-search";
import styles from "./workspace-foundation.module.css";

export function TeamScreen() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [query, setQuery] = useState("");
  const id = useId();
  const users = useRef<HTMLButtonElement>(null);
  const roles = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const members = selectMembers(query);

  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "users" : event.key === "End" ? "roles" : tab === "users" ? "roles" : "users";
    setTab(next);
    (next === "users" ? users : roles).current?.focus();
  }

  return <ApplicationShell section="team">
    <section className={styles.card} aria-label="Team administration">
      <h2>Your team</h2>
      <div className={styles.tabs} role="tablist" aria-label="Team views">
        <button ref={users} id={`${id}-users-tab`} role="tab" aria-selected={tab === "users"} aria-controls={`${id}-users-panel`} tabIndex={tab === "users" ? 0 : -1} onClick={() => setTab("users")} onKeyDown={changeTab}>Users</button>
        <button ref={roles} id={`${id}-roles-tab`} role="tab" aria-selected={tab === "roles"} aria-controls={`${id}-roles-panel`} tabIndex={tab === "roles" ? 0 : -1} onClick={() => setTab("roles")} onKeyDown={changeTab}>Roles</button>
      </div>
      <div id={`${id}-users-panel`} role="tabpanel" aria-labelledby={`${id}-users-tab`} hidden={tab !== "users"} tabIndex={0}>
        <div className={styles.toolbar}>
          <label className={styles.memberSearch}><span>Search members</span><span className={styles.searchInput}><Icon name="search" size={18} /><input ref={search} name="member-search" type="search" autoComplete="off" placeholder="Search name or email…" value={query} onChange={event => setQuery(event.target.value)} /></span></label>
          <div className={styles.actions}><button type="button" onClick={event => event.preventDefault()}>Add user</button><button type="button" onClick={event => event.preventDefault()}>Invite member</button></div>
        </div>
        <p className={styles.resultCount} role="status">{members.length} {members.length === 1 ? "member" : "members"} shown</p>
        {members.length > 0 ? <div className={styles.tableRegion} role="region" aria-label="Members table" tabIndex={0}>
          <table><caption className={styles.srOnly}>Members</caption><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
            {members.map(member => <tr key={member.id}><th scope="row"><span className={styles.memberName}>{member.name}</span><span className={styles.memberEmail}>{member.email}</span></th><td>{member.role}</td><td><span className={styles.statusBadge}>{member.access}</span></td><td><div className={styles.actions}><button type="button" onClick={event => event.preventDefault()} aria-label={`Edit role for ${member.name}`}>Edit role</button><button type="button" onClick={event => event.preventDefault()} aria-label={`Revoke access for ${member.name}`}>Revoke access</button></div></td></tr>)}
          </tbody></table>
        </div> : <div className={styles.empty}><Icon name="search" size={28} /><h3>No members match your search.</h3><p>Try a different name or email address.</p></div>}
        {query && <button className={styles.reset} onClick={() => { setQuery(""); search.current?.focus(); }}>Reset search</button>}
      </div>
      <div id={`${id}-roles-panel`} role="tabpanel" aria-labelledby={`${id}-roles-tab`} hidden={tab !== "roles"} tabIndex={0}>
        <h3 className={styles.panelTitle}>Permissions</h3>
        <div className={styles.tableRegion} role="region" aria-label="Illustrative permissions table" tabIndex={0}>
          <table><caption className={styles.srOnly}>Illustrative permissions</caption><thead><tr><th scope="col">Example capability</th>{illustrativeRoles.map(role => <th key={role} scope="col">{role}</th>)}</tr></thead><tbody>
            {illustrativePermissions.map(permission => <tr key={permission.label}><th scope="row">{permission.label}</th>{permission.examples.map((example, index) => <td key={illustrativeRoles[index]}>{example}</td>)}</tr>)}
          </tbody></table>
        </div>
        <div className={styles.actions}><button type="button" onClick={event => event.preventDefault()}>Edit permissions</button><button type="button" onClick={event => event.preventDefault()}>Save role</button></div>
      </div>
    </section>
  </ApplicationShell>;
}
