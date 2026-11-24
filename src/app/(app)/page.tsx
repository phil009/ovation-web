import type { Metadata } from "next";
import { HomeRedirect } from "./home-redirect";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <HomeRedirect />;
}
