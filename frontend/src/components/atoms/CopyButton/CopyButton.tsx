import { useEffect, useState } from "react";
import Button from "../Button";
import { useT } from "../../../i18n";
import messages from "../../messages";

export interface CopyButtonProps {
  /** What goes on the clipboard. */
  text: string;
  /** @default "Copy" - reads "Copied" for 1.5s after a click. */
  label?: string;
  className?: string;
}

/** An outline `Button` that copies `text` to the clipboard and confirms it. */
function CopyButton({ text, label, className }: CopyButtonProps) {
  const t = useT(messages);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      outline
      className={className}
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? t("copied") : (label ?? t("copy"))}
    </Button>
  );
}

export default CopyButton;
