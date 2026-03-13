import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CitizenDashboardClient from "./CitizenDashboardClient";

export default async function CitizenDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch profile
  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role, coins_total, coins_month, ward")
    .eq("id", user.id)
    .single();

  if (profile?.role === "authority" || profile?.role === "admin") {
    redirect("/queue");
  }

  // Fetch this user's complaints (most recent 20)
  const { data: complaints } = await supabase
    .from("complaints")
    .select("id,title,description,status,ai_priority,ai_category,address,created_at,resolved_at,image_url,department")
    .eq("citizen_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch unread notification count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  return (
    <CitizenDashboardClient
      profile={profile ?? { id: user.id, full_name: "Citizen", role: "citizen", coins_total: 0, coins_month: 0, ward: null }}
      complaints={complaints ?? []}
      unreadCount={unreadCount ?? 0}
    />
  );
}
