# luban-ts-service
> generate typescript interface and service function/class on yapi doc

## Install
```shell
npm i luban-ts-service -D
```

## Usage
```shell
// generate config file
lts init

// generate interface and service functions
lts gen
```

## config file
根目录下的 *lts.config.js* 会被 `lts gen` 命令在运行时加载，可以导出一个对象或者一个数组：
```javascript
module.exports = { }
// or
module.exports = [];
```

其中， `server`、`token`、 `output` 为必填项；对象或数组的项应满足下面的 `Config` 类型：

```typescript
type Config = {
  // 项目地址
  server: string;
  // 项目token
  token: string;
  // 输出目录，默认 `src/service`
  output: string;
  // 获取哪些分类；undefined或者空数组表示获取该项目的所有分类
  categories?: string[];
  // 每个分类对应的生成文件名，指定该项时应该与上面的 `categories` 中的项一一对应
  categoriesFileName?: string[];
  // 只输出 interface
  onlyInterface?: boolean;
  // 创建请求实例时的名字，亦是创建请求实例的文件名(当再次生成时，若该文件存在，则不会覆盖)
  requestInstanceName?: string;
  // 服务环境变量名称，将作为创建请求实例时的 `baseURL`
  serverEnvName?: string;
};
```
