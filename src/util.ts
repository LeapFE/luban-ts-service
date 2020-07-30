import { JSONSchema4 } from "json-schema";
import { isEmpty, random, isObject, isArray, forOwn, castArray } from "vtils";
import { compile, Options } from "json-schema-to-typescript";
import jsonSchemaGenerator from "json-schema-generator";
import Mock from "mockjs";

import { PropDefinitions } from "./types";

class FileData<T = any> {
  private originalFileData: T;

  public constructor(originalFileData: T) {
    this.originalFileData = originalFileData;
  }

  public getOriginalFileData(): T {
    return this.originalFileData;
  }
}

const JSTTOptions: Partial<Options> = {
  bannerComment: "",
  style: {
    bracketSpacing: false,
    printWidth: 100,
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
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
          ...(prop.type === ("file" as any) ? { tsType: FileData.name } : {}),
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
