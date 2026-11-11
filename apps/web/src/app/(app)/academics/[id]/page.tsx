import { CourseDetail } from "@/components/course-detail";

export const metadata = { title: "课程详情" };

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  return <CourseDetail id={id} notice={notice} />;
}
