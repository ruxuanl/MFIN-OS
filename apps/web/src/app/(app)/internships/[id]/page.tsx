import { OpportunityDetail } from "@/components/opportunity-detail";

export const metadata = { title: "实习详情" };

export default async function InternshipDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  return <OpportunityDetail id={id} track="internship" notice={notice} />;
}
