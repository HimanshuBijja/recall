"use client";

import { useEffect, useState, Suspense } from "react";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (res: { credential?: string }) => void }) => void;
          renderButton: (element: HTMLElement | null, options: Record<string, string>) => void;
        };
      };
    };
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gsiLoaded, setGsiLoaded] = useState(false);

  useEffect(() => {
    if (errorParam === "unauthorized") {
      setTimeout(() => {
        setError("ACCESS DENIED. AUTHORIZED IDENTITIES ONLY.");
      }, 0);
    }
  }, [errorParam]);

  useEffect(() => {
    if (gsiLoaded && window.google) {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        setTimeout(() => {
          setError("Configuration error: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.");
        }, 0);
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential?: string }) => {
            setLoading(true);
            setTimeout(() => setError(null), 0);
            try {
              const loginRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential }),
              });

              const data = await loginRes.json();
              if (loginRes.ok && data.success) {
                router.push("/");
                router.refresh();
              } else {
                setError(data.error || "Authentication failed.");
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
              setError(msg);
            } finally {
              setLoading(false);
            }
          },
        });

        window.google.accounts.id.renderButton(
          document.getElementById("google-signin-btn"),
          {
            theme: "filled_black",
            size: "large",
            width: "320",
            text: "signin_with",
            shape: "square",
          }
        );
      } catch (err: unknown) {
        console.error("GSI Init error:", err);
      }
    }
  }, [gsiLoaded, router]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={() => setGsiLoaded(true)}
      />
      
      <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 border border-border p-8 bg-zinc-950/20 rounded-[4px] relative">
          
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#EBDCC4_1px,transparent_1px)] [background-size:16px_16px] rounded-[4px]" />

          <div className="text-center relative z-10">
            <div className="flex items-center justify-center gap-2 text-xs tracking-widest text-muted uppercase font-semibold mb-4">
              <span className="w-4 h-[1px] bg-accent" />
              Protocol 01 // Authentication
            </div>
            
            <h1
              className="cinematic-headline text-5xl font-display font-bold tracking-tight mb-8"
              data-text="RECALL"
            >
              RECALL
            </h1>
            
            <p className="text-sm font-light text-muted uppercase tracking-wider mb-8">
              Authenticate to access your private spaced revision space.
            </p>
          </div>

          <div className="mt-8 space-y-6 relative z-10 flex flex-col items-center">
            {error && (
              <div className="w-full text-center border border-accent/30 bg-accent/5 px-4 py-3 rounded-[4px]">
                <span className="text-xs font-semibold tracking-wider text-accent uppercase font-mono">
                  {error}
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] tracking-widest uppercase font-mono text-muted">
                  Validating Identity...
                </span>
              </div>
            ) : (
              <div className="flex justify-center w-full min-h-[44px]">
                {gsiLoaded ? (
                  <div id="google-signin-btn" className="w-full max-w-xs" />
                ) : (
                  <div className="w-full max-w-xs h-11 border border-border flex items-center justify-center text-xs tracking-wider text-muted font-mono animate-pulse rounded-[4px]">
                    LOADING SECURE PORTAL...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md border border-border p-8 bg-zinc-950/20 rounded-[4px] text-center text-xs tracking-wider text-muted font-mono animate-pulse">
          LOADING PORTAL...
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
