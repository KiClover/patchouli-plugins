import * as Comlink from "comlink";
import { api } from "./api/api";

import type { WebviewAPI } from "../webview-ui/src/webview";
import { id, config } from "../uxp.config";
import { getColorScheme } from "./api/uxp";

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

interface UXPHTMLWebViewElement extends HTMLElement {
  uxpAllowInspector: string;
  src: string;
  postMessage: (msg: any) => void;
}

export const webviewInitHost = (params: {
  // webview?: UXPHTMLWebViewElement;
  multi: boolean | string[];
}): Promise<WebviewAPI[]> => {
  const multi = params ? params.multi : false;
  return new Promise((resolve, reject) => {
    let pages = ["main"];
    if (multi === true || Array.isArray(multi)) {
      pages = config.manifest.entrypoints.map(
        (point) => point.id.split(".")!.pop()!,
      );
      console.log("webviewInitHost multi pages", pages);
    }
    let apis: WebviewAPI[] = [];
    pages.map((page, i) => {
      // if (i > 0) return;
      let webview = document.createElement("webview") as UXPHTMLWebViewElement;
      webview.className = "webview-ui";
      webview.id = `webview-${i}`;
      webview.uxpAllowInspector = "true";
      const origin =
        import.meta.env.VITE_BOLT_MODE === "dev"
          ? `http://localhost:${import.meta.env.VITE_BOLT_WEBVIEW_PORT}/?page=${page}`
          : `plugin:/webview-ui/${page}.html`;
      webview.src = origin;

      const appElement = document.getElementById("app")!;
      const parent =
        i === 0
          ? appElement
          : Array.from(document.getElementsByTagName("uxp-panel")).find(
              (item) => item.getAttribute("panelid") === `${id}.${page}`,
            );
      console.log({ parent });
      webview = parent!.appendChild(webview) as UXPHTMLWebViewElement;

      webview.addEventListener("message", (e) => {
        console.log("webview message", page, e.message);
      });
      let loaded = false;
      webview.addEventListener("loadstop", (e) => {
        if (loaded) return;
        loaded = true;
        const backendAPI = { api };
        const backendEndpoint = {
          postMessage: (msg: any, transferrables: any) => {
            console.log("running postMessage", page, msg), transferrables;
            return webview!.postMessage(msg);
          },
          addEventListener: (type: string, handler: any) => {
            console.log("running addEventListener", webview!.addEventListener);
            const wrappedHandler = (e: any) => {
              if (e && "data" in e) return handler(e);
              return handler({ data: e?.message });
            };
            (handler as any).__uxp_wrapped__ = wrappedHandler;
            webview!.addEventListener("message", wrappedHandler);
          },
          removeEventListener: (type: string, handler: any) => {
            console.log(
              "running removeEventListener",
              webview!.removeEventListener,
            );
            const wrappedHandler = (handler as any).__uxp_wrapped__ || handler;
            webview!.removeEventListener("message", wrappedHandler);
          },
        };

        console.log({ origin });

        const endpoint = Comlink.windowEndpoint(backendEndpoint);

        // Now we bind to the Webview's APIs
        //@ts-ignore
        const comlinkAPI = Comlink.wrap(endpoint) as WebviewAPI;
        // TODO: might need to adjust for multi webviews
        apis.push(comlinkAPI);
        // Once - At End
        Comlink.expose(
          backendAPI,
          endpoint,
          [origin], // doesn't work in prod
        );
        if (apis.length === pages.length) {
          console.log("webviewInitHost resolved");
          for (const api of apis) {
            getColorScheme().then((scheme) => {
              api.updateColorScheme(scheme);
            });
            //@ts-ignore
            document.theme.onUpdated.addListener(() =>
              getColorScheme().then((scheme) => {
                api.updateColorScheme(scheme);
              }),
            );
          }
          resolve(apis);
        }
        // else {
        //   console.log(
        //     "webviewInitHost not resolved yet",
        //     apis.length,
        //     pages.length,
        //   );
        // }

        // Send Basic Message to Webview
        // webview.postMessage({type: "uxp-to-webview"});

        // Get Basic Messages from Webview
        // let lastEventId = ''
        window.addEventListener("message", (e) => console.log("MESSAGE:", e));
      });
    });
  });
};
