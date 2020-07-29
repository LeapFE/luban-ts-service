/**
 * module.exports = { } / module.exports = [];
 * server: string;
 * token: string;  项目token
 * categories: string[] | number[];  获取哪些分类；可以是分类名称或者ID；undefined或者空数组表示获取该项目的所有分类
 * onlyExtraData: boolean;  只保留 response.data 的类型定义
 * dataKey: string;  response[dataKey] [data] 的键名
 * output: string;  service 输出目录
 * onlyInterface: boolean;  只输出 interface
 */
export type Config = {
  server: string;
  token: string;
  output: string;
  context: string;
  categories?: string[];
  onlyExtraData?: boolean;
  dataKey?: string;
  onlyInterface?: boolean;
};

export type YapiResponse<T> = {
  errcode: number;
  errmsg: string;
  data: T;
};

export type YapiProject = {
  switch_notice: boolean;
  is_mock_open: boolean;
  strice: boolean;
  is_json5: boolean;
  _id: number;
  name: string;
  basepath: string;
  project_type: string;
  uid: number;
  group_id: number;
  icon: string;
  color: string;
  add_time: number;
  up_time: number;
  env: { header: any[]; global: any[]; _id: string; name: string; domain: string }[];
  tag: { _id: string; name: string; desc: string }[];
  cat: any[];
  role: boolean;
};

export type YapiCategoryItem = {
  index: number;
  _id: number;
  name: string;
  project_id: number;
  desc: string;
  uid: number;
  add_time: number;
  up_time: number;
  __v: number;
};

export type YapiInterfaceItem = {
  edit_uid: number;
  status: string;
  api_opened: boolean;
  tag: string[];
  _id: number;
  method: string;
  catid: number;
  title: string;
  path: string;
  project_id: number;
  uid: number;
  add_time: number;
};

export type YapiInterface = {
  query_path: { path: string; params: any[] };
  edit_uid: number;
  status: string;
  type: string;
  req_body_is_json_schema: boolean;
  res_body_is_json_schema: boolean;
  api_opened: boolean;
  index: number;
  tag: any[];
  _id: number;
  method: string;
  catid: number;
  title: string;
  path: string;
  project_id: number;
  req_params: any[];
  res_body_type: string;
  req_query: any[];
  req_headers: { required: string; _id: string; name: string; value: string }[];
  req_body_form: { required: string; _id: string; name: string; type: string; desc: string }[];
  desc: string;
  markdown: string;
  req_body_type: string;
  res_body: string;
  uid: number;
  add_time: number;
  up_time: number;
  __v: number;
  req_body_other: string;
  username: string;
};
