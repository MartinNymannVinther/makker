import { Paperclip } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

export type ChatLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
  truncated: boolean;
  engine: string;
};

export type ChatFile = {
  id: string;
  name: string;
  size: number;
  hasText: boolean;
  messageId: string | null;
};

/**
 * One line of the conversation. The person's as they wrote it, with the
 * files it carried; the model's drawn as the markdown it writes. A line
 * still being written is the same element, so nothing jumps when it is
 * done.
 */
export function MessageItem({
  line,
  files,
  writing = false,
  noTextLabel,
}: {
  line: Pick<ChatLine, "id" | "role" | "content">;
  files?: ChatFile[];
  writing?: boolean;
  noTextLabel: string;
}) {
  const own = line.role === "user";
  return (
    <div className={cn("flex w-full", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[min(48rem,100%)] flex-col gap-2 rounded-xl px-4 py-3",
          own ? "bg-secondary text-foreground" : "bg-card border-border border",
        )}
      >
        {own ? (
          <p className="text-reading leading-relaxed whitespace-pre-wrap">{line.content}</p>
        ) : (
          <Markdown source={line.content} className={cn(writing && "after:content-['▍']")} />
        )}
        {files && files.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {files.map((file) => (
              <li
                key={file.id}
                className="border-border bg-background/60 text-meta inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
              >
                <Paperclip className="size-3" aria-hidden />
                <span className="max-w-[16rem] truncate">{file.name}</span>
                {!file.hasText ? <span>· {noTextLabel}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
