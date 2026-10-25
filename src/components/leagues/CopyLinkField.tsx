import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  url: string;
}

const COPIED_RESET_MS = 2000;

export default function CopyLinkField({ url }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_RESET_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure context, denied permission): select the text so Ctrl+C works.
      inputRef.current?.select();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={url}
        data-share-url={url}
        aria-label="Share link"
        onFocus={(e) => {
          e.currentTarget.select();
        }}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
      />
      <Button
        type="button"
        variant="ghost"
        onClick={() => void handleCopy()}
        className="rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
