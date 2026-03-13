import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { user_id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();

    // Citizens can only view their own coins
    if (profile?.role === "citizen" && params.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("coins_total, coins_month")
      .eq("id", params.user_id)
      .single();

    if (userErr) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data: transactions } = await supabase
      .from("coin_transactions")
      .select("id, coins, reason, created_at, complaint_id")
      .eq("user_id", params.user_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      coins_total:  userData.coins_total,
      coins_month:  userData.coins_month,
      transactions: transactions ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
