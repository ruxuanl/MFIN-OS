import { redirect } from "next/navigation";

export default async function DiscoveryPage() {
  redirect("/internships?tab=discover");
}
