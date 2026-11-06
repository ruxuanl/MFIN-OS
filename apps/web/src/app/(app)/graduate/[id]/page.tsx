import { OpportunityDetail } from "@/components/opportunity-detail";

export const metadata = { title: "秋招详情" };

export default async function GraduateDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  return <OpportunityDetail id={id} track="graduate" notice={notice} />;
}
