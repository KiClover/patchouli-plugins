<script setup lang="ts">
const communityUrl = "about:blank";
</script>

<template>
  <div class="community-view">
    <iframe class="community-iframe" :src="communityUrl" />
  </div>
</template>

<style scoped lang="scss">
.community-view {
  height: 100%;
  padding: 0;
}

.community-iframe {
  width: 100%;
  height: calc(100vh - 56px);
  border: 0;
}
</style>
