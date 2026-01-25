<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { DialogPlugin, MessagePlugin } from "tdesign-vue-next";

import type { API } from "../../../src/api/api";
import { setSecretKey } from "../api/req";

import {
  createPresetByUser,
  deletePresetByUser,
  getPresetListByUser,
  updatePresetByUser,
  type PresetInfo,
} from "../api/preset";

const props = defineProps<{ api: API; secretReady: boolean }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const loading = ref(false);
const list = ref<PresetInfo[]>([]);
const total = computed(() => list.value.length);

const dialogVisible = ref(false);
const form = ref<{ name: string; description: string; prompt: string }>({
  name: "",
  description: "",
  prompt: "",
});
const creating = ref(false);
const deletingId = ref<number | null>(null);

const editDialogVisible = ref(false);
const editing = ref(false);
const editingId = ref<number | null>(null);
const editForm = ref<{ id: number; name: string; description: string; prompt: string } | null>(null);

const loadList = async () => {
  loading.value = true;
  try {
    const res = await getPresetListByUser();
    list.value = res.list || [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`预设加载失败：${msg}`);
  } finally {
    loading.value = false;
  }
};

const deletePreset = async (item: PresetInfo) => {
  const name = item.name || String(item.id);

  const dialog = DialogPlugin.confirm({
    header: "确认删除",
    body: `确定删除预设「${name}」吗？此操作不可恢复。`,
    confirmBtn: {
      content: "删除",
      theme: "danger",
    },
    cancelBtn: {
      content: "取消",
    },
    onConfirm: async () => {
      if (deletingId.value != null) return;
      deletingId.value = item.id;
      try {
        dialog.update({ confirmBtn: { content: "删除", theme: "danger", loading: true } });
        await deletePresetByUser(item.id);
        MessagePlugin.success("删除成功");
        dialog.destroy();
        await loadList();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        MessagePlugin.error(`删除失败：${msg}`);
        dialog.update({ confirmBtn: { content: "删除", theme: "danger", loading: false } });
      } finally {
        deletingId.value = null;
      }
    },
  });
};

const openCreate = () => {
  form.value = { name: "", description: "", prompt: "" };
  dialogVisible.value = true;
};

const openEdit = (item: PresetInfo) => {
  editForm.value = {
    id: item.id,
    name: item.name || "",
    description: item.description || "",
    prompt: item.prompt || "",
  };
  editingId.value = item.id;
  editDialogVisible.value = true;
};

const submitEdit = async () => {
  if (!editForm.value) return;
  if (!editForm.value.name.trim()) {
    MessagePlugin.warning("请输入预设名称");
    return;
  }
  if (!editForm.value.prompt.trim()) {
    MessagePlugin.warning("请输入提示词");
    return;
  }

  editing.value = true;
  try {
    await updatePresetByUser({
      id: editForm.value.id,
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim(),
      prompt: editForm.value.prompt,
    });
    MessagePlugin.success("更新成功");
    editDialogVisible.value = false;
    await loadList();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`更新失败：${msg}`);
  } finally {
    editing.value = false;
  }
};

const submitCreate = async () => {
  if (!form.value.name.trim()) {
    MessagePlugin.warning("请输入预设名称");
    return;
  }
  if (!form.value.prompt.trim()) {
    MessagePlugin.warning("请输入提示词");
    return;
  }

  creating.value = true;
  try {
    await createPresetByUser({
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      prompt: form.value.prompt,
    });
    MessagePlugin.success("创建成功");
    dialogVisible.value = false;
    await loadList();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`创建失败：${msg}`);
  } finally {
    creating.value = false;
  }
};

const copyPrompt = async (text: string) => {
  try {
    if (!text) {
      MessagePlugin.warning("提示词为空");
      return;
    }
    await navigator.clipboard.writeText(text);
    MessagePlugin.success("已复制");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`复制失败：${msg}`);
  }
};

const loadConfig = async () => {
  let apiKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    const cfg = await props.api.getGlobalConfig();
    apiKey = cfg.apiKey || undefined;
    if (apiKey) break;
    await sleep(200);
  }
  setSecretKey(apiKey);
};

onMounted(async () => {
  await loadConfig();
  await loadList();
});
</script>

<template>
  <div class="preset-view">
    <div class="preset-view__header">
      <div class="preset-view__title">
        <div class="preset-view__title-main">预设</div>
        <div class="preset-view__title-sub">共 {{ total }} 条</div>
      </div>
      <div class="preset-view__actions">
        <t-button theme="default" variant="outline" :loading="loading" @click="loadList">
          刷新
        </t-button>
        <t-button theme="primary" @click="openCreate">创建预设</t-button>
      </div>
    </div>

    <t-loading :loading="loading" style="width: 100%">
      <div v-if="!loading && list.length === 0" class="preset-view__empty">
        暂无预设，请先创建
      </div>

      <div v-else class="preset-view__list">
        <t-card v-for="item in list" :key="item.id" class="preset-card" :bordered="true">
          <template #title>
            <div class="preset-card__title">
              <div class="preset-card__name">{{ item.name || '-' }}</div>
              <div class="preset-card__title-right">
                <div class="preset-card__id">#{{ item.id }}</div>
                <t-button
                  size="small"
                  theme="default"
                  variant="outline"
                  @click="openEdit(item)"
                >
                  编辑
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="outline"
                  :loading="deletingId === item.id"
                  @click="deletePreset(item)"
                >
                  删除
                </t-button>
              </div>
            </div>
          </template>

          <div class="preset-card__row">
            <div class="preset-card__label">描述</div>
            <div class="preset-card__value">{{ item.description || '-' }}</div>
          </div>

          <div class="preset-card__row preset-card__row--prompt">
            <div class="preset-card__label">提示词</div>
            <div class="preset-card__value preset-card__prompt">{{ item.prompt || '-' }}</div>
            <t-button
              size="small"
              theme="default"
              variant="outline"
              @click="copyPrompt(item.prompt)"
            >
              复制
            </t-button>
          </div>
        </t-card>
      </div>
    </t-loading>

    <t-dialog
      v-model:visible="dialogVisible"
      header="创建预设"
      width="560px"
      :confirm-btn="{ content: '创建', loading: creating }"
      @confirm="submitCreate"
    >
      <t-form label-width="80px" colon>
        <t-form-item label="名称">
          <t-input v-model="form.name" placeholder="请输入预设名称" />
        </t-form-item>
        <t-form-item label="描述">
          <t-input v-model="form.description" placeholder="可选" />
        </t-form-item>
        <t-form-item label="提示词">
          <t-textarea v-model="form.prompt" placeholder="请输入提示词" :autosize="{ minRows: 4, maxRows: 10 }" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      v-model:visible="editDialogVisible"
      header="编辑预设"
      width="560px"
      :confirm-btn="{ content: '保存', loading: editing }"
      @confirm="submitEdit"
    >
      <t-form v-if="editForm" label-width="80px" colon>
        <t-form-item label="名称">
          <t-input v-model="editForm.name" placeholder="例如：人像修复" />
        </t-form-item>
        <t-form-item label="描述">
          <t-input v-model="editForm.description" placeholder="可选" />
        </t-form-item>
        <t-form-item label="提示词">
          <t-textarea v-model="editForm.prompt" placeholder="请输入提示词" :autosize="{ minRows: 4, maxRows: 10 }" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped lang="scss">
.preset-view {
  padding: 12px;
}

.preset-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}

.preset-view__title-main {
  font-size: 14px;
  font-weight: 600;
}

.preset-view__title-sub {
  font-size: 12px;
  opacity: 0.75;
}

.preset-view__actions {
  display: flex;
  gap: 8px;
}

.preset-view__empty {
  padding: 16px;
  opacity: 0.8;
}

.preset-view__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:deep(.preset-card .t-card__header) {
  padding-bottom: 6px;
}

:deep(.preset-card .t-card__body) {
  padding-top: 6px;
}

.preset-card__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.preset-card__name {
  font-weight: 600;
}

.preset-card__id {
  font-size: 12px;
  opacity: 0.7;
}

.preset-card__title-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-card__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 8px;
}

.preset-card__label {
  width: 52px;
  flex: 0 0 auto;
  opacity: 0.8;
}

.preset-card__value {
  flex: 1 1 auto;
  word-break: break-word;
}

.preset-card__row--prompt {
  align-items: center;
}

.preset-card__prompt {
  max-height: 72px;
  overflow: auto;
  padding-right: 8px;
}
</style>
