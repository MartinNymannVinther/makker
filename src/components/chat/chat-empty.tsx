"use client";

import { useTranslations } from "next-intl";
import type { TaskOption } from "./composer";

/**
 * A conversation with nothing in it yet: the question, a line about
 * what the page is, and the first few tasks as a place to start.
 */
export function ChatEmpty({
  tasks,
  modelConfigured,
  onTask,
}: {
  tasks: TaskOption[];
  modelConfigured: boolean;
  onTask: (task: TaskOption) => void;
}) {
  const t = useTranslations("chat");
  return (
    <div className="my-auto flex flex-col gap-2 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("empty.title")}</h1>
      <p className="text-muted-foreground max-w-prose text-reading leading-relaxed text-pretty">
        {modelConfigured ? t("empty.hint") : t("composer.noModel")}
      </p>
      {tasks.length > 0 && modelConfigured ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-meta text-2sm font-medium">{t("empty.tasks")}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tasks.slice(0, 6).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onTask(task)}
                  className="border-border bg-card hover:bg-muted flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors"
                >
                  <span className="text-2sm font-medium">{task.name}</span>
                  <span className="text-meta text-xs">{task.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
