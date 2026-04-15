import { useState, useRef, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../hooks/store";
import { login } from "../store/authSlice";
import { generateKeyPair, exportPublicKey } from "@two/crypto";
import { hasKeyPair, saveKeyPair, getPublicKey } from "../lib/keystore";
import { apiFetch } from "../lib/api";

export function LoginScreen() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const [inputValue, setInputValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const match = inputValue.trim().match(/^#(\d{7,20})$/);
    if (!match) {
      setHint("Type a phone number using the format #1234567890");
      return;
    }
    const phone = `+${match[1]}`;
    const result = await dispatch(login(phone));
    if (login.fulfilled.match(result)) {
      // Ensure A key pair exists and is registered with the server
      const { token, user } = result.payload;
      if (!(await hasKeyPair())) {
        const pair = await generateKeyPair();
        await saveKeyPair(pair);
      }
      const pubKey = await getPublicKey();
      if (pubKey) {
        const exported = await exportPublicKey(pubKey);
        await apiFetch(`/api/users/${user.id}/public-key`, token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: exported }),
        });
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setHint(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Two
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A private messenger for two.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleChange}
            placeholder="#yournumber"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {(hint ?? error) && (
            <p className="text-sm text-destructive">{hint ?? error}</p>
          )}
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {status === "loading" ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
