import "server-only";

import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { getPublicResources } from "./public-resources";
import { cloudLibraryEnabled } from "./server/config";
import { readCloudPublicSnapshot } from "./cloud-publication";

export const PUBLIC_LIBRARY_CACHE_TAG = "vitamin-published-library-v1";

const readPublished = unstable_cache(
  async () => (await readCloudPublicSnapshot()).resources,
  [PUBLIC_LIBRARY_CACHE_TAG],
  { tags: [PUBLIC_LIBRARY_CACHE_TAG], revalidate: 60 },
);

/** Cloud mode never falls back to a previous file when a snapshot is empty or unavailable. */
export async function getSitePublicResources() {
  return cloudLibraryEnabled() ? readPublished() : getPublicResources();
}

export async function getSiteFeaturedResources(limit = 4) {
  return (await getSitePublicResources())
    .filter(item => item.featured && item.usedByVitamin && item.kind === "tool")
    .slice(0, limit);
}

export function refreshPublicLibrary() {
  revalidateTag(PUBLIC_LIBRARY_CACHE_TAG, { expire: 0 });
  revalidatePath("/tools");
  revalidatePath("/");
}
