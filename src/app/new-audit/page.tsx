import { Header } from "@/components/header";
import { NewAuditForm } from "./new-audit-form";
import styles from "./new-audit-form.module.css";

export default function NewAuditPage() {
  return (
    <>
      <Header />
      <main className={`container ${styles.page}`}>
        <h1 className={styles.title}>New Audit</h1>
        <NewAuditForm />
      </main>
    </>
  );
}
