import styles from "./smart-import.module.css";

export function SmartFeedback({ error, status = 0, message, onRefresh }: { error?: string; status?: number; message?: string; onRefresh?: () => void }) {
  if (error) return <div className={styles.error} role="alert"><p>{error}</p><div className={styles.inlineActions}>
    {status === 401 || status === 403 ? <a href="/login" target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}>在新标签页登录</a> : null}
    {onRefresh ? <button type="button" className={styles.secondaryButton} onClick={onRefresh}>刷新当前内容</button> : null}
  </div></div>;
  if (message) return <p className={styles.feedback} role="status">{message}</p>;
  return null;
}
