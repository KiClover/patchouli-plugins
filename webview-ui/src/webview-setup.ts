import * as Comlink from "comlink";

import type { API } from "../../src/api/api";
import { updateColorScheme } from "./webview-api";

const patchComlinkForUXP = () => {
  const anyComlink: any = Comlink as any;
  const handlers: any = anyComlink && anyComlink.transferHandlers;
  if (!handlers || typeof handlers.get !== "function") return;
  const proxyHandler = handlers.get("proxy");
  if (!proxyHandler || typeof proxyHandler.deserialize !== "function") return;
  if ((proxyHandler as any).__uxp_patched__) return;
  const originalDeserialize = proxyHandler.deserialize.bind(proxyHandler);

  const wrapPortIfNeeded = (port: any) => {
    if (!port || typeof port.start === "function") return port;
    const messageListeners = new Set<any>();
    const wrapped: any = {
      start: () => {},
      postMessage: (...args: any[]) => port.postMessage(...args),
      addEventListener: (type: string, handler: any) => {
        if (typeof port.addEventListener === "function") {
          return port.addEventListener(type, handler);
        }
        if (type !== "message") return;
        messageListeners.add(handler);
        port.onmessage = (ev: any) => {
          for (const fn of messageListeners) fn(ev);
        };
      },
      removeEventListener: (type: string, handler: any) => {
        if (typeof port.removeEventListener === "function") {
          return port.removeEventListener(type, handler);
        }
        if (type !== "message") return;
        messageListeners.delete(handler);
        if (messageListeners.size === 0) port.onmessage = null;
      },
      close: (...args: any[]) => (typeof port.close === "function" ? port.close(...args) : undefined),
    };
    Object.defineProperty(wrapped, "onmessage", {
      get: () => port.onmessage,
      set: (v) => {
        port.onmessage = v;
      },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(wrapped, "onmessageerror", {
      get: () => port.onmessageerror,
      set: (v) => {
        port.onmessageerror = v;
      },
      enumerable: true,
      configurable: true,
    });
    return wrapped;
  };

  proxyHandler.deserialize = (wireValue: any) => {
    if (wireValue && wireValue.port) {
      const wrappedPort = wrapPortIfNeeded(wireValue.port);
      if (wrappedPort !== wireValue.port) {
        return originalDeserialize({ ...wireValue, port: wrappedPort });
      }
      return originalDeserialize(wireValue);
    }
    const wrappedPort = wrapPortIfNeeded(wireValue);
    return originalDeserialize(wrappedPort);
  };
  (proxyHandler as any).__uxp_patched__ = true;
};

patchComlinkForUXP();

interface UXPWebviewWindow extends Window {
  uxpHost: {
    postMessage: (msg: any) => void;
    addEventListener: (type: string, handler: Function) => void;
    removeEventListener: (type: string, handler: Function) => void;
  };
}
declare var window: UXPWebviewWindow;

const hostEndpoint = {
  postMessage: (msg: any) => window.uxpHost.postMessage(msg),
  addEventListener: (type: string, handler: Function) => {
    const wrappedHandler = (e: any) => {
      if (e && "data" in e) return handler(e);
      return handler({ data: e?.message });
    };
    (handler as any).__uxp_wrapped__ = wrappedHandler;
    window.uxpHost.addEventListener("message", wrappedHandler);
  },
  removeEventListener: (type: string, handler: Function) => {
    const wrappedHandler = (handler as any).__uxp_wrapped__ || handler;
    window.uxpHost.removeEventListener("message", wrappedHandler);
  },
};

export const initWebview = (webviewAPI: object): { page: string; api: API } => {
  const page =
    new URL(location.href).searchParams.get("page") ||
    location.href.split("/").pop()!.replace(".html", "");
  console.log("initWebview called", webviewAPI);
  const endpoint = Comlink.windowEndpoint(hostEndpoint);
  // const endpoint = Comlink.windowEndpoint(hostEndpoint, window);
  const comlinkAPI = Comlink.wrap(endpoint);
  Comlink.expose(webviewAPI, endpoint);
  //@ts-ignore
  const api = comlinkAPI.api as API;
  // update color scheme on load
  api.getColorScheme().then((scheme) => {
    updateColorScheme(scheme);
  });
  return { api, page };
};

// basic way to send a message
// const sendMessage = () => window.uxpHost.postMessage({ type: "message", text: "msg" },"*");

// basic way to get a message
// window.addEventListener("message", (e) => console.log(e));
