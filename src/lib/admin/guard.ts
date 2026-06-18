import "server-only";

import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin/session-edge";

export async function requireAdminSession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  const valid = await verifyAdminSessionToken(token);
  if (!valid) {
    throw new Error("UNAUTHORIZED");
  }
}

export async function isAdminSessionValid(
  req?: NextRequest
): Promise<boolean> {
  const token = req
    ? req.cookies.get(COOKIE_NAME)?.value
    : cookies().get(COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}
