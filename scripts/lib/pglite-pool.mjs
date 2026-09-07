/** Test-only pg-compatible adapter. One PGlite connection holds each transaction until release. */
export function createPglitePool(db) {
  let tail = Promise.resolve();
  async function acquire() {
    let release;
    const previous = tail;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  }
  return {
    async connect() {
      const unlock = await acquire();
      let released = false;
      return {
        query: (sql, values = []) => db.query(sql, values),
        release() { if (!released) { released = true; unlock(); } },
      };
    },
    async query(sql, values = []) {
      const unlock = await acquire();
      try { return await db.query(sql, values); } finally { unlock(); }
    },
  };
}
