import { photoshop, uxp } from "../globals";
import { getGrsProviderKey } from "./uxp";

export const notify = async (message: string) => {
  await photoshop.app.showAlert(message);
};

const urlFileName = (url: string) => {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop() || "generated";
    return base.includes(".") ? base : `${base}.png`;
  } catch {
    return "generated.png";
  }
};

export const placeImageUrlToSelectionAndMask = async (params: {
  url: string;
  fileName?: string;
}) => {
  return await photoshop.core.executeAsModal(async () => {
    const doc = photoshop.app.activeDocument;
    if (!doc) throw new Error("No active document");
    const selBounds = doc.selection?.bounds;
    if (!selBounds) throw new Error("No selection");

    // Save selection bounds as numbers (no channel creation to avoid PS dialogs)
    const selLeft = typeof (selBounds as any).left === "number" ? (selBounds as any).left : Number((selBounds as any).left?.value ?? (selBounds as any).left);
    const selTop = typeof (selBounds as any).top === "number" ? (selBounds as any).top : Number((selBounds as any).top?.value ?? (selBounds as any).top);
    const selRight = typeof (selBounds as any).right === "number" ? (selBounds as any).right : Number((selBounds as any).right?.value ?? (selBounds as any).right);
    const selBottom = typeof (selBounds as any).bottom === "number" ? (selBounds as any).bottom : Number((selBounds as any).bottom?.value ?? (selBounds as any).bottom);
    const selW = Math.max(1, selRight - selLeft);
    const selH = Math.max(1, selBottom - selTop);

    // Download image
    const res = await fetch(params.url);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Download image failed: ${res.status}${t ? ` - ${t}` : ""}`);
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    const tempFolder = await uxp.storage.localFileSystem.getTemporaryFolder();
    const name = params.fileName || urlFileName(params.url);
    const file = await tempFolder.createFile(name, { overwrite: true });
    await file.write(bytes, { format: uxp.storage.formats.binary } as any);

    const token = uxp.storage.localFileSystem.createSessionToken(file);

    // Place the image (creates a smart object layer)
    await photoshop.action.batchPlay(
      [
        {
          _obj: "placeEvent",
          null: {
            _path: token,
            _kind: "local",
          },
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      {},
    );

    const layer = doc.activeLayers?.[0];
    if (!layer) throw new Error("No active layer after placing image");
    const layerId = (layer as any).id;

    // Use DOM API for transform - more stable than batchPlay transform
    const b0: any = layer.bounds;
    const l0 = typeof b0?.left === "number" ? b0.left : Number(b0?.left?.value ?? b0?.left);
    const t0 = typeof b0?.top === "number" ? b0.top : Number(b0?.top?.value ?? b0?.top);
    const r0 = typeof b0?.right === "number" ? b0.right : Number(b0?.right?.value ?? b0?.right);
    const btm0 = typeof b0?.bottom === "number" ? b0.bottom : Number(b0?.bottom?.value ?? b0?.bottom);
    const w0 = Math.max(1, r0 - l0);
    const h0 = Math.max(1, btm0 - t0);

    // Move layer to top-left of selection first
    await (layer as any).translate(selLeft - l0, selTop - t0);

    // Scale layer to match selection size (from top-left anchor)
    const sx = (selW / w0) * 100;
    const sy = (selH / h0) * 100;
    await (layer as any).scale(sx, sy, photoshop.constants.AnchorPosition.TOPLEFT);

    // Restore selection using rectangle coordinates (no channel to avoid PS dialogs)
    await photoshop.action.batchPlay(
      [
        {
          _obj: "set",
          _target: [{ _ref: "channel", _property: "selection" }],
          to: {
            _obj: "rectangle",
            top: { _unit: "pixelsUnit", _value: selTop },
            left: { _unit: "pixelsUnit", _value: selLeft },
            bottom: { _unit: "pixelsUnit", _value: selBottom },
            right: { _unit: "pixelsUnit", _value: selRight },
          },
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      {},
    );

    // Ensure the placed layer is targeted before creating the mask
    await photoshop.action.batchPlay(
      [
        {
          _obj: "select",
          _target: [{ _ref: "layer", _id: layerId }],
          makeVisible: false,
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      {},
    );

    // Create layer mask from selection
    return await photoshop.action.batchPlay(
      [
        {
          _obj: "make",
          new: { _class: "channel" },
          at: { _ref: "channel", _enum: "channel", _value: "mask" },
          using: { _enum: "userMaskEnabled", _value: "revealSelection" },
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      {},
    );
  }, { commandName: "Place Image URL To Selection And Mask" });
};


const toPx = (v: any): number => {
    if (typeof v === "number") return v;
    if (v == null) return 0;
    if (typeof v === "object" && "value" in v) return Number(v.value);
    return Number(v);
};

const normalizeToUint8 = (data: unknown, expectedLen: number, name: string): Uint8Array => {
    if (data instanceof Uint8Array) {
        if (data.length !== expectedLen) throw new Error(`${name} length mismatch: expected ${expectedLen}, got ${data.length}`);
        return data;
    }

    if (data instanceof Uint16Array) {
        if (data.length !== expectedLen) throw new Error(`${name} length mismatch: expected ${expectedLen}, got ${data.length}`);
        let max = 0;
        for (let i = 0; i < expectedLen; i++) if (data[i] > max) max = data[i];

        const out = new Uint8Array(expectedLen);

        // SDPPP: imaging.getData() 在某些情况下会返回 0..32768 的 Uint16（而不是 0..65535），
        // 并且把 32768 视作“满量程”。SDPPP 的做法是：32768 -> 255，其余 /128。
        if (max <= 32768) {
            for (let i = 0; i < expectedLen; i++) {
                const v = data[i];
                out[i] = v === 32768 ? 255 : Math.max(0, Math.min(255, Math.floor(v / 128)));
            }
            return out;
        }

        // 常规 16bit 0..65535 -> 0..255
        for (let i = 0; i < expectedLen; i++) out[i] = Math.max(0, Math.min(255, Math.round(data[i] / 257)));
        return out;
    }

    if (data instanceof Float32Array || data instanceof Float64Array) {
        const f = data as Float32Array | Float64Array;
        if (f.length !== expectedLen) throw new Error(`${name} length mismatch: expected ${expectedLen}, got ${f.length}`);
        let max = 0;
        for (let i = 0; i < expectedLen; i++) if (f[i] > max) max = f[i];
        const scale = max <= 1.0 ? 255 : 1;
        const out = new Uint8Array(expectedLen);
        for (let i = 0; i < expectedLen; i++) out[i] = Math.max(0, Math.min(255, Math.round(f[i] * scale)));
        return out;
    }

    if (data && typeof data === "object" && "buffer" in (data as any) && "byteLength" in (data as any)) {
        const u8 = new Uint8Array((data as any).buffer as ArrayBuffer);
        if (u8.length === expectedLen) return u8;
    }

    throw new Error(`${name} unsupported data type: ${Object.prototype.toString.call(data)}`);
};

const minMaxU8 = (u8: Uint8Array) => {
    let min = 255;
    let max = 0;
    for (let i = 0; i < u8.length; i++) {
        const v = u8[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return { min, max };
};

const srgbEncodeLut = (() => {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        const y = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
        lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
    }
    return lut;
})();

export const getCurrentSelectionRgba = async (params?: { applyGamma?: boolean }) => {
    return await photoshop.core.executeAsModal(async () => {
        const doc = photoshop.app.activeDocument;
        if (!doc) return null;

        const selBounds = doc.selection?.bounds;
        if (!selBounds) return null;

        const left = toPx(selBounds.left);
        const top = toPx(selBounds.top);
        const right = toPx(selBounds.right);
        const bottom = toPx(selBounds.bottom);

        const width = Math.max(1, Math.round(right - left));
        const height = Math.max(1, Math.round(bottom - top));

        const sourceBounds = { left, top, right, bottom, width, height };

        // 1) 取 RGB 像素（选区矩形范围）
        const pixelsResult = await photoshop.imaging.getPixels({
            documentID: doc.id,
            sourceBounds,
            colorSpace: "RGB",
            applyAlpha: false,
            hasAlpha: true,
            colorProfile: "sRGB IEC61966-2.1",
        } as any);
        const rgbImageData = pixelsResult.imageData;
        const rgbRaw = await rgbImageData.getData({} as any);
        rgbImageData.dispose();

        const totalPixels = width * height;
        const rawLen = (rgbRaw as any)?.length ?? 0;
        const comps = rawLen / totalPixels;
        if (comps !== 3 && comps !== 4) {
            throw new Error(`Unexpected pixel components: ${comps}`);
        }

        const rgbU8 = normalizeToUint8(rgbRaw, totalPixels * comps, "rgb");

        const applyGamma = params?.applyGamma === true;
        if (applyGamma) {
            for (let i = 0; i < rgbU8.length; i += comps) {
                rgbU8[i + 0] = srgbEncodeLut[rgbU8[i + 0]];
                rgbU8[i + 1] = srgbEncodeLut[rgbU8[i + 1]];
                rgbU8[i + 2] = srgbEncodeLut[rgbU8[i + 2]];
            }
        }

        // 2) 取选区 mask（1 通道，0-255）
        const selResult = await photoshop.imaging.getSelection({
            documentID: doc.id,
            sourceBounds,
        } as any);
        const selImageData = selResult.imageData;
        const maskRaw = await selImageData.getData({} as any);
        selImageData.dispose();

        const maskU8 = normalizeToUint8(maskRaw, totalPixels, "mask");

        const mmRgb = minMaxU8(rgbU8);
        const mmMask = minMaxU8(maskU8);
        console.log("selection rgba debug", { width, height, comps, applyGamma, rgb: mmRgb, mask: mmMask });

        // 3) 合成 RGBA（mask 当 alpha）
        const rgba = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            const r = rgbU8[i * comps + 0];
            const g = rgbU8[i * comps + 1];
            const b = rgbU8[i * comps + 2];
            const a0 = comps === 4 ? rgbU8[i * comps + 3] : 255;
            const a = Math.round((a0 * maskU8[i]) / 255);

            rgba[i * 4 + 0] = r;
            rgba[i * 4 + 1] = g;
            rgba[i * 4 + 2] = b;
            rgba[i * 4 + 3] = a;
        }

        return {
            width,
            height,
            // UXP + Comlink 对 ArrayBuffer/TypedArray 的跨域传输有时会变成 0 长度，
            // 这里改成可序列化的 number[]，由 webview 侧再还原成 Uint8ClampedArray。
            rgba: Array.from(rgba),
        };
    }, { commandName: "Cache Selection Image" });
};

type GrsUploadTokenZHResponse = {
  data: {
    token: string;
    key: string;
    url: string;
    domain: string;
  };
};

const uploadBlobToGrsai = async (blob: Blob, ext: string): Promise<string> => {
  const providerKey = await getGrsProviderKey();
  if (!providerKey) throw new Error("Provider Key 为空");

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
  form.append("file", blob, `selection.${ext}`);

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

const base64ToU8 = (b64: string): Uint8Array => {
  const s = String(b64 || "").trim();
  if (!s) return new Uint8Array(0);
  const bin = (globalThis as any).atob ? (globalThis as any).atob(s) : "";
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
};

const rgbaToRgbU8 = (rgba: Uint8Array): Uint8Array => {
  const total = Math.floor(rgba.length / 4);
  const rgb = new Uint8Array(total * 3);
  // JPEG 不支持 alpha；这里把 RGBA 预乘合成到白底。
  const bg = 255;
  for (let i = 0; i < total; i++) {
    const r = rgba[i * 4 + 0];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    rgb[i * 3 + 0] = Math.max(0, Math.min(255, Math.round(r * a + bg * (1 - a))));
    rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g * a + bg * (1 - a))));
    rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b * a + bg * (1 - a))));
  }
  return rgb;
};

const rgbaToJpegBlob = async (params: { rgba: Uint8Array; width: number; height: number }): Promise<Blob> => {
  const { rgba, width, height } = params;
  const imaging: any = (photoshop as any).imaging;
  if (!imaging?.createImageDataFromBuffer || !imaging?.encodeImageData) {
    throw new Error("Photoshop imaging.encodeImageData 不可用");
  }

  const rgb = rgbaToRgbU8(rgba);

  const imgData = await imaging.createImageDataFromBuffer(rgb, {
    width,
    height,
    components: 3,
    chunky: true,
    colorSpace: "RGB",
    colorProfile: "sRGB IEC61966-2.1",
  });

  const jpegBase64 = await imaging.encodeImageData({ imageData: imgData, base64: true });
  if (typeof jpegBase64 !== "string" || !jpegBase64) throw new Error("encodeImageData 返回无效数据");

  const bytes = base64ToU8(jpegBase64);
  if (!bytes.length) throw new Error("JPEG 编码结果为空");
  return new Blob([bytes], { type: "image/jpeg" });
};

export const getCurrentSelectionPngUrl = async (params?: { applyGamma?: boolean; forceOpaque?: boolean }) => {
  return await photoshop.core.executeAsModal(async () => {
    const doc = photoshop.app.activeDocument;
    if (!doc) return null;

    const selBounds = doc.selection?.bounds;
    if (!selBounds) return null;

    const left = toPx(selBounds.left);
    const top = toPx(selBounds.top);
    const right = toPx(selBounds.right);
    const bottom = toPx(selBounds.bottom);

    const width = Math.max(1, Math.round(right - left));
    const height = Math.max(1, Math.round(bottom - top));
    const sourceBounds = { left, top, right, bottom, width, height };

    const pixelsResult = await photoshop.imaging.getPixels({
      documentID: doc.id,
      sourceBounds,
      colorSpace: "RGB",
      applyAlpha: false,
      hasAlpha: true,
      colorProfile: "sRGB IEC61966-2.1",
    } as any);
    const rgbImageData = pixelsResult.imageData;
    const rgbRaw = await rgbImageData.getData({} as any);
    rgbImageData.dispose();

    const totalPixels = width * height;
    const rawLen = (rgbRaw as any)?.length ?? 0;
    const comps = rawLen / totalPixels;
    if (comps !== 3 && comps !== 4) {
      throw new Error(`Unexpected pixel components: ${comps}`);
    }

    const rgbU8 = normalizeToUint8(rgbRaw, totalPixels * comps, "rgb");
    const applyGamma = params?.applyGamma === true;
    if (applyGamma) {
      for (let i = 0; i < rgbU8.length; i += comps) {
        rgbU8[i + 0] = srgbEncodeLut[rgbU8[i + 0]];
        rgbU8[i + 1] = srgbEncodeLut[rgbU8[i + 1]];
        rgbU8[i + 2] = srgbEncodeLut[rgbU8[i + 2]];
      }
    }

    const selResult = await photoshop.imaging.getSelection({
      documentID: doc.id,
      sourceBounds,
    } as any);
    const selImageData = selResult.imageData;
    const maskRaw = await selImageData.getData({} as any);
    selImageData.dispose();

    const maskU8 = normalizeToUint8(maskRaw, totalPixels, "mask");

    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const r = rgbU8[i * comps + 0];
      const g = rgbU8[i * comps + 1];
      const b = rgbU8[i * comps + 2];
      const a0 = comps === 4 ? rgbU8[i * comps + 3] : 255;
      const a = Math.round((a0 * maskU8[i]) / 255);
      rgba[i * 4 + 0] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = a;
    }

    if (params?.forceOpaque === true) {
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    }

    const blob = await rgbaToJpegBlob({ rgba, width, height });
    const url = await uploadBlobToGrsai(blob, "jpg");
    return { width, height, url };
  }, { commandName: "Upload Selection PNG" });
};

export const getProjectInfo = async () => {
  const doc = photoshop.app.activeDocument;
  const info = {
    name: doc.name,
    path: doc.path,
    id: doc.id,
  };
  return info;
};
