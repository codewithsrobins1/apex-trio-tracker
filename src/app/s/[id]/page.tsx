// NO "use client" here
import SessionViewerClient from "./SessionViewerClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 15: await params
  return <SessionViewerClient id={id} />;
}
