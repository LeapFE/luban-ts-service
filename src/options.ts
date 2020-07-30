import { createSchema, validate } from "@luban-cli/cli-shared-utils";
import { Config } from "./types";

const ConfigSchema = createSchema((joi) =>
  joi.object<Config>({
    server: joi.string().required(),
    token: joi.string().required(),
    output: joi.string().required(),
    categories: joi.array(),
    categoriesFileName: joi.array(),
    onlyExtraData: joi.bool(),
    dataKey: joi.string(),
    onlyInterface: joi.bool(),
    requestInstanceName: joi.string(),
  }),
);

export function validateConfig(config: any, cb?: (msg?: string) => void): void {
  validate(config, ConfigSchema, { allowUnknown: true }, cb);
}

export const defaultConfig: Config = {
  _index: 0,
  server: "",
  token: "",
  output: "",
  onlyExtraData: false,
  onlyInterface: false,
  dataKey: "",
  categories: [],
  categoriesFileName: [],
  requestInstanceName: "request",
};
