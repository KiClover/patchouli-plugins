import { reqOf } from "./req";

export type LibPresetInfo = {
  id: number;
  name: string;
  description: string;
  prompt: string;
  user_id: number;
  state: boolean;
  tags: string[];
};

export type GetLibPresetListReq = {
  user_id?: number;
  page?: number;
  page_size?: number;
  name?: string;
  state?: boolean;
  tags?: string[];
};

export type GetLibPresetListResp = {
  total: number;
  list: LibPresetInfo[];
};

export const getCommunityPresetList = async (payload: GetLibPresetListReq) => {
  return await reqOf("library").post<GetLibPresetListResp>("/app/list", payload);
};

export type AddLibPresetReq = {
  lib_id: number;
};

export const addCommunityPresetToMine = async (libId: number) => {
  const payload: AddLibPresetReq = { lib_id: libId };
  return await reqOf("library").post<null>("/app/add", payload);
};
