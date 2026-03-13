import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthorityQueueClient from "./AuthorityQueueClient";

export default async function AuthorityQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role, department, ward")
    .eq("id", user.id)
    .single();

  if (profile?.role === "citizen") redirect("/dashboard");

  // Fetch complaints for this authority's department (or all for admin)
  let query = supabase
    .from("complaints")
    .select("id,title,description,status,ai_priority,ai_category,ai_department,ai_confidence,address,ward,department,created_at,resolved_at,citizen_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profile?.role === "authority" && profile.department) {
    query = query.eq("department", profile.department);
  }

  const { data: complaints } = await query;

  const { data: departments } = await supabase
    .from("departments")
    .select("id,name,code,active")
    .eq("active", true);

  return (
    <AuthorityQueueClient
      profile={profile ?? { id: user.id, full_name: "Officer", role: "authority", department: null, ward: null }}
      complaints={complaints ?? []}
      departments={departments ?? []}
    />
  );
}
