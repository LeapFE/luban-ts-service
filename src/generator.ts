import fs from "fs-extra";
import path from "path";
import { error, Spinner, log, info } from "@luban-cli/cli-shared-utils";
import chalk from "chalk";
import NodeFetch from "node-fetch";
import { stringify } from "qs";
import dedent from "dedent";
import { JSONSchema4 } from "json-schema";
import JSON5 from "json5";

import {
  Config,
  YapiResponse,
  YapiProject,
  YapiCategoryItem,
  YapiInterface,
  YapiInterfaceData,
  MultiOutputFileTree,
  Method,
  PropDefinition,
  Required,
  RequestBodyType,
  RequestFormItemType,
  ResponseBodyType,
} from "./types";
import { defaultConfig, validateConfig } from "./options";
import {
  jsonSchemaToType,
  propDefinitionsToJsonSchema,
  jsonSchemaStringToJsonSchema,
  jsonToJsonSchema,
  mockjsTemplateToJsonSchema,
} from "./util";

class Generator {
  private context: string;
  private configFileName: string;
  private config: Config[];

  constructor() {
    this.context = process.cwd();
    this.configFileName = "lts.config.js";

    this.config = this.resolveConfig();
  }

  public async init(): Promise<void> {
    const spinner = new Spinner();

    log();
    spinner.logWithSpinner("🏗", "Generating code...\n");
    const outputFileTree = await this.generate();
    spinner.stopSpinner();

    log();

    spinner.logWithSpinner("✍️", "writing...");
    await this.write(outputFileTree);
    spinner.stopSpinner();

    log();

    info("😄 generate successfully");
  }

  private write(multiOutputFileTree: MultiOutputFileTree): void {
    console.log(multiOutputFileTree);
    // debugger;
    console.log(this.config);

    // TODO write code to file
    // return Promise.all(Object.keys(multiOutputFileTree).map((pid) => {

    // }));
  }

  private async generate(): Promise<MultiOutputFileTree> {
    const outputFileTree: MultiOutputFileTree = {};

    const configPromiseList = this.config.map(async (configItem, order) => {
      const server = configItem.server.replace(/\/+$/, "");
      const token = configItem.token;
      const requestInstanceName = configItem.requestInstanceName || `request_${order}`;

      const projectData = await this.getProjectData(server, token);

      const projectId = projectData._id;

      outputFileTree[projectId] = {
        index: order,
        api: {},
        interface: {},
        [requestInstanceName]: {},
      };

      const categoryList = await this.getCategoryList(server, token, projectData._id);

      const filteredCategoryList = Array.isArray(configItem.categories)
        ? categoryList.filter((c) => configItem.categories?.includes(c.name))
        : categoryList;

      if (filteredCategoryList.length === 0) {
        info("There is no category to generate");
        return;
      }

      const requestInstanceCode = await this.generateRequestInstanceCode(requestInstanceName);
      outputFileTree[projectId][requestInstanceName] = {
        content: requestInstanceCode,
      };

      await Promise.all(
        filteredCategoryList.map(async (c, i) => {
          const categoryFileName = Array.isArray(configItem.categoriesFileName)
            ? configItem.categoriesFileName[i]
            : `category_${i}`;

          const interfaceList = await this.getInterfaceList(server, token, c._id);

          if (interfaceList.list.length === 0) {
            info(`There is no interface to generate [${c.name}]`);
            return;
          }

          const codeList = await Promise.all(
            interfaceList.list.map(async (inter) => {
              const interfaceData = await this.getInterfaceData(server, token, inter._id);

              const interfaceCode = await this.generateInterfaceCode(c.name, interfaceData);
              const serviceFunctions = await this.generateServiceFunctions(
                c.name,
                requestInstanceName,
                interfaceData,
              );

              return { interfaceCode, serviceFunctions };
            }),
          );

          outputFileTree[projectData._id].api[categoryFileName] = {
            content: codeList.map((c) => c.serviceFunctions),
          };
          outputFileTree[projectData._id].interface[categoryFileName] = {
            content: codeList.map((c) => c.interfaceCode),
          };
        }),
      );
    });

    await Promise.all(configPromiseList);

    return outputFileTree;
  }

  private async generateServiceFunctions(
    categoryName: string,
    requestInstanceName: string,
    interfaceData: YapiInterface,
  ): Promise<string> {
    const requestMethod = interfaceData.method.toLowerCase();
    const functionName =
      requestMethod +
      interfaceData.path.replace(/(\/)\b(\w)(\w*)/g, (_, __, $2, $3) => {
        return $2.toUpperCase() + $3.toLowerCase();
      });
    const queryTypeName = functionName + "Query";
    const dataTypeName = functionName + "Data";

    const str = "${stringify(params)}";
    const queryPath =
      requestMethod === "get" ? `${interfaceData.path}?${str}` : `${interfaceData.path}`;

    const singleServiceFunction = dedent`
      /**
       * ${interfaceData.title}
       * @description ${interfaceData.desc}
       * @category ${categoryName}
       * @method ${requestMethod}
       */
      export function ${functionName}(params: ${queryTypeName}) {
        return ${requestInstanceName}.${requestMethod}<ResponseData<${dataTypeName}>>("${queryPath}");
      }
    `;
    return Promise.resolve(singleServiceFunction);
  }

  private async generateInterfaceCode(
    categoryName: string,
    interfaceData: YapiInterface,
  ): Promise<string> {
    const requestMethod = interfaceData.method.toLowerCase();
    const functionName =
      requestMethod +
      interfaceData.path.replace(/(\/)\b(\w)(\w*)/g, (_, __, $2, $3) => {
        return $2.toUpperCase() + $3.toLowerCase();
      });
    const queryTypeName = functionName + "Query";
    const dataTypeName = functionName + "Data";
    const queryType = dedent`
      /**
       * ${interfaceData.title}
       * @description ${interfaceData.desc}
       * @category ${categoryName}
       */
      export type ${queryTypeName} = ${Generator.generateRequestDataType(
      interfaceData,
      queryTypeName,
    )};
      export type ${dataTypeName} = ${Generator.generateResponseDataType(
      interfaceData,
      dataTypeName,
    )};
    `;
    return Promise.resolve(queryType);
  }

  private async generateRequestInstanceCode(instanceName: string): Promise<string> {
    // TODO generate `create request instance` code
    return Promise.resolve(`${instanceName}`);
  }

  private resolveConfig(): Config[] {
    let config: Config[] = [defaultConfig];
    const filePath = path.resolve(this.context, this.configFileName);

    if (!fs.pathExistsSync(filePath)) {
      error(`specified config file ${chalk.bold(`${filePath}`)} nonexistent, please check it.`);
      process.exit();
    }

    try {
      config = require(filePath);
      if (!config || typeof config !== "object") {
        error(`Error load ${chalk.bold(`${this.configFileName}`)}: should export an object. \n`);
        config = [defaultConfig];
      }
      // eslint-disable-next-line no-empty
    } catch (e) {}

    if (Array.isArray(config)) {
      config.forEach((c, i) => {
        validateConfig(c, (msg) => {
          error(`Invalid options in ${chalk.bold(this.configFileName)}: ${msg}[${i}]`);
        });
      });
    } else {
      validateConfig(config, (msg) => {
        error(`Invalid options in ${chalk.bold(this.configFileName)}: ${msg}`);
      });
    }

    return (Array.isArray(config) ? config : [config]).map((c, i) => ({ ...c, _index: i }));
  }

  private async getProjectData(serverUrl: string, token: string): Promise<YapiProject> {
    const res = await this.request<YapiProject>(`${serverUrl}/api/project/get`, { token });
    return res.data;
  }

  private async getCategoryList(
    serverUrl: string,
    token: string,
    project_id: number,
  ): Promise<YapiCategoryItem[]> {
    const res = await this.request<YapiCategoryItem[]>(`${serverUrl}/api/interface/getCatMenu`, {
      token,
      project_id,
    });
    return res.data;
  }

  private async getInterfaceList(
    serverUrl: string,
    token: string,
    catid: number,
  ): Promise<YapiInterfaceData> {
    const res = await this.request<YapiInterfaceData>(`${serverUrl}/api/interface/list_cat`, {
      catid,
      token,
      limit: 999,
    });
    return res.data;
  }

  private async getInterfaceData(
    serverUrl: string,
    token: string,
    interface_id: number,
  ): Promise<YapiInterface> {
    const res = await this.request<YapiInterface>(`${serverUrl}/api/interface/get`, {
      id: interface_id,
      token,
    });
    return res.data;
  }

  private async request<T>(
    url: string,
    params: Record<string, string | number>,
  ): Promise<YapiResponse<T>> {
    let res: YapiResponse<T> = { errcode: 0, errmsg: "", data: {} as T };

    try {
      const response = await NodeFetch(`${url}?${stringify(params)}`, { method: "GET" });
      res = await response.json();
    } catch (err) {
      error(err);
    }

    return res;
  }

  static async generateRequestDataType(
    interfaceInfo: YapiInterface,
    typeName: string,
  ): Promise<string> {
    let jsonSchema!: JSONSchema4;

    switch (interfaceInfo.method) {
      case Method.GET:
      case Method.HEAD:
      case Method.OPTIONS:
        jsonSchema = propDefinitionsToJsonSchema(
          interfaceInfo.req_query.map<PropDefinition>((item) => ({
            name: item.name,
            required: item.required === Required.true,
            type: "string",
            comment: item.desc,
          })),
        );
        break;
      default:
        switch (interfaceInfo.req_body_type) {
          case RequestBodyType.form:
            jsonSchema = propDefinitionsToJsonSchema(
              interfaceInfo.req_body_form.map<PropDefinition>((item) => ({
                name: item.name,
                required: item.required === Required.true,
                type: (item.type === RequestFormItemType.file ? "file" : "string") as any,
                comment: item.desc,
              })),
            );
            break;
          case RequestBodyType.json:
            if (interfaceInfo.req_body_other) {
              jsonSchema = interfaceInfo.req_body_is_json_schema
                ? jsonSchemaStringToJsonSchema(interfaceInfo.req_body_other)
                : jsonToJsonSchema(JSON5.parse(interfaceInfo.req_body_other));
            }
            break;
          default:
            /* istanbul ignore next */
            break;
        }
        break;
    }

    if (Array.isArray(interfaceInfo.req_params) && interfaceInfo.req_params.length) {
      const paramsJsonSchema = propDefinitionsToJsonSchema(
        interfaceInfo.req_params.map<PropDefinition>((item) => ({
          name: item.name,
          required: true,
          type: "string",
          comment: item.desc,
        })),
      );
      /* istanbul ignore else */
      if (jsonSchema) {
        jsonSchema.properties = {
          ...jsonSchema.properties,
          ...paramsJsonSchema.properties,
        };
        jsonSchema.required = [
          ...(jsonSchema.required || []),
          ...(paramsJsonSchema.required || []),
        ];
      } else {
        jsonSchema = paramsJsonSchema;
      }
    }

    return jsonSchemaToType(jsonSchema, typeName);
  }

  static async generateResponseDataType(
    interfaceInfo: YapiInterface,
    typeName: string,
    dataKey?: string,
  ): Promise<string> {
    let jsonSchema: JSONSchema4 = {};

    switch (interfaceInfo.res_body_type) {
      case ResponseBodyType.json:
        if (interfaceInfo.res_body) {
          jsonSchema = interfaceInfo.res_body_is_json_schema
            ? jsonSchemaStringToJsonSchema(interfaceInfo.res_body)
            : mockjsTemplateToJsonSchema(JSON5.parse(interfaceInfo.res_body));
        }
        break;
      default:
        return `export type ${typeName} = any`;
    }

    /* istanbul ignore if */
    if (dataKey && jsonSchema && jsonSchema.properties && jsonSchema.properties[dataKey]) {
      jsonSchema = jsonSchema.properties[dataKey];
    }

    return jsonSchemaToType(jsonSchema, typeName);
  }
}

export { Generator };
