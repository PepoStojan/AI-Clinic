"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginActionState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <label className={styles.label} htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        className={styles.input}
        placeholder="Enter password"
      />
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}
