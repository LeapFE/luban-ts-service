import { createSchema, validate } from "@luban-cli/cli-shared-utils";
import { Config } from "./types";
import { Options as PrettierOptions } from "prettier";

const ConfigSchema = createSchema((joi) =>
  joi.object<Config>({
    server: joi.string().required(),
    token: joi.string().required(),
    output: joi.string().required(),
    categories: joi.array(),
    categoriesFileName: joi.array(),
    onlyInterface: joi.bool(),
    requestInstanceName: joi.string(),
    serverEnvName: joi.string(),
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
  onlyInterface: false,
  categories: [],
  categoriesFileName: [],
  requestInstanceName: "request",
  serverEnvName: "",
};

export const defaultPrettierConfig: PrettierOptions = {
  parser: "typescript",
  trailingComma: "all",
  printWidth: 100,
  arrowParens: "always",
  jsxBracketSameLine: false,
  endOfLine: "lf",
  proseWrap: "always",
};
