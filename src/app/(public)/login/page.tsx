import type { Metadata } from "next";
import { Suspense } from "react";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: strings.login.title };

export default function LoginPage() {
  return (
    <Main narrow>
      <Suspense>
        <LoginForm />
      </Suspense>
    </Main>
  );
}
