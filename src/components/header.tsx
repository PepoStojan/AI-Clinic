"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";
import styles from "./header.module.css";

export function Header() {
  const pathname = usePathname();
  const isNewAudit = pathname === "/new-audit";
  const isAudits = pathname === "/audits" || pathname.startsWith("/audits/");

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/audits" className={styles.brandBlock}>
          <span className={styles.brand}>AI-Clinic</span>
          <span className={styles.secondary}>Developed by smartclick.agency</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/audits" className={`${styles.navLink} ${isAudits ? styles.navLinkActive : ""}`}>
            Audits
          </Link>
          <Link href="/new-audit" className={isNewAudit ? styles.navPrimary : styles.navLink}>
            New Audit
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={`${styles.navLink} ${styles.logoutButton}`}>
              Logout
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
