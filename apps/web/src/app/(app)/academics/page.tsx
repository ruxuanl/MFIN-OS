import { AcademicWorkspace } from "@/components/academic-workspace";

export const metadata = { title: "学业" };

export default function AcademicsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AcademicWorkspace searchParams={searchParams} />;
}
