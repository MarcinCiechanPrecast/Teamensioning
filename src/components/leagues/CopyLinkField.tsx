import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <Input
        ref={inputRef}
        type="text"
        readOnly
        value={url}
        data-share-url={url}
        aria-label="Share link"
        onFocus={(e) => {
          e.currentTarget.select();
        }}
        className="flex-1"
      />
      <Button type="button" variant="outline" onClick={() => void handleCopy()}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
