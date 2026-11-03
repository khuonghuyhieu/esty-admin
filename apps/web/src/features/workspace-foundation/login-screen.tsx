"use client";

import { useRef, useState, type FormEvent } from "react";
import { Icon } from "../application-preview/icon";
import styles from "./workspace-foundation.module.css";

export function LoginScreen() {
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailError = !email.current!.value.trim() ? "Enter an email address."
      : email.current!.validity.typeMismatch ? "Enter a valid email address." : "";
    const passwordError = !password.current!.value ? "Enter a password." : "";
    setErrors({ email: emailError, password: passwordError });
    if (emailError) email.current?.focus();
    else if (passwordError) password.current?.focus();
  }

  return <main id="main-content" tabIndex={-1} className={styles.login}>
    <div className={styles.loginWrap}>
      <div className={styles.loginBrand}><Icon name="pen" size={24} />SketchPad</div>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <h1 id="login-title">Sign in</h1>
        <form noValidate autoComplete="off" onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="preview-email">Email</label>
            <input ref={email} id="preview-email" name="email" type="email" required autoComplete="off" spellCheck={false} placeholder="jordan@workspace.test" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
            {errors.email && <p className={styles.error} id="email-error" role="alert">{errors.email}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="preview-password">Password</label>
            <div className={styles.passwordField}>
              <input ref={password} id="preview-password" name="password" type={visible ? "text" : "password"} required autoComplete="off" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} />
              <button type="button" aria-controls="preview-password" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide password" : "Show password"}</button>
            </div>
            {errors.password && <p className={styles.error} id="password-error" role="alert">{errors.password}</p>}
          </div>
          <button className={styles.primary} type="submit">Sign in</button>
        </form>
      </section>
    </div>
  </main>;
}
