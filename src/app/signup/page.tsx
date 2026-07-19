"use client";

import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-slate-950 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-sky-500 text-slate-900">
            <span className="text-xs font-bold">SP</span>
          </div>
          <span className="text-white">S-PAC</span>
        </a>
        <SignupForm />
      </div>
    </div>
  );
}
