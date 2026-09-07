/** Retired: the old endpoint saved new personal bookmarks into deployed content. */
function retiredEndpoint() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { error: "旧添加入口已停用，请在「我的收藏」中私有保存，再预览公开版本。" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export {
  retiredEndpoint as GET, retiredEndpoint as POST, retiredEndpoint as PUT,
  retiredEndpoint as PATCH, retiredEndpoint as DELETE, retiredEndpoint as OPTIONS,
  retiredEndpoint as HEAD,
};
