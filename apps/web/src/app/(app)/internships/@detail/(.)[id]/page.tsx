import { OpportunityDetail } from "@/components/opportunity-detail";
import { DetailDrawer } from "@/components/workspace-ui";
export default async function DetailPanel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  return <DetailDrawer><OpportunityDetail id={id} track="internship" notice={notice} /></DetailDrawer>;
}
