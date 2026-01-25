import { reqOf } from "./req";

export type BaseUserInfo = {
  id: number;
  name: string;
  description: string;
  avatar: string;
};

export const getBaseUserById = async (id: number) => {
  return await reqOf("user").post<BaseUserInfo>(`/base/${id}`);
};
