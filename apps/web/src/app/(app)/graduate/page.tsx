import { OpportunityWorkspace } from "@/components/opportunity-workspace";

export const metadata = { title: "秋招" };

export default function GraduatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <OpportunityWorkspace track="graduate" searchParams={searchParams} />;
}
