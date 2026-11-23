import { toast } from "sonner";

/** Copy with the Clipboard API and say so in a toast ("Code copied"). */
export async function copyWithToast(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}

/**
 * "Share on WhatsApp or SMS" (6WV-0): the phone's share sheet where there is one,
 * otherwise WhatsApp with the message filled in.
 */
export async function shareMessage(text: string): Promise<void> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      await copyWithToast(text, "Message copied");
    }
    return;
  }
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener"
  );
}
