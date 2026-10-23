"use client";
import { useState } from "react";
import { Sheet } from "./ui/sheet";
import { Button } from "./ui/button";
export function Unlock({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Unlock Counter"
      description="Enter your personal access code once on this device."
    >
      <form
        className="type-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            setCode("");
            onUnlocked();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="access-code">Access code</label>
        <input
          id="access-code"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy || !code.trim()}>{busy ? "Unlocking…" : "Unlock"}</Button>
      </form>
    </Sheet>
  );
}
