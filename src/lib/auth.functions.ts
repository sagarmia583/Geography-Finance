import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  authenticate,
  changeLoginPassword,
  clearAuthentication,
  sessionStatus,
} from "./auth.server";

export const getSessionStatus = createServerFn({ method: "GET" }).handler(() => sessionStatus());

const loginRequest = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string().min(1).max(1024) }))
  .handler(async ({ data }) => {
    try {
      return await authenticate(data.password);
    } catch {
      return { success: false, error: "লগইন করা যায়নি। সার্ভারের লগইন কনফিগারেশন পরীক্ষা করুন।" };
    }
  });

export const login = (data: { password: string }) => loginRequest({ data });

const passwordChangeRequest = createServerFn({ method: "POST" })
  .validator(
    z.object({
      currentPassword: z.string().min(1).max(1024),
      newPassword: z.string().min(1).max(1024),
      confirmPassword: z.string().min(1).max(1024),
    }),
  )
  .handler(async ({ data }) => {
    try {
      return await changeLoginPassword(data);
    } catch {
      return {
        success: false,
        error:
          "পাসওয়ার্ড বদলানো যায়নি। সংযোগ পরীক্ষা করুন এবং আবার লগইন করুন। GS-এর নতুন version deploy করা থাকতে হবে।",
      };
    }
  });

export const changePassword = (data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) => passwordChangeRequest({ data });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await clearAuthentication();
  return { success: true };
});
