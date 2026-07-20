import { CustomerPortal } from "@dodopayments/nextjs";
import { NextResponse } from "next/server";

const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode";

export const GET = bearerToken
  ? CustomerPortal({ bearerToken, environment })
  : async () => NextResponse.json({ error: "Payments not configured" }, { status: 503 });
