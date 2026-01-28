<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

import type { API } from "../../../src/api/api";
import { addCommunityPresetToMine, getCommunityPresetList, type LibPresetInfo } from "../api/community";
import { getBaseUserById, type BaseUserInfo } from "../api/user";
import { setSecretKey } from "../api/req";

const props = defineProps<{ api: API; secretReady: boolean }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  return await Promise.race([
    p,
    (async () => {
      await sleep(ms);
      throw new Error("getGlobalConfig timeout");
    })(),
  ]);
};

const loading = ref(false);
const list = ref<LibPresetInfo[]>([]);
const total = computed(() => list.value.length);

const keyword = ref("");

const addingId = ref<number | null>(null);

const userCache = ref<Record<number, BaseUserInfo | undefined>>({});
const userLoading = ref<Record<number, boolean | undefined>>({});

const getUser = async (userId: number) => {
  if (!userId) return;
  if (userCache.value[userId]) return;
  if (userLoading.value[userId]) return;
  userLoading.value = { ...userLoading.value, [userId]: true };
  try {
    const u = await getBaseUserById(userId);
    userCache.value = { ...userCache.value, [userId]: u };
  } catch (e) {
    userCache.value = { ...userCache.value, [userId]: undefined };
  } finally {
    userLoading.value = { ...userLoading.value, [userId]: false };
  }
};

const loadList = async () => {
  loading.value = true;
  try {
    const res = await getCommunityPresetList({
      page: 1,
      page_size: 999,
      name: keyword.value.trim() ? keyword.value.trim() : undefined,
    });
    list.value = res.list || [];
    for (const item of list.value) {
      if (item?.user_id) getUser(item.user_id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`预设加载失败：${msg}`);
  } finally {
    loading.value = false;
  }
};

let searchTimer: number | null = null;
watch(
  keyword,
  () => {
    if (searchTimer != null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      loadList();
    }, 300);
  },
  { flush: "post" },
);

const addToPreset = async (item: LibPresetInfo) => {
  if (addingId.value != null) return;
  addingId.value = item.id;
  try {
    await addCommunityPresetToMine(item.id);
    MessagePlugin.success("已添加到预设");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    MessagePlugin.error(`添加失败：${msg}`);
  } finally {
    addingId.value = null;
  }
};

const avatarText = (name?: string) => {
  const v = (name || "").trim();
  if (!v) return "?";
  return v.slice(0, 1).toUpperCase();
};

const loadConfig = async () => {
  let apiKey: string | undefined;
  for (let i = 0; i < 10; i++) {
    try {
      const cfg = await withTimeout(props.api.getGlobalConfig(), 800);
      apiKey = cfg.apiKey || undefined;
      if (apiKey) break;
    } catch {
    }
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
  <div class="community-view">
    <div class="community-view__header">
      <div class="community-view__title">
        <div class="community-view__title-main">大图书馆</div>
        <div class="community-view__title-sub">共 {{ total }} 条</div>
      </div>
      <div class="community-view__actions">
        <t-input v-model="keyword" clearable placeholder="筛选名称" style="width: 220px" />
        <t-button theme="default" variant="outline" :loading="loading" @click="loadList">刷新</t-button>
      </div>
    </div>

    <t-loading :loading="loading" style="width: 100%">
      <div v-if="!loading && list.length === 0" class="community-view__empty">暂无预设</div>

      <div v-else class="community-view__list">
        <t-card v-for="item in list" :key="item.id" class="community-card" :bordered="true">
          <template #title>
            <div class="community-card__title">
              <div class="community-card__name">{{ item.name || "-" }}</div>
              <div class="community-card__title-right">
                <div class="community-card__id">#{{ item.id }}</div>
                <t-button
                  size="small"
                  theme="primary"
                  variant="outline"
                  :loading="addingId === item.id"
                  @click="addToPreset(item)"
                >
                  添加到预设
                </t-button>
              </div>
            </div>
          </template>

          <div class="community-card__row">
            <div class="community-card__label">描述</div>
            <div class="community-card__value">{{ item.description || "-" }}</div>
          </div>
          <!--
          <div class="community-card__row community-card__row--prompt">
            <div class="community-card__label">提示词</div>
            <div class="community-card__value community-card__prompt">{{ item.prompt || "-" }}</div>
          </div>
          -->

          <div class="community-card__footer">
            <div class="community-card__user">
              <t-avatar
                size="small"
                :image="userCache[item.user_id]?.avatar"
                :alt="userCache[item.user_id]?.name"
              >
                {{ avatarText(userCache[item.user_id]?.name) }}
              </t-avatar>
              <div class="community-card__username">
                {{ userCache[item.user_id]?.name || `用户#${item.user_id}` }}
              </div>
            </div>
          </div>
        </t-card>
      </div>
    </t-loading>
  </div>
</template>

<style scoped lang="scss">
.community-view {
  padding: 12px;
}

.community-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}

.community-view__title-main {
  font-size: 14px;
  font-weight: 600;
}

.community-view__title-sub {
  font-size: 12px;
  opacity: 0.75;
}

.community-view__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.community-view__empty {
  padding: 16px;
  opacity: 0.8;
}

.community-view__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:deep(.community-card .t-card__header) {
  padding-bottom: 6px;
}

:deep(.community-card .t-card__body) {
  padding-top: 6px;
}

.community-card__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.community-card__name {
  font-weight: 600;
}

.community-card__id {
  font-size: 12px;
  opacity: 0.7;
}

.community-card__title-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.community-card__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 8px;
}

.community-card__label {
  width: 52px;
  flex: 0 0 auto;
  opacity: 0.8;
}

.community-card__value {
  flex: 1 1 auto;
  word-break: break-word;
}

.community-card__row--prompt {
  align-items: flex-start;
}

.community-card__prompt {
  max-height: 72px;
  overflow: auto;
  padding-right: 8px;
}

.community-card__footer {
  margin-top: 10px;
  display: flex;
  justify-content: flex-start;
}

.community-card__user {
  display: flex;
  align-items: center;
  gap: 8px;
}

.community-card__username {
  font-size: 12px;
  opacity: 0.85;
}
</style>
