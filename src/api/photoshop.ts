import { photoshop } from "../globals";

export const notify = async (message: string) => {
  await photoshop.app.showAlert(message);
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

export const getProjectInfo = async () => {
  const doc = photoshop.app.activeDocument;
  const info = {
    name: doc.name,
    path: doc.path,
    id: doc.id,
  };
  return info;
};
