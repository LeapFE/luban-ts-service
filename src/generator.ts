import fs from "fs-extra";
import path from "path";
import { error, Spinner, log, info } from "@luban-cli/cli-shared-utils";
import chalk from "chalk";
import NodeFetch from "node-fetch";
import { stringify } from "qs";
import dedent from "dedent";
import { JSONSchema4 } from "json-schema";
import JSON5 from "json5";
import { prompt } from "inquirer";

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
  MultiOutputFileTreeMap,
  renderServiceFuncReturn,
} from "./types";
import { defaultConfig, validateConfig } from "./options";
import {
  jsonSchemaToType,
  propDefinitionsToJsonSchema,
  jsonSchemaStringToJsonSchema,
  jsonToJsonSchema,
  mockjsTemplateToJsonSchema,
  prettierContent,
  getServiceFunctionName,
  interfaceHasReqQueryOrBody,
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
    const existOutPutDirList = this.config
      .filter((config) => fs.pathExistsSync(config.output))
      .map((config) => config.output);

    if (existOutPutDirList.length > 0) {
      const { action } = await prompt([
        {
          name: "action",
          type: "list",
          message: `output dir ${chalk.cyan(
            existOutPutDirList.join(", "),
          )} already exists. Pick an action:`,
          choices: [
            { name: "Merge", value: "merge" },
            { name: "Overwrite", value: "overwrite" },
            { name: "Cancel", value: false },
          ],
        },
      ]);

      if (!action) {
        return;
      } else if (action === "overwrite") {
        log(`\nRemoving ${chalk.cyan(existOutPutDirList.join(", "))}...`);
        await Promise.all(existOutPutDirList.map(async (dir) => await fs.remove(dir)));
      }
    }

    const spinner = new Spinner();

    log();
    spinner.logWithSpinner("🏗", "Generating code...\n");
    const outputFileTree = await this.generate();
    spinner.stopSpinner();

    spinner.logWithSpinner("✍️", "writing...");
    await this.write(outputFileTree);
    spinner.stopSpinner();

    log();

    info("😄 generate successfully");
  }

  private write(multiOutputFileTreeMap: MultiOutputFileTreeMap): Promise<void[]> {
    return Promise.all(
      Array.from(multiOutputFileTreeMap)
        .reverse()
        .map(async (singleTree, index) => {
          const [, tree] = singleTree;

          const config = this.config.find((_, index) => index === tree._index);
          if (!config) {
            return;
          }

          const { output, onlyInterface } = config;

          const treeMap = new Map(Object.entries(tree));

          const configRequestInstanceName = config.requestInstanceName;
          const defaultRequestInstanceName = `request_${index}`;
          const requestInstanceName = configRequestInstanceName || defaultRequestInstanceName;

          await Promise.all(
            Array.from(treeMap).map(async (treeItem) => {
              const [dir, files] = treeItem;

              const notGenInterface =
                (onlyInterface && dir === defaultRequestInstanceName) ||
                (onlyInterface && dir === "api");

              if (notGenInterface) {
                return;
              }

              if (
                dir === configRequestInstanceName &&
                typeof files === "object" &&
                typeof files !== "number" &&
                typeof files.content === "string"
              ) {
                if (!fs.pathExistsSync(`${this.context}/${output}/${dir}.ts`)) {
                  await fs.outputFile(
                    `${this.context}/${output}/${dir}.ts`,
                    prettierContent(files.content),
                  );
                }
              }

              const importInstance =
                config.renderImportInstance && config.renderImportInstance(requestInstanceName);

              const importInstanceStatement =
                importInstance ||
                `import { ${requestInstanceName} } from "../${requestInstanceName}"`;

              if (dir === "api" || dir === "interface") {
                const fileList = Object.entries(files);
                await Promise.all(
                  fileList.map(async (file) => {
                    const [filename, content] = file;
                    const _name = filename.replace(/\b(\w)(\w*)/, (_, $1, $2) => {
                      return $1.toUpperCase() + $2;
                    });

                    const importContent = dedent`
                    import { stringify } from "qs";
                    import { AxiosRequestConfig } from "axios";

                    ${importInstanceStatement};

                    import * as ${_name} from "../interface/${filename}";
                    \n
                  `;

                    const _content = Array.isArray(content.content)
                      ? content.content.join("\n")
                      : content.content;

                    const finalContent = `${dedent`
                    /* eslint-disable */

                    /* This file generated by luban-ts-service, do not modify it!!! */

                    /* prettier-ignore-start */
                    // @ts-ignore
                    ${dir === "api" ? importContent + "\n" + _content : _content}
                    /* prettier-ignore-end */
                  `}\n`;

                    if (_content.trim()) {
                      await fs.outputFile(
                        `${this.context}/${output}/${dir}/${filename}.ts`,
                        prettierContent(finalContent),
                      );
                    }
                  }),
                );
              }
            }),
          );
        }),
    );
  }

  private async generate(): Promise<MultiOutputFileTreeMap> {
    const outputFileTree: MultiOutputFileTree = {};

    const configPromiseList = this.config.map(async (configItem, order) => {
      const server = configItem.server.replace(/\/+$/, "");
      const token = configItem.token;
      const requestInstanceName = configItem.requestInstanceName || `request_${order}`;
      const requestInstanceServerEnvName =
        configItem.serverEnvName ||
        `request_server_url${configItem.output
          .replace(/^([^/])/, "/$1")
          .replace(/(\/)\b(\w)(\w*)/g, (_, __, $2, $3) => {
            return "_" + $2.toLowerCase() + $3.toLowerCase();
          })}`;

      const projectData = await this.getProjectData(server, token);

      const projectId = projectData._id.toString();
      const projectBasePath = projectData.basepath;

      outputFileTree[projectId] = {
        _output: configItem.output,
        _index: order,
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

      const requestInstanceCode = await this.generateRequestInstanceCode(
        requestInstanceName,
        requestInstanceServerEnvName,
      );
      outputFileTree[projectId][requestInstanceName] = {
        content: requestInstanceCode,
      };

      await Promise.all(
        filteredCategoryList.map(async (category, i) => {
          let isCurrentCategoryFileNameSameAsPrevious = false;

          if (Array.isArray(configItem.categoriesFileName)) {
            if (i > 0) {
              isCurrentCategoryFileNameSameAsPrevious =
                configItem.categoriesFileName[i] === configItem.categoriesFileName[i - 1];
            }
          }

          let categoryFileName = `category_${i}`;

          if (Array.isArray(configItem.categoriesFileName)) {
            if (isCurrentCategoryFileNameSameAsPrevious) {
              categoryFileName = configItem.categoriesFileName[i - 1] || `category_${i}`;
            } else {
              categoryFileName = configItem.categoriesFileName[i] || `category_${i}`;
            }
          }

          const interfaceList = await this.getInterfaceList(server, token, category._id);

          if (interfaceList.list.length === 0) {
            info(`There is no interface to generate [${category.name}]`);
            return;
          }

          const codeList = await Promise.all(
            interfaceList.list.map(async (inter) => {
              const interfaceData = await this.getInterfaceData(server, token, inter._id);

              const interfaceCode = await this.generateInterfaceCode(
                category.name,
                interfaceData,
                projectBasePath,
                server,
                configItem.filterServiceFunc,
              );
              const serviceFunctions = await this.generateServiceFunction(
                category.name,
                requestInstanceName,
                interfaceData,
                categoryFileName,
                projectBasePath,
                projectBasePath,
                server,
                configItem.renderServiceFuncReturn,
                configItem.filterServiceFunc,
              );

              return { interfaceCode, serviceFunctions };
            }),
          );

          let currentApiCategoryFile = outputFileTree[projectId].api[categoryFileName];
          let currentInterfaceCategoryFile = outputFileTree[projectId].interface[categoryFileName];

          const _apiContent =
            currentApiCategoryFile && Array.isArray(currentApiCategoryFile.content)
              ? currentApiCategoryFile.content.concat(codeList.map((c) => c.serviceFunctions))
              : codeList.map((c) => c.serviceFunctions);

          const _interfaceContent =
            currentInterfaceCategoryFile && Array.isArray(currentInterfaceCategoryFile.content)
              ? currentInterfaceCategoryFile.content.concat(codeList.map((c) => c.interfaceCode))
              : codeList.map((c) => c.interfaceCode);

          currentApiCategoryFile = {
            content: _apiContent,
          };
          currentInterfaceCategoryFile = {
            content: _interfaceContent,
          };

          outputFileTree[projectId].api[categoryFileName] = currentApiCategoryFile;
          outputFileTree[projectId].interface[categoryFileName] = currentInterfaceCategoryFile;
        }),
      );
    });

    await Promise.all(configPromiseList);

    return new Map(Object.entries(outputFileTree));
  }

  private async generateServiceFunction(
    categoryName: string,
    requestInstanceName: string,
    interfaceData: YapiInterface,
    fileName: string,
    projectBasePath: string,
    basepath: string,
    serverHost: string,
    renderServiceFuncReturn?: renderServiceFuncReturn,
    filterServiceFunc: (path: string) => boolean = () => true,
  ): Promise<string> {
    if (interfaceData.path === "/" || !filterServiceFunc(`${basepath}${interfaceData.path}`)) {
      return Promise.resolve("");
    }

    const requestMethod = interfaceData.method;
    const functionName = getServiceFunctionName(interfaceData);

    const _name = fileName.replace(/\b(\w)(\w*)/, (_, $1, $2) => {
      return $1.toUpperCase() + $2;
    });
    const queryTypeName = _name + "." + functionName + "Query";
    const dataTypeName = _name + "." + functionName + "Data";

    const hasReqOrBody = interfaceHasReqQueryOrBody(interfaceData);

    const fullPath = `${projectBasePath}${interfaceData.path}`;

    const query = "${stringify(params)}";
    const queryPath =
      requestMethod === Method.GET
        ? hasReqOrBody
          ? `${fullPath}?${query}`
          : `${fullPath}`
        : `${fullPath}`;

    const parameterName = "params";
    const parameter = hasReqOrBody ? `${parameterName}: ${queryTypeName}` : "";
    const finalParameter = parameter
      ? `${parameter}, config?: AxiosRequestConfig`
      : "config?: AxiosRequestConfig";

    const methodParameters =
      requestMethod !== Method.GET && hasReqOrBody
        ? interfaceData.req_body_type === RequestBodyType.form
          ? `\`${queryPath}\`, null, { data: ${parameterName}, headers: { "Content-Type": "application/x-www-form-urlencoded" }, ...config }`
          : `\`${queryPath}\`, null, { data: ${parameterName}, ...config }`
        : requestMethod === Method.GET ||
          requestMethod === Method.DELETE ||
          requestMethod === Method.HEAD ||
          requestMethod === Method.OPTIONS
        ? `\`${queryPath}\`, config`
        : `\`${queryPath}\`, null, config`;

    const updatedTime = new Date(interfaceData.up_time * 1000).toString();
    const createdTime = new Date(interfaceData.add_time * 1000).toString();
    const tagList = interfaceData.tag.join(" ");

    const defaultCallee = `${requestInstanceName}.${requestMethod.toLowerCase()}<${dataTypeName}>(${methodParameters})`;

    const callee =
      typeof renderServiceFuncReturn === "function"
        ? renderServiceFuncReturn(fullPath, requestMethod.toLowerCase(), dataTypeName)
        : defaultCallee;

    const link = `${serverHost}/project/${interfaceData.project_id}/interface/api/${interfaceData._id}`;

    const singleServiceFunction = dedent`
      /**
       * @description ${interfaceData.title}
       * @category ${categoryName}
       * @method ${requestMethod}
       * @status ${interfaceData.status}
       * @updated ${updatedTime}
       * @created ${createdTime}
       * @tag ${tagList}
       * @see ${link}
       */
      export function ${functionName}(${finalParameter}) {
        return ${callee};
      }
      \n
    `;
    return Promise.resolve(singleServiceFunction);
  }

  private async generateInterfaceCode(
    categoryName: string,
    interfaceData: YapiInterface,
    basepath: string,
    serverHost: string,
    filterServiceFunc: (path: string) => boolean = () => true,
  ): Promise<string> {
    if (interfaceData.path === "/" || !filterServiceFunc(`${basepath}${interfaceData.path}`)) {
      return Promise.resolve("");
    }

    const functionName = getServiceFunctionName(interfaceData);
    const queryTypeName = functionName + "Query";
    const dataTypeName = functionName + "Data";
    const requestDataType = await this.generateRequestDataType(interfaceData, queryTypeName);
    const responseDataType = await this.generateResponseDataType(interfaceData, dataTypeName);

    const link = `${serverHost}/project/${interfaceData.project_id}/interface/api/${interfaceData._id}`;

    const queryType = dedent`
      /**
       * ${interfaceData.title}
       * @kind parameters
       * @category ${categoryName}
       * @see ${link}
       */
      ${requestDataType};
      /**
       * ${interfaceData.title}
       * @kind response
       * @category ${categoryName}
       * @see ${link}
       */
      ${responseDataType};
      \n
    `;
    return Promise.resolve(queryType);
  }

  private async generateRequestInstanceCode(
    instanceName: string,
    serverEnvName: string,
  ): Promise<string> {
    const requestInstanceCode = dedent`
      import axios from "axios";

      import { ${serverEnvName} } from "@/environments/env";

      const ${instanceName} = axios.create({ baseURL: ${serverEnvName} });

      export { ${instanceName} };
    `;
    return Promise.resolve(requestInstanceCode);
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

  private async generateRequestDataType(
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
                : // TODO catch json parse error
                  jsonToJsonSchema(JSON5.parse(interfaceInfo.req_body_other));
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

  private async generateResponseDataType(
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
            : // // TODO catch json parse error
              mockjsTemplateToJsonSchema(JSON5.parse(interfaceInfo.res_body));
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
