import { photoshop, uxp } from "../globals";

import axios from "axios";

export const notify = async (message: string) => {
  await photoshop.app.showAlert(message);
};


const toPx = (v: any): number => {
    if (typeof v === "number") return v;
    if (v == null) return 0;
    if (typeof v === "object" && "value" in v) return Number(v.value);
    return Number(v);
};

export const uploadCurrentSelectionImage = async (params: {
    uploadUrl: string;
    apiKey: string;
    apiKeyHeaderName?: string;
    fileFieldName?: string;
}) => {
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

        // 1) 复制当前选区内容（可见合成）到剪贴板
        await photoshop.action.batchPlay(
            [
                {
                    _obj: "copyMerged",
                },
            ],
            { synchronousExecution: true },
        );

        // 2) 创建临时文档并粘贴
        const tempDoc = await photoshop.app.createDocument({
            width,
            height,
            resolution: 72,
            mode: photoshop.constants.NewDocumentMode.RGB,
            fill: photoshop.constants.DocumentFill.TRANSPARENT,
            name: "_uxp_temp_selection_",
        } as any);

        if (!tempDoc) {
            throw new Error("Failed to create temporary document");
        }

        try {
            await photoshop.action.batchPlay(
                [
                    {
                        _obj: "paste",
                    },
                ],
                { synchronousExecution: true },
            );

            // 3) 导出为 PNG 到临时目录
            const tmpFolder = await uxp.storage.localFileSystem.getTemporaryFolder();
            const file = await tmpFolder.createEntry("selection.png", { overwrite: true });

            await tempDoc.saveAs.png(file as any, {
                compression: 6,
                interlaced: false,
            } as any);

            const bin = await (file as any).read({ format: uxp.storage.formats.binary });

            const apiKeyHeaderName = params.apiKeyHeaderName || "apikey";
            const fileFieldName = params.fileFieldName || "file";

            const blob = new Blob([bin], { type: "image/png" });
            const form = new FormData();
            form.append(fileFieldName, blob, "selection.png");

            const res = await axios.post(params.uploadUrl, form, {
                headers: {
                    [apiKeyHeaderName]: params.apiKey,
                },
            });

            const data = res.data;
            if (typeof data === "string") return data;
            if (data && typeof data === "object") {
                if (typeof (data as any).url === "string") return (data as any).url;
                if (typeof (data as any).data?.url === "string") return (data as any).data.url;
                if (typeof (data as any).result?.url === "string") return (data as any).result.url;
            }
            throw new Error("Upload succeeded but no url field found in response");
        } finally {
            // 4) 关闭临时文档
            await tempDoc.closeWithoutSaving();
        }
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
