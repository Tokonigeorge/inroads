import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { db } from "@/server/db/client";
import { quickSearch } from "@/server/repos/search";

/** People, rooms and goals matching `q`, for the command palette. */
export const GET = apiRoute(async (req, user) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await db.withUser(user.id, (tx) => quickSearch(tx, q)));
});
