"use client";

import Link from "next/link";

export default function ResourceError({ retry }: { retry: () => void }) {
  return <section className="container-page py-20">
    <h1 className="text-3xl font-bold tracking-tight">资源库暂时无法打开</h1>
    <p className="mt-4 text-base leading-7 text-muted">连接恢复后可以重新尝试。如果刚才提交过修改，请先刷新列表确认保存结果。</p>
    <div className="mt-6 flex flex-wrap items-center gap-5">
      <button type="button" className="rounded-lg bg-accent px-5 py-3 text-base font-medium text-white" onClick={retry}>重新尝试</button>
      <Link className="py-3 text-base font-medium" href="/">返回首页</Link>
    </div>
  </section>;
}
