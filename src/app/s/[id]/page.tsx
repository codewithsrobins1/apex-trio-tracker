// NO "use client" here
import SessionViewerClient from "./SessionViewerClient";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ season?: string }>;
}) {
  const { id } = await params;

  // /s/[id]?season=xxxx
  const sp = (await searchParams) ?? {};
  const seasonId = sp.season ?? null;

  return <SessionViewerClient id={id} seasonId={seasonId} />;
}
