import { req } from "./req";

export type AppItem = {
  id: number;
  name: string;
  description: string;
  prompt: string;
  user_id: number;
  lib_id: number;
};

type AppListData = {
  total: number;
  list: AppItem[];
};

export const getAppList = async () => {
  return await req.get<AppListData>("/app/list");
};
