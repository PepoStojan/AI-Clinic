import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>AI-Clinic</div>
        <div className={styles.secondary}>Developed by smartclick.agency</div>
        <LoginForm next={next ?? "/audits"} />
      </div>
    </div>
  );
}
