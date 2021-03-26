import { JSONSchema4 } from "json-schema";
import { isEmpty, random, isObject, isArray, forOwn, castArray } from "vtils";
import { compile, Options } from "json-schema-to-typescript";
import jsonSchemaGenerator from "json-schema-generator";
import Mock from "mockjs";
import prettier from "prettier";

import { PropDefinitions, YapiInterface, Method, RequestBodyType } from "./types";
import { defaultPrettierConfig } from "./options";

const JSTTOptions: Partial<Options> = {
  bannerComment: "",
  style: defaultPrettierConfig,
};

export async function jsonSchemaToType(jsonSchema: JSONSchema4, typeName: string): Promise<string> {
  if (isEmpty(jsonSchema)) {
    return `export interface ${typeName} {}`;
  }
  const fakeTypeName = `FAKE${random()}`.toUpperCase();
  const code = await compile(jsonSchema, fakeTypeName, JSTTOptions);
  return code.replace(fakeTypeName, typeName).trim();
}

export function processJsonSchema<T extends JSONSchema4>(jsonSchema: T): T {
  if (!isObject(jsonSchema)) return jsonSchema;

  delete jsonSchema.title;
  delete jsonSchema.id;

  delete jsonSchema.minItems;
  delete jsonSchema.maxItems;

  jsonSchema.additionalProperties = false;

  if (isArray(jsonSchema.properties)) {
    jsonSchema.properties = (jsonSchema.properties as JSONSchema4[]).reduce<
      Exclude<JSONSchema4["properties"], undefined>
    >((props, js) => {
      props[js.name] = js;
      return props;
    }, {});
  }

  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, (_, prop) => {
      const propDef = jsonSchema.properties![prop];
      delete jsonSchema.properties![prop];
      jsonSchema.properties![(prop as string).trim()] = propDef;
    });
    jsonSchema.required = jsonSchema.required && jsonSchema.required.map((prop) => prop.trim());
  }

  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, processJsonSchema);
  }

  if (jsonSchema.items) {
    castArray(jsonSchema.items).forEach(processJsonSchema);
  }

  return jsonSchema;
}

export function propDefinitionsToJsonSchema(propDefinitions: PropDefinitions): JSONSchema4 {
  return processJsonSchema({
    type: "object",
    required: propDefinitions.reduce<string[]>((res, prop) => {
      if (prop.required) {
        res.push(prop.name);
      }
      return res;
    }, []),
    properties: propDefinitions.reduce<Exclude<JSONSchema4["properties"], undefined>>(
      (res, prop) => {
        res[prop.name] = {
          type: prop.type,
          description: prop.comment,
          ...(prop.type === ("file" as any) ? { tsType: "File" } : {}),
        };
        return res;
      },
      {},
    ),
  });
}

export function jsonSchemaStringToJsonSchema(str: string): JSONSchema4 {
  return processJsonSchema(JSON.parse(str));
}

export function jsonToJsonSchema(json: object): JSONSchema4 {
  return processJsonSchema(jsonSchemaGenerator(json));
}

export function mockjsTemplateToJsonSchema(template: object): JSONSchema4 {
  return processJsonSchema(Mock.toJSONSchema(template) as any);
}

export function prettierContent(params: string): string {
  return prettier.format(params, defaultPrettierConfig);
}

export function cleanQueryPath(path: string): string {
  return (
    path
      // /path/user-list?{name}
      .replace(/\?(.+)/, "")
      // /path/user-list/
      .replace("-", "_")
      .replace(/\.\w+$/, "")
      // /path/user/{name}
      .replace(/(\{\w+\})/g, "")
      // eg /path//user///list
      .replace(/[(^/)](\/)+/g, "$1")
      // /path/v1.1/user/2.2/
      .replace(/[(^\w+)](\d+)[(.)][(\d+)]/g, ($1) => {
        return $1.replace(/\./g, "_");
      })
  );
}

export function getServiceFunctionName(interfaceData: YapiInterface) {
  const requestMethod = interfaceData.method.toLowerCase();
  const functionName =
    requestMethod +
    cleanQueryPath(interfaceData.path).replace(/(\/)\b(\w)(\w*)/g, (_, __, $2, $3) => {
      return $2.toUpperCase() + $3.toLowerCase();
    });

  return functionName.trim();
}

export function interfaceHasReqQueryOrBody(interfaceData: YapiInterface): boolean {
  const { method } = interfaceData;

  if (method === Method.GET) {
    return interfaceData.req_query.length > 0;
  }

  if (
    method === Method.POST ||
    method === Method.PUT ||
    method === Method.PATCH ||
    method === Method.DELETE
  ) {
    if (interfaceData.req_body_type === RequestBodyType.json) {
      if (interfaceData.req_body_other === "") {
        return false;
      }
      const req_body_other_schema = JSON.parse(interfaceData.req_body_other);
      if (typeof req_body_other_schema === "object") {
        return Object.keys(req_body_other_schema.properties).length > 0;
      }
    }

    if (interfaceData.req_body_type === RequestBodyType.form) {
      return interfaceData.req_body_form.length > 0;
    }
  }

  return false;
}
