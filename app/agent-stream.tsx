"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { UIMessageChunk } from "ai";

type ToolCall = {
  toolName: string;
  status: "calling" | "done" | "error";
};

const TOOL_LABELS: Record<string, string> = {
  getAuthorHistory: "Pulling author history",
  findSimilarReports: "Searching prior cases",
  lookupPolicy: "Checking guidelines",
  submitTriage: "Finalizing decision",
};

export function AgentStream({ postId }: { postId: string }) {
  const router = useRouter();
  const [calls, setCalls] = useState<Record<string, ToolCall>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    readWorkflowStream({
      postId,
      signal: controller.signal,
      onChunk: (chunk) =>
        applyChunk(chunk, {
          setCalls,
          setOrder,
          setDone,
          refresh: router.refresh,
        }),
    }).catch((err: unknown) => {
      if ((err as { name?: string })?.name !== "AbortError") {
        console.error("[agent-stream] failed", err);
      }
    });

    return () => {
      controller.abort();
    };
  }, [postId, router]);

  return (
    <aside className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
      <div className="text-xs font-medium uppercase text-blue-700">
        Agent {done ? "done" : "running"}
      </div>
      <ToolCallList calls={calls} order={order} />
    </aside>
  );
}

async function readWorkflowStream(args: {
  postId: string;
  signal: AbortSignal;
  onChunk: (chunk: UIMessageChunk) => void;
}): Promise<void> {
  const res = await fetch(`/api/posts/${args.postId}/stream`, {
    signal: args.signal,
  });
  if (!res.ok || !res.body) return;

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          args.onChunk(JSON.parse(data) as UIMessageChunk);
        } catch {
          // Ignore malformed events. Any partial line is completed on the
          // next read because the workflow stream is append-only.
        }
      }

      sep = buffer.indexOf("\n\n");
    }
  }
}

function applyChunk(
  chunk: UIMessageChunk,
  state: {
    setCalls: Dispatch<SetStateAction<Record<string, ToolCall>>>;
    setOrder: Dispatch<SetStateAction<string[]>>;
    setDone: Dispatch<SetStateAction<boolean>>;
    refresh: () => void;
  },
): void {
  if (chunk.type === "tool-input-start") {
    const id = chunk.toolCallId;
    state.setCalls((prev) => ({
      ...prev,
      [id]: { toolName: chunk.toolName, status: "calling" },
    }));
    state.setOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  } else if (chunk.type === "tool-output-available") {
    markCall(chunk.toolCallId, "done", state.setCalls);
  } else if (chunk.type === "tool-output-error") {
    markCall(chunk.toolCallId, "error", state.setCalls);
  } else if (chunk.type === "finish") {
    state.setDone(true);
  } else if (chunk.type === "data-status-change") {
    state.refresh();
  }
}

function markCall(
  id: string,
  status: ToolCall["status"],
  setCalls: Dispatch<SetStateAction<Record<string, ToolCall>>>,
): void {
  setCalls((prev) =>
    prev[id] ? { ...prev, [id]: { ...prev[id], status } } : prev,
  );
}

function ToolCallList({
  calls,
  order,
}: {
  calls: Record<string, ToolCall>;
  order: string[];
}) {
  if (order.length === 0) {
    return (
      <p className="mt-2 text-sm text-blue-950">Waiting for tool calls...</p>
    );
  }

  return (
    <ol className="mt-3 grid gap-2">
      {order.map((id) => {
        const call = calls[id];
        if (!call) return null;
        const label = TOOL_LABELS[call.toolName] ?? call.toolName;
        return (
          <li key={id} className="flex items-center gap-2 text-sm">
            <ToolStatusGlyph status={call.status} />
            <span className="text-blue-950">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ToolStatusGlyph({ status }: { status: ToolCall["status"] }) {
  if (status === "calling") {
    return <span className="text-blue-700">...</span>;
  }
  if (status === "error") {
    return <span className="text-red-600">x</span>;
  }
  return <span className="text-emerald-700">✓</span>;
}
