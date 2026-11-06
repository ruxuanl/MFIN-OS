import { OpportunityWorkspace } from "@/components/opportunity-workspace";

export const metadata = { title: "实习" };

export default function InternshipsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <OpportunityWorkspace track="internship" searchParams={searchParams} />;
}
