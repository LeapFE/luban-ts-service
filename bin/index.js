"use strict";

const semver = require("semver");
const requiredVersion = require("../package.json").engines.node;

if (!semver.satisfies(process.version, requiredVersion)) {
  error(
    `You are using Node ${process.version}, but luban-ts-service ` +
      `requires Node ${requiredVersion}.\nPlease upgrade your Node version.`,
  );
  process.exit(1);
}

require("./../lib/cli");
