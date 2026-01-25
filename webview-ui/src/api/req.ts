import axios, { type AxiosRequestConfig } from "axios";
import { MessagePlugin } from "tdesign-vue-next";

type ApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

let secretKey: string | undefined;

export const setSecretKey = (key: string | undefined) => {
  console.log("[req] setSecretKey called:", key ? `${key.slice(0, 6)}...` : "(empty)");
  secretKey = key || undefined;
};

export type ApiServiceName = "preset" | "library" | "user";

const getServiceBaseURL = (service: ApiServiceName) => {
  const env = (import.meta as any)?.env || {};

  const presetURL = env.VITE_API_BASE_URL || "http://127.0.0.1:8892";
  const libraryURL = env.VITE_LIBRARY_API_BASE_URL || "http://127.0.0.1:8893";
  const userURL = env.VITE_BASE_API_BASE_URL || "http://127.0.0.1:8890";

  if (service === "library") return libraryURL;
  if (service === "user") return userURL;
  return presetURL;
};

const instances: Partial<Record<ApiServiceName, ReturnType<typeof axios.create>>> = {};

const createInstance = (service: ApiServiceName) => {
  const instance = axios.create({
    baseURL: getServiceBaseURL(service),
    timeout: 30_000,
  });

  instance.interceptors.request.use((config: any) => {
    console.log(
      "[req] interceptor:",
      service,
      config.url,
      "secretKey=",
      secretKey ? `${secretKey.slice(0, 6)}...` : "(empty)",
    );
    const shouldAttachSecretKey = service !== "user";
    if (shouldAttachSecretKey && secretKey) {
      config.headers = config.headers || {};
      (config.headers as any).SecretKey = secretKey;
    }
    return config;
  });

  instance.interceptors.response.use(
    (res: any) => res,
    (err: any) => {
      const noResponse = !err?.response;
      const isTimeout = err?.code === "ECONNABORTED";
      const isNetworkError =
        typeof err?.message === "string" && /network error|failed to fetch/i.test(err.message);

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

  return instance;
};

const getInstance = (service: ApiServiceName) => {
  if (!instances[service]) instances[service] = createInstance(service);
  return instances[service]!;
};

let lastBackendDownToastAt = 0;
const BACKEND_DOWN_TOAST_COOLDOWN_MS = 5_000;

const createReq = (service: ApiServiceName) => {
  const instance = getInstance(service);
  return {
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
};

export const reqOf = (service: ApiServiceName) => createReq(service);

export const req = createReq("preset");
