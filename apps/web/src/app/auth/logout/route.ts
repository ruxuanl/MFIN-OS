import { NextResponse } from "next/server";

import { getAuthMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin && new URL(origin).origin !== requestUrl.origin) {
    return new Response(null, { status: 403 });
  }

  if (getAuthMode() === "supabase") {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      return NextResponse.redirect(new URL("/settings?logout=failed", requestUrl), 303);
    }
  }

  return NextResponse.redirect(new URL("/login", requestUrl), 303);
}
