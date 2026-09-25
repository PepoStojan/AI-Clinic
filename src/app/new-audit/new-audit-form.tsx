"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAuditAction } from "./actions";
import styles from "./new-audit-form.module.css";

interface TargetDraft {
  key: string;
  expanded: boolean;
  name: string;
  url: string;
  prompts: string[];
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `t-${keyCounter}`;
}

export function NewAuditForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [productServiceName, setProductServiceName] = useState("");
  const [mainPrompts, setMainPrompts] = useState<string[]>(["", "", ""]);
  const [targets, setTargets] = useState<TargetDraft[]>([]);

  function updateMainPrompt(index: number, value: string) {
    setMainPrompts((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function addMainPrompt() {
    setMainPrompts((prev) => [...prev, ""]);
  }
  function removeMainPrompt(index: number) {
    setMainPrompts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addTarget() {
    setTargets((prev) => [...prev, { key: nextKey(), expanded: true, name: "", url: "", prompts: [""] }]);
  }
  function removeTarget(key: string) {
    setTargets((prev) => prev.filter((t) => t.key !== key));
  }
  function toggleTarget(key: string) {
    setTargets((prev) => prev.map((t) => (t.key === key ? { ...t, expanded: !t.expanded } : t)));
  }
  function updateTarget(key: string, patch: Partial<TargetDraft>) {
    setTargets((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function updateTargetPrompt(key: string, index: number, value: string) {
    setTargets((prev) =>
      prev.map((t) => (t.key === key ? { ...t, prompts: t.prompts.map((p, i) => (i === index ? value : p)) } : t))
    );
  }
  function addTargetPrompt(key: string) {
    setTargets((prev) => prev.map((t) => (t.key === key ? { ...t, prompts: [...t.prompts, ""] } : t)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanedPrompts = mainPrompts.map((p) => p.trim()).filter(Boolean);
    if (cleanedPrompts.length === 0) {
      setError("At least one main prompt is required.");
      return;
    }

    startTransition(async () => {
      const result = await createAuditAction({
        firstName,
        lastName,
        email,
        companyName,
        websiteUrl,
        productServiceName: productServiceName || undefined,
        mainPrompts: cleanedPrompts,
        additionalTargets: targets.map((t) => ({
          name: t.name || undefined,
          url: t.url,
          prompts: t.prompts.map((p) => p.trim()).filter(Boolean),
        })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/audits/${result.auditId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.card}>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>First name</label>
            <input className={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Last name</label>
            <input className={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Company / Brand</label>
            <input
              className={styles.input}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Website URL</label>
            <input
              className={styles.input}
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Main Product / Service Name (optional)</label>
            <input
              className={styles.input}
              value={productServiceName}
              onChange={(e) => setProductServiceName(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Main prompts</div>
          {mainPrompts.map((prompt, index) => (
            <div className={styles.promptRow} key={index}>
              <input
                className={styles.input}
                placeholder={`Prompt ${index + 1}`}
                value={prompt}
                onChange={(e) => updateMainPrompt(index, e.target.value)}
              />
              {mainPrompts.length > 1 && (
                <button type="button" className={styles.iconButton} onClick={() => removeMainPrompt(index)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className={styles.addButton} onClick={addMainPrompt}>
            + Add prompt
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Additional targets (optional)</div>
          <div className={styles.additionalTargetsIntro}>
            Audit specific products, services, or important pages separately.
          </div>

          {targets.map((target) => (
            <div className={styles.targetCard} key={target.key}>
              {target.expanded ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Target / Product Name</label>
                    <input
                      className={styles.input}
                      value={target.name}
                      onChange={(e) => updateTarget(target.key, { name: e.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Page URL</label>
                    <input
                      className={styles.input}
                      type="url"
                      value={target.url}
                      onChange={(e) => updateTarget(target.key, { url: e.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Prompts</label>
                    {target.prompts.map((p, i) => (
                      <div className={styles.promptRow} key={i}>
                        <input
                          className={styles.input}
                          value={p}
                          onChange={(e) => updateTargetPrompt(target.key, i, e.target.value)}
                        />
                      </div>
                    ))}
                    <button type="button" className={styles.addButton} onClick={() => addTargetPrompt(target.key)}>
                      + Add prompt
                    </button>
                  </div>
                  <div className={styles.targetActions}>
                    <button
                      type="button"
                      className={`${styles.linkButton} ${styles.linkButtonDanger}`}
                      onClick={() => removeTarget(target.key)}
                    >
                      Remove target
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => toggleTarget(target.key)}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.targetCollapsedRow} onClick={() => toggleTarget(target.key)}>
                  <div className={styles.targetSummary}>
                    {target.name || "Untitled target"} ·{" "}
                    <span className={styles.targetSummaryUrl}>{target.url || "no URL"}</span> ·{" "}
                    {target.prompts.filter((p) => p.trim()).length} prompt(s)
                  </div>
                  <button type="button" className={styles.linkButton}>
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}

          <button type="button" className={styles.addButton} onClick={addTarget}>
            + Add another target
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      <div className={styles.footer}>
        <button type="submit" className={styles.submitButton} disabled={pending}>
          {pending ? "Starting audit..." : "Start Audit"}
        </button>
      </div>
    </form>
  );
}
