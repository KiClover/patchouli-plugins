<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import { ImageAddIcon } from "tdesign-icons-vue-next";

import type { API } from "../../../src/api/api";
import type {
  SSEChunkData,
  AIMessageContent,
  ChatRequestParams,
  ChatMessagesData,
  ChatServiceConfig,
  TdAttachmentItem,
  UploadFile,
  TdChatbotApi,
  TdChatMessageConfig,
} from "@tdesign-vue-next/chat";

type GrsUploadTokenZHResponse = {
  data: {
    token: string;
    key: string;
    url: string;
    domain: string;
  };
};

const props = defineProps<{ api: API; secretReady: boolean }>();

const CHAT_STORAGE_KEY = "uxp-psai.chatbot.messages.v1";
const CHAT_MODEL_KEY = "uxp-psai.chatbot.model.v1";

const selectOptions = [
  { label: "nano-banana-fast", value: "nano-banana-fast" },
  { label: "nano-banana", value: "nano-banana" },
  { label: "gemini-3-pro", value: "gemini-3-pro" },
  { label: "gemini-2.5-pro", value: "gemini-2.5-pro" },
  { label: "gemini-2.5-flash", value: "gemini-2.5-flash" },
  { label: "gemini-2.5-flash-lite", value: "gemini-2.5-flash-lite" },
];

const allowToolTip = ref(false);
const selectValue = ref<{ label: string; value: string }>(selectOptions[0]);

const sending = ref(false);

const inThink = ref(false);
const thinkPending = ref("");
const hasThinkingInTurn = ref(false);

const useSelectionImage = ref(false);
const useCanvasImage = ref(false);

const ensureMutualExclusive = (changed: "selection" | "canvas") => {
  if (changed === "selection" && useSelectionImage.value) useCanvasImage.value = false;
  if (changed === "canvas" && useCanvasImage.value) useSelectionImage.value = false;
};

const toggleSelection = () => {
  useSelectionImage.value = !useSelectionImage.value;
  ensureMutualExclusive("selection");
};

const toggleCanvas = () => {
  useCanvasImage.value = !useCanvasImage.value;
  ensureMutualExclusive("canvas");
};

const splitThinkStream = (delta: string): {
  reasoningDelta: string;
  answerDelta: string;
  thinkOpened: boolean;
  thinkClosed: boolean;
} => {
  const tags = ["<think>", "</think>"];
  let s = `${thinkPending.value}${String(delta || "")}`;
  thinkPending.value = "";

  const keepTail = () => {
    let best = "";
    for (const t of tags) {
      for (let i = 1; i < t.length; i++) {
        const prefix = t.slice(0, i);
        if (s.endsWith(prefix) && prefix.length > best.length) best = prefix;
      }
    }
    if (best) {
      thinkPending.value = best;
      s = s.slice(0, -best.length);
    }
  };

  keepTail();

  let reasoningDelta = "";
  let answerDelta = "";
  let thinkOpened = false;
  let thinkClosed = false;
  while (s.length > 0) {
    if (inThink.value) {
      const endIdx = s.indexOf("</think>");
      if (endIdx === -1) {
        reasoningDelta += s;
        s = "";
        break;
      }
      reasoningDelta += s.slice(0, endIdx);
      s = s.slice(endIdx + "</think>".length);
      inThink.value = false;
      thinkClosed = true;
      continue;
    }

    const startIdx = s.indexOf("<think>");
    if (startIdx === -1) {
      answerDelta += s;
      s = "";
      break;
    }

    answerDelta += s.slice(0, startIdx);
    s = s.slice(startIdx + "<think>".length);
    inThink.value = true;
    thinkOpened = true;
  }

  return { reasoningDelta, answerDelta, thinkOpened, thinkClosed };
};

const chatRef = ref<TdChatbotApi | null>(null);

const files = ref<TdAttachmentItem[]>([]);
const mockMessage = ref<ChatMessagesData[]>([]);

const loadPersistedModel = () => {
  try {
    const raw = localStorage.getItem(CHAT_MODEL_KEY);
    if (!raw) return;
    const val = String(raw).trim();
    const found = selectOptions.find((x) => x.value === val);
    if (found) selectValue.value = found;
  } catch {
  }
};

watch(
  chatRef,
  (v) => {
    if (!v) return;
    v.registerMergeStrategy?.("markdown" as any, (chunk: any, existing?: any) => {
      if (!existing) return chunk;
      return {
        ...existing,
        data: `${String(existing.data || "")}${String(chunk?.data || "")}`,
      };
    });

    v.registerMergeStrategy?.("thinking" as any, (chunk: any, existing?: any) => {
      if (!existing) return chunk;
      const exText = String(existing?.data?.text || "");
      const chText = String(chunk?.data?.text || "");
      return {
        ...existing,
        status: chunk?.status ?? existing?.status,
        data: {
          ...(existing?.data || {}),
          ...(chunk?.data || {}),
          title: String((chunk?.data?.title ?? existing?.data?.title) || ""),
          text: `${exText}${chText}`,
        },
      };
    });
  },
  { immediate: true },
);

const loadPersistedMessages = () => {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    mockMessage.value = arr as ChatMessagesData[];
    if (mockMessage.value.length > 0) {
      chatRef.value?.setMessages?.(mockMessage.value as any);
    }
  } catch {
  }
};

const persistMessages = () => {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(mockMessage.value || []));
  } catch {
  }
};

const persistModel = () => {
  try {
    localStorage.setItem(CHAT_MODEL_KEY, String(selectValue.value?.value || ""));
  } catch {
  }
};

const defaultMessages: ChatMessagesData[] = [
  {
    id: "welcome",
    role: "assistant",
    content: [
      {
        type: "text",
        status: "complete",
        data: "欢迎使用预言之书，你可以选择模型、附带选区/画布图片，并上传参考图。",
      },
    ],
  },
];

const inferImageExt = (blob: Blob): string => {
  const t = (blob.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  return "png";
};

const uploadBlobToGrsai = async (blob: Blob, providerKey: string): Promise<string> => {
  const ext = inferImageExt(blob);
  const tokenRes = await fetch("https://grsai.dakka.com.cn/client/resource/newUploadTokenZH", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sux: ext }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`获取上传 Token 失败: ${tokenRes.status} ${tokenRes.statusText}${text ? ` - ${text}` : ""}`);
  }
  const tokenJson = (await tokenRes.json().catch(() => null)) as GrsUploadTokenZHResponse | null;
  const token = (tokenJson as any)?.data?.token;
  const key = (tokenJson as any)?.data?.key;
  const url = (tokenJson as any)?.data?.url;
  const domain = (tokenJson as any)?.data?.domain;
  if (!token || !key || !url || !domain) throw new Error("上传 Token 响应缺少字段");

  const form = new FormData();
  form.append("token", String(token));
  form.append("key", String(key));
  form.append("file", blob, `ref.${ext}`);

  const uploadRes = await fetch(String(url), {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`文件上传失败: ${uploadRes.status} ${uploadRes.statusText}${text ? ` - ${text}` : ""}`);
  }
  return `${String(domain).replace(/\/$/, "")}/${String(key).replace(/^\//, "")}`;
};

const onAttachClick = () => {
  chatRef.value?.selectFile();
};

const onFileSelect = async (e: CustomEvent<TdAttachmentItem[]>) => {
  const currFiles = e.detail || [];
  if (currFiles.length === 0) return;

  const cfg = await props.api.getGlobalConfig();
  if (cfg.apiServer !== "grsai") {
    MessagePlugin.error("当前 Chat 仅实现 grsai 模型服务器");
    return;
  }

  const providerKey = await props.api.getGrsProviderKey?.();
  if (!providerKey) {
    MessagePlugin.error("请先在网站配置模型供应商密钥");
    return;
  }

  for (const f of currFiles) {
    const raw: any = (f as any)?.raw || (f as any)?.file || (f as any)?.originFileObj;
    if (!(raw instanceof Blob)) continue;

    const newFile: any = {
      ...(f as any),
      status: "progress" as UploadFile["status"],
      description: "上传中",
    };
    files.value = [newFile, ...files.value];

    try {
      const url = await uploadBlobToGrsai(raw, providerKey);
      files.value = files.value.map((x: any) =>
        x === newFile
          ? {
              ...x,
              url,
              status: "success",
              description: "上传成功",
            }
          : x,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      files.value = files.value.map((x: any) =>
        x === newFile
          ? {
              ...x,
              status: "fail",
              description: msg,
            }
          : x,
      );
      MessagePlugin.error(msg);
    }
  }
};

const onFileRemove = (e: CustomEvent<TdAttachmentItem[]>) => {
  files.value = e.detail || [];
};

const buildVisionParts = (urls: string[]) => {
  return urls.map((u) => ({ type: "image_url", image_url: { url: u } }));
};

const extractPlainText = (content: any): string => {
  if (!Array.isArray(content)) return String(content || "");
  const texts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "text" || item.type === "markdown") {
      if (typeof item.data === "string") texts.push(item.data);
    }
  }
  return texts.join("\n").trim();
};

const messageProps = (msg: ChatMessagesData): any => {
  if (msg.role === "user") {
    return {
      variant: "base",
      placement: "right",
      avatar: "https://tdesign.gtimg.com/site/avatar.jpg",
    };
  }
  if (msg.role === "assistant") {
    return {
      placement: "left",
      actions: ["replay", "copy"],
      handleActions: {
        replay: () => {
          chatRef.value?.regenerate();
        },
      },
    };
  }
  return {};
};

const chatServiceConfig = computed<ChatServiceConfig>(() => {
  return {
    endpoint: "https://grsaiapi.com/v1/chat/completions",
    stream: true,
    onComplete: () => {
      sending.value = false;
      const finalize = hasThinkingInTurn.value
        ? ({
            type: "thinking",
            data: { title: "思考", text: "" },
            status: "complete",
            strategy: "merge",
          } as any)
        : undefined;

      thinkPending.value = "";
      inThink.value = false;
      hasThinkingInTurn.value = false;

      return finalize as any;
    },
    onError: (err: Error | Response) => {
      sending.value = false;
      console.error("Chatservice Error:", err);
    },
    onAbort: async () => {
      sending.value = false;
    },
    onMessage: (chunk: SSEChunkData): AIMessageContent => {
      const delta = (chunk as any)?.data?.choices?.[0]?.delta?.content;
      const raw = typeof delta === "string" ? delta : "";

      const { reasoningDelta, answerDelta, thinkOpened, thinkClosed } = splitThinkStream(raw);
      const out: any[] = [];
      if (thinkOpened) hasThinkingInTurn.value = true;
      if (reasoningDelta) {
        hasThinkingInTurn.value = true;
        out.push({
          type: "thinking",
          data: {
            title: "思考",
            text: reasoningDelta,
          },
          status: "streaming",
          strategy: "merge",
        });
      }
      if (thinkClosed) {
        out.push({
          type: "thinking",
          data: {
            title: "思考",
            text: "",
          },
          status: "complete",
          strategy: "merge",
        });
      }
      if (answerDelta) {
        out.push({
          type: "markdown",
          data: answerDelta,
          status: "streaming",
          strategy: "merge",
        });
      }

      if (out.length === 0) return null as any;
      return (out.length === 1 ? out[0] : out) as any;
    },
    onRequest: async (innerParams: ChatRequestParams) => {
      sending.value = true;
      thinkPending.value = "";
      inThink.value = false;
      hasThinkingInTurn.value = false;
      const cfg = await props.api.getGlobalConfig();
      if (cfg.apiServer !== "grsai") throw new Error("当前 Chat 仅实现 grsai 模型服务器");

      const providerKey = await props.api.getGrsProviderKey?.();
      if (!providerKey) throw new Error("Provider Key 为空");

      const prompt = String((innerParams as any)?.prompt || "").trim();

      const urls: string[] = [];
      if (useSelectionImage.value) {
        const sel = await props.api.getCurrentSelectionPngUrl?.({ forceOpaque: true } as any);
        const u = (sel as any)?.url;
        if (u) urls.push(String(u));
      }
      if (useCanvasImage.value) {
        const canvas = await props.api.getCurrentCanvasPngUrl?.({ forceOpaque: true } as any);
        const u = (canvas as any)?.url;
        if (u) urls.push(String(u));
      }
      for (const f of files.value as any[]) {
        if (f?.status === "success" && f?.url) urls.push(String(f.url));
      }

      const openaiMessages: any[] = [];
      const history = mockMessage.value || [];
      for (const m of history) {
        const role = m.role;
        if (role !== "user" && role !== "assistant" && role !== "system") continue;
        const text = extractPlainText((m as any).content);
        if (!text) continue;
        openaiMessages.push({ role, content: text });
      }

      if (urls.length > 0) {
        openaiMessages.push({ role: "user", content: [{ type: "text", text: prompt }, ...buildVisionParts(urls)] });
      } else {
        openaiMessages.push({ role: "user", content: prompt });
      }

      const body = {
        model: selectValue.value.value,
        stream: true,
        messages: openaiMessages,
      };

      return {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerKey}`,
        },
        body: JSON.stringify(body),
      } as any;
    },
  } as any;
});

const handleMessageChange = (e: CustomEvent<ChatMessagesData[]>) => {
  mockMessage.value = e.detail || [];
  persistMessages();
};

const onSend = (e: CustomEvent<ChatRequestParams>): ChatRequestParams => {
  const detail: any = e.detail || {};
  return {
    ...detail,
    prompt: String(detail.prompt || "").trim(),
  } as any;
};

const senderProps = computed(() => {
  return {
    placeholder: "有问题，尽管问～ Enter 发送，Shift+Enter 换行",
    uploadProps: {
      multiple: true,
      accept: "image/*",
    },
    attachmentsProps: {
      items: files.value,
    },
    onFileSelect,
    onFileRemove,
  } as any;
});

watch(
  selectValue,
  () => {
    persistModel();
  },
  { deep: true },
);

watch(
  chatRef,
  (v) => {
    if (v) {
      loadPersistedModel();
      loadPersistedMessages();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="chat-view">
    <div class="chat-main">
      <t-chatbot
        ref="chatRef"
        :default-messages="defaultMessages"
        :message-props="messageProps"
        :sender-props="senderProps"
        :chat-service-config="chatServiceConfig"
        @message-change="handleMessageChange"
        @chat-after-send="onSend"
      >
        <template #sender-footer-prefix>
          <div class="sender-toolbar">
            <div class="model-select-wrap">
              <t-tooltip v-model:visible="allowToolTip" content="切换模型" trigger="hover">
                <t-select
                  v-model="selectValue"
                  :options="selectOptions"
                  value-type="object"
                  :popup-props="{ overlayClassName: 'model-select-popup' }"
                  :disabled="sending"
                  @focus="allowToolTip = false"
                />
              </t-tooltip>
            </div>

            <t-button
              class="chip"
              :class="{ 'is-active': useSelectionImage }"
              shape="round"
              variant="outline"
              :disabled="sending"
              @click="toggleSelection"
            >
              选区
            </t-button>

            <t-button
              class="chip"
              :class="{ 'is-active': useCanvasImage }"
              shape="round"
              variant="outline"
              :disabled="sending"
              @click="toggleCanvas"
            >
              画布
            </t-button>

            <t-button class="chip" shape="round" variant="outline" :disabled="sending" @click="onAttachClick">
              <template #icon><ImageAddIcon /></template>
              参考图
            </t-button>
          </div>
        </template>
      </t-chatbot>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-view {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

t-chatbot {
  display: block;
  height: 100%;
  flex: 1;
  min-height: 0;
}

t-chatbot .sender-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

t-chatbot .sender-toolbar .model-select-wrap {
  width: 100px;
  flex: 0 0 100px;
  display: inline-flex;
}

t-chatbot .sender-toolbar .model-select-wrap :deep(.t-select) {
  width: 100%;
}

t-chatbot .sender-toolbar .t-select {
  width: 60px;
  height: var(--td-comp-size-m);
  flex: 0 0 auto;
  min-width: 0;
}

t-chatbot .sender-toolbar .t-select :deep(.t-input) {
  border-radius: 32px;
  padding: 0 15px;
}

t-chatbot .sender-toolbar .t-select :deep(.t-input.t-is-focused) {
  box-shadow: none;
}


:deep(.model-select-popup) {
  min-width: 140px;
  max-width: 220px;
}

:deep(.model-select-popup .t-select-option) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

t-chatbot .sender-toolbar .chip {
  height: var(--td-comp-size-m);
  border-radius: 32px;
  box-sizing: border-box;
  flex: 0 0 auto;
}

t-chatbot .sender-toolbar .chip.is-active {
  border: 1px solid var(--td-brand-color-focus);
  background: var(--td-brand-color-light);
  color: var(--td-text-color-brand);
}

.chat-image-switch-row {
  width: 100%;
}

.chat-switch-label {
  margin-left: 8px;
}

.upload-block {
  width: 100%;
}
</style>
