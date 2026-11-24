import type { Metadata } from "next";
import { Suspense } from "react";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: strings.register.title };

export default function RegisterPage() {
  return (
    <Main narrow>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </Main>
  );
}
