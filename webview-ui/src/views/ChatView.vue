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

const selectOptions = [
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
const isRestoring = ref(false);
const clearDialogVisible = ref(false);
const ready = ref(false);

const files = ref<TdAttachmentItem[]>([]);
const mockMessage = ref<ChatMessagesData[]>([]);

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

const sanitizeForJson = <T>(v: T): T => {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => {
      if (typeof val === "function") return undefined;
      if (typeof val === "bigint") return String(val);
      return val;
    }),
  ) as T;
};

let pendingSaveTimer: any = null;
const scheduleSaveChatState = () => {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  pendingSaveTimer = setTimeout(async () => {
    pendingSaveTimer = null;
    const fn = (props.api as any).setChatState;
    if (typeof fn !== "function") return;
    try {
      await fn(
        sanitizeForJson({
          selectedModel: selectValue.value?.value,
          messages: mockMessage.value || [],
        }),
      );
    } catch {
    }
  }, 300);
};

const loadPersistedState = async () => {
  const fn = (props.api as any).getChatState;
  if (typeof fn !== "function") return;

  const state = (await fn().catch(() => ({}))) as any;
  const model = String(state?.selectedModel || "").trim();
  if (model) {
    const found = selectOptions.find((x) => x.value === model);
    if (found) selectValue.value = found;
  }

  const msgs = state?.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    isRestoring.value = true;
    mockMessage.value = msgs as ChatMessagesData[];
    chatRef.value?.setMessages?.(mockMessage.value as any, "replace" as any);
    Promise.resolve().then(() => {
      isRestoring.value = false;
    });
  }
};

const onChatReady = async () => {
  await loadPersistedState();
  ready.value = true;
};

const QUICK_NANOBANANA_PROMPT =
  "你是一个资深二次元cos后期特效师，请分析图中的角色并为我写出符合人物动作和人物人设和背景的特效适用于NanobananaPro的自然语言特效生成提示词，用形如 角色：xx 提示词：xx的方式为我写出，注意需要让其保持角色主体严格不变";
const QUICK_FT_PROMPT = "你是一个资深二次元cos后期特效师，请分析图片为我反推出适用于NanobananaPro的自然语言为角色添加特效和合成的生成提示词，注意需要让其保持角色主体严格不变，用形如提示词：xx的方式为我写出"

const quickPrompts = [
  {
    label: "根据选区获取角色特效提示词",
    prompt: QUICK_NANOBANANA_PROMPT,
  },
  { label: "根据参考图反推提示词",
    prompt: QUICK_FT_PROMPT},
];

const handleQuickPrompt = (prompt: string) => {
  if (!ready.value) return;
  chatRef.value?.addPrompt?.(prompt);
};

const openClearDialog = () => {
  if (sending.value) return;
  clearDialogVisible.value = true;
};

const doClearHistory = async () => {
  if (sending.value) return;
  const fn = (props.api as any).clearChatState;
  if (typeof fn === "function") {
    try {
      await fn();
    } catch {
    }
  }

  isRestoring.value = true;
  mockMessage.value = [];
  chatRef.value?.clearMessages?.();
  chatRef.value?.setMessages?.(defaultMessages as any, "replace" as any);
  Promise.resolve().then(() => {
    isRestoring.value = false;
  });
  clearDialogVisible.value = false;
};

const defaultMessages: ChatMessagesData[] = [
  {
    id: "welcome",
    role: "assistant",
    content: [
      {
        type: "text",
        status: "complete",
        data: "欢迎使用预言之书，你可以选择模型、附带选区图片，并上传参考图。",
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

const onAttachClick = async () => {
  if (sending.value) return;
  const fn = (props.api as any).pickAndUploadChatReferenceImages;
  if (typeof fn !== "function") {
    MessagePlugin.error("当前环境不支持选择参考图");
    return;
  }

  MessagePlugin.info("请选择参考图...");
  try {
    const res = (await fn().catch(() => [])) as Array<{ name: string; url: string }>;
    if (!Array.isArray(res) || res.length === 0) return;

    files.value = [
      ...res.map((it) => ({
        name: String(it?.name || "参考图"),
        url: String(it?.url || ""),
        status: "success",
        description: "上传成功",
      } as any)),
      ...files.value,
    ];

    MessagePlugin.success(`参考图上传成功（${res.length}张）`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(msg);
  }
};

const getRawFromAttachmentItem = (item: any): any => {
  return (
    item?.raw ||
    item?.file ||
    item?.originFileObj ||
    item?.response?.raw ||
    item?.url ||
    item?.previewUrl ||
    item?.data ||
    item?.blob
  );
};

const onFileSelect = async (e: CustomEvent<TdAttachmentItem[]>) => {
  const detail: any = (e as any)?.detail;
  const currFiles = (Array.isArray(detail) ? detail : Array.isArray(detail?.files) ? detail.files : []) as TdAttachmentItem[];
  if (currFiles.length === 0) return;

  MessagePlugin.info(`开始上传参考图（${currFiles.length}张）...`);

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
    let raw: any = getRawFromAttachmentItem(f as any);

    if (typeof raw === "string" && (raw.startsWith("blob:") || raw.startsWith("data:"))) {
      try {
        const res = await fetch(raw);
        if (res.ok) {
          raw = await res.blob();
        }
      } catch {
      }
    }

    if (raw && !(raw instanceof Blob) && typeof raw?.arrayBuffer === "function") {
      try {
        const ab = await raw.arrayBuffer();
        raw = new Blob([ab], { type: String(raw?.type || "application/octet-stream") });
      } catch {
      }
    }

    if (!(raw instanceof Blob)) {
      MessagePlugin.warning("未获取到可上传的文件对象：请重新选择参考图");
      continue;
    }

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
      MessagePlugin.success("参考图上传成功");
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
  const detail: any = (e as any)?.detail;
  const next = (Array.isArray(detail) ? detail : Array.isArray(detail?.files) ? detail.files : []) as TdAttachmentItem[];
  files.value = next;
  if (!isRestoring.value) scheduleSaveChatState();
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

const patchUserMessageAttachments = (messageID: string | undefined, items: any[]) => {
  if (!items || items.length === 0) return;
  const id = String(messageID || "").trim();
  const msgs = (chatRef.value?.chatMessageValue || []) as any[];
  if (msgs.length === 0) return;

  const idx = id ? msgs.findIndex((m) => m && m.id === id) : -1;
  const targetIndex = idx >= 0 ? idx : (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === "user") return i;
    }
    return -1;
  })();
  if (targetIndex < 0) return;

  const m = msgs[targetIndex];
  const contentArr = Array.isArray(m?.content) ? [...m.content] : [];

  const existingAttachmentIdx = contentArr.findIndex((c: any) => c?.type === "attachment");
  if (existingAttachmentIdx >= 0) {
    const ex = contentArr[existingAttachmentIdx];
    const exData = Array.isArray(ex?.data) ? ex.data : [];
    contentArr[existingAttachmentIdx] = {
      ...ex,
      data: [...exData, ...items],
    };
  } else {
    contentArr.push({ type: "attachment", data: items });
  }

  const nextMsgs = msgs.map((x, i) => (i === targetIndex ? { ...m, content: contentArr } : x));
  chatRef.value?.setMessages?.(nextMsgs as any, "replace" as any);

  mockMessage.value = nextMsgs as any;
  if (!isRestoring.value) scheduleSaveChatState();
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
      chatContentProps: {
        thinking: {
          defaultCollapsed: true,
        },
      },
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
      const attachmentItems: any[] = [];
      if (useSelectionImage.value) {
        const sel = await props.api.getCurrentSelectionPngUrl?.({ forceOpaque: true } as any);
        const u = (sel as any)?.url;
        if (u) {
          urls.push(String(u));
          attachmentItems.push({
            name: "选区",
            url: String(u),
            status: "success",
            description: "选区",
          });
        }
      }
      if (useCanvasImage.value) {
        const canvas = await props.api.getCurrentCanvasPngUrl?.({ forceOpaque: true } as any);
        const u = (canvas as any)?.url;
        if (u) {
          urls.push(String(u));
          attachmentItems.push({
            name: "画布",
            url: String(u),
            status: "success",
            description: "画布",
          });
        }
      }
      for (const f of files.value as any[]) {
        if (f?.status === "success" && f?.url) {
          urls.push(String(f.url));
          attachmentItems.push({
            name: String(f?.name || "参考图"),
            url: String(f.url),
            status: "success",
            description: "参考图",
          });
        }
      }

      patchUserMessageAttachments(String((innerParams as any)?.messageID || ""), attachmentItems);

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
  if (!isRestoring.value) scheduleSaveChatState();
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
    actions: ["send"],
    attachmentsProps: {
      items: files.value,
    },
    onFileRemove,
  } as any;
});

watch(
  selectValue,
  () => {
    if (!isRestoring.value) scheduleSaveChatState();
  },
  { deep: true },
);
</script>

<template>
  <div class="chat-view">
    <div class="chat-header">
      <t-button class="clear-btn" shape="round" variant="outline" :disabled="sending" @click="openClearDialog">
        清空聊天
      </t-button>
    </div>

    <div class="quick-prompts">
      <div class="prompts-title">快捷指令：</div>
      <div class="prompts-buttons">
        <t-button
          v-for="(item, index) in quickPrompts"
          :key="index"
          size="small"
          variant="outline"
          :disabled="!ready || sending"
          @click="handleQuickPrompt(item.prompt)"
        >
          {{ item.label }}
        </t-button>
      </div>
    </div>

    <div class="chat-main">
      <t-chatbot
        ref="chatRef"
        :default-messages="defaultMessages"
        :message-props="messageProps"
        :sender-props="senderProps"
        :chat-service-config="chatServiceConfig"
        @message-change="handleMessageChange"
        @chat-ready="onChatReady"
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
            <!--
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
            -->
            <t-button class="chip" shape="round" variant="outline" :disabled="sending" @click="onAttachClick">
              <template #icon><ImageAddIcon /></template>
              参考图
            </t-button>
          </div>
        </template>
      </t-chatbot>
    </div>

    <t-dialog
      v-model:visible="clearDialogVisible"
      header="确认清空"
      body="确定清空聊天记录吗？此操作不可恢复。"
      :confirm-btn="{ content: '清空', theme: 'danger' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="doClearHistory"
    />
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

.chat-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.chat-header .clear-btn {
  height: var(--td-comp-size-m);
  border-radius: 32px;
}

.quick-prompts {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-prompts .prompts-title {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.9;
}

.quick-prompts .prompts-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
