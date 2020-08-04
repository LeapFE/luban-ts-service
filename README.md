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

// generate interface and service function
lts gen
```

## config file
根目录下的 *lts.config.js* 会被 `lts gen` 命令在运行时加载，可以导出一个对象或者一个数组：
```javascript
module.exports = { }
// or
module.exports = [];
```
对象或数组的项应满足下面的 `Config` 类型：

```typescript
type Config = {
  // 项目地址
  server: string;
  // 项目token
  token: string;
  // 输出目录
  output: string;
  // 获取哪些分类；undefined或者空数组表示获取该项目的所有分类
  categories?: string[];
  // 每个分类对应的生成文件名
  categoriesFileName?: string[];
  // 只输出 interface TODO
  onlyInterface?: boolean;
  // 创建请求实例时的名字
  requestInstanceName?: string;
  // 服务环境变量名称，将作为创建请求实例时的 `baseURL`
  serverEnvName?: string;
};
```
