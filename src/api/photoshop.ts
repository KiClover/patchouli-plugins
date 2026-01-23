import { photoshop } from "../globals";

export const notify = async (message: string) => {
  await photoshop.app.showAlert(message);
};

let cachedSelectionImageBase64: string | null = null;

export const cacheCurrentSelectionImage = async () => {
  // Placeholder implementation.
  // This is where you will later export the current selection as an image.
  // Keep primitive types only for Comlink transfer.
  cachedSelectionImageBase64 = null;
  return cachedSelectionImageBase64;
};

export const getCachedSelectionImage = async () => {
  return cachedSelectionImageBase64;
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
