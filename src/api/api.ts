import * as photoshop from "./photoshop"; 
import { uxp } from "../globals";
import * as uxpLib from "./uxp";

const hostName =
  uxp?.host?.name.toLowerCase().replace(/\s/g, "") || ("" as string);

// prettier-ignore
let host = {} as Partial<typeof photoshop>

export type API = typeof uxpLib & Partial<typeof photoshop>;

if (hostName.startsWith("photoshop")) host = photoshop; 

export const api: API = { ...uxpLib, ...host };
