"use client";

import { useRef, useState, type FormEvent } from "react";
import { Icon } from "../application-preview/icon";
import { SessionMessage, useAppSession } from "../app-session/session-provider";
import styles from "./workspace-foundation.module.css";

export function LoginScreen() {
  const { view, signIn, signOut, revalidate } = useAppSession();
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });

  const busy = view.phase === "checking";
  const unsupported = view.phase === "unsupported";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailError = !email.current!.value.trim() ? "Enter an email address."
      : email.current!.validity.typeMismatch ? "Enter a valid email address." : "";
    const passwordError = !password.current!.value ? "Enter a password." : "";
    setErrors({ email: emailError, password: passwordError });
    if (emailError) email.current?.focus();
    else if (passwordError) password.current?.focus();
    else {
      const address = email.current!.value.trim();
      const secret = password.current!.value;
      password.current!.value = "";
      setVisible(false);
      await signIn(address, secret);
      feedback.current?.focus();
    }
  }

  return <main id="main-content" tabIndex={-1} className={styles.login}>
    <div className={styles.loginWrap}>
      <div className={styles.loginBrand}><Icon name="pen" size={24} />SketchPad</div>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <h1 id="login-title">Sign in</h1>
        <div ref={feedback} tabIndex={-1}><SessionMessage /></div>
        {["forbidden", "signout-unconfirmed"].includes(view.phase) && <div className={styles.sessionActions}><button type="button" onClick={() => void signOut()}>Sign out</button></div>}
        {view.phase === "changed" && <div className={styles.sessionActions}><button type="button" onClick={() => void revalidate()}>Check session</button></div>}
        <form noValidate onSubmit={submit} className={styles.form} aria-busy={busy}>
          <div className={styles.field}>
            <label htmlFor="login-email">Email</label>
            <input ref={email} id="login-email" name="email" type="email" required maxLength={320} autoComplete="username" disabled={busy || unsupported} spellCheck={false} placeholder="you@example.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
            {errors.email && <p className={styles.error} id="email-error" role="alert">{errors.email}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="login-password">Password</label>
            <div className={styles.passwordField}>
              <input ref={password} id="login-password" name="password" type={visible ? "text" : "password"} required maxLength={4096} autoComplete="current-password" disabled={busy || unsupported} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} />
              <button type="button" aria-controls="login-password" aria-pressed={visible} disabled={busy || unsupported} onClick={() => setVisible(!visible)}>{visible ? "Hide password" : "Show password"}</button>
            </div>
            {errors.password && <p className={styles.error} id="password-error" role="alert">{errors.password}</p>}
          </div>
          <button className={styles.primary} type="submit" disabled={busy || unsupported}>{busy ? "Please wait…" : "Sign in"}</button>
        </form>
      </section>
    </div>
  </main>;
}
