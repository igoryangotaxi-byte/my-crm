"use client";

import styles from "@/components/unsubscribe/unsubscribe.module.css";

export function UnsubscribeSuccessScreen() {
  return (
    <main className={`unsubscribe-theme ${styles.screen}`} dir="rtl" lang="he">
      <div className={styles.content}>
        <div className={styles.checkWrap} aria-hidden="true">
          <svg className={styles.checkSvg} viewBox="0 0 88 88" role="img">
            <circle className={styles.circle} cx="44" cy="44" r="40" />
            <path
              className={styles.checkPath}
              d="M26 46 L38 58 L62 32"
            />
          </svg>
        </div>
        <h1 className={styles.title}>ההרשמה בוטלה</h1>
      </div>
    </main>
  );
}
