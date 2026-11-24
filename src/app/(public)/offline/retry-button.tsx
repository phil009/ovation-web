"use client";

import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";

export function RetryButton() {
  return <Button onClick={() => window.location.reload()}>{strings.offline.retry}</Button>;
}
