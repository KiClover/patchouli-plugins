import axios, { type AxiosRequestConfig } from "axios";
import { MessagePlugin } from "tdesign-vue-next";

type ApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

let secretKey: string | undefined;

export const setSecretKey = (key: string | undefined) => {
  secretKey = key || undefined;
};

const baseURL =
  (import.meta as any)?.env?.VITE_API_BASE_URL || "http://127.0.0.1:8892";

const instance = axios.create({
  baseURL,
  timeout: 30_000,
});

let lastBackendDownToastAt = 0;
const BACKEND_DOWN_TOAST_COOLDOWN_MS = 5_000;

instance.interceptors.request.use((config) => {
  if (secretKey) {
    config.headers = config.headers || {};
    (config.headers as any).SecretKey = secretKey;
  }
  return config;
});

instance.interceptors.response.use(
  (res) => res,
  (err) => {
    const noResponse = !err?.response;
    const isTimeout = err?.code === "ECONNABORTED";
    const isNetworkError =
      typeof err?.message === "string" &&
      /network error|failed to fetch/i.test(err.message);

    if (noResponse || isTimeout || isNetworkError) {
      const now = Date.now();
      if (now - lastBackendDownToastAt > BACKEND_DOWN_TOAST_COOLDOWN_MS) {
        lastBackendDownToastAt = now;
        MessagePlugin.error("后端服务连接失败，请检查网络状态");
      }
    }

    const msg =
      err?.response?.data?.msg ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    return Promise.reject(new Error(msg));
  },
);

export const req = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await instance.get<ApiEnvelope<T>>(url, config);
    const payload = res.data;
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid response payload");
    }
    if (payload.code !== 0) throw new Error(payload.msg || "Request failed");
    return payload.data;
  },
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const res = await instance.post<ApiEnvelope<T>>(url, data, config);
    const payload = res.data;
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid response payload");
    }
    if (payload.code !== 0) throw new Error(payload.msg || "Request failed");
    return payload.data;
  },
};
