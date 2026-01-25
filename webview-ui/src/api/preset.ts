import { req } from "./req";

export type PresetInfo = {
  id: number;
  name: string;
  description: string;
  prompt: string;
  user_id: number;
  lib_id: number;
};

type PresetListData = {
  total: number;
  list: PresetInfo[];
};

export const getPresetListByUser = async () => {
  return await req.get<PresetListData>("/app/list");
};

export type PresetUpsertByUserReq = {
  name?: string;
  description?: string;
  prompt?: string;
};

export type PresetUpdateByUserReq = {
  id: number;
  name?: string;
  description?: string;
  prompt?: string;
};

type CreatePresetData = {
  id: number;
};

export const createPresetByUser = async (payload: PresetUpsertByUserReq) => {
  return await req.post<CreatePresetData>("/app/create", payload);
};

export const updatePresetByUser = async (payload: PresetUpdateByUserReq) => {
  return await req.post<null>("/app/update", payload);
};

export type DeletePresetReq = {
  id: number;
};

export const deletePresetByUser = async (id: number) => {
  const payload: DeletePresetReq = { id };
  return await req.post<null>("/app/delete", payload);
};
