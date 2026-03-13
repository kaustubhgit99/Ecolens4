import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, coins_month, coins_total, ward")
      .eq("role", "citizen")
      .eq("is_blocked", false)
      .order("coins_month", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const leaderboard = (data ?? []).map((u, i) => ({
      rank:         i + 1,
      display_name: u.full_name,
      coins_month:  u.coins_month,
      coins_total:  u.coins_total,
      ward:         u.ward,
      is_me:        u.id === user.id,
    }));

    return NextResponse.json({
      leaderboard,
      month: new Date().toISOString().slice(0, 7),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
