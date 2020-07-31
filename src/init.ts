import fs from "fs-extra";
import { prompt } from "inquirer";
import path from "path";
import chalk from "chalk";
import dedent from "dedent";
import { info, log } from "@luban-cli/cli-shared-utils";

async function init() {
  const cwd = process.cwd();
  const configFile = path.resolve(cwd, "lts.config.js");

  if (fs.existsSync(configFile)) {
    const { action } = await prompt([
      {
        name: "action",
        type: "list",
        message: `config file ${chalk.cyan(configFile)} already exists. Pick an action:`,
        choices: [
          { name: "Overwrite", value: "overwrite" },
          { name: "Cancel", value: false },
        ],
      },
    ]);

    if (!action) {
      return;
    } else if (action === "overwrite") {
      log(`\nRemoving ${chalk.cyan(configFile)}...`);
      await fs.remove(configFile);
      log();
    }
  }

  await fs.outputFile(
    configFile,
    dedent`
      module.exports = {
        server: "",
        token: "",
        output: "src/service",
        // onlyExtraData: true,
        // dataKey: "data",
        // categories?: [],
        // onlyInterface?: boolean,
        // categoriesFileName: [],
        // requestInstanceName: "request",
      };\n
    `,
  );

  info("init successfully");
}

export { init };
