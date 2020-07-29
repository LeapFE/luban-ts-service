import { Command } from "commander";
import dedent from "dedent";

import { init } from "./init";

const program = new Command();

// eslint-disable-next-line import/no-commonjs
program.version(`luban-ts-service ${require("../package.json").version}`).usage("<command>");

program
  .command("init")
  .description("generate config file")
  .action(() => {
    init();
  });

program
  .command("gen")
  .description("generate config file")
  .action(() => {
    console.log("generate");
  });

program.on("--help", () => {
  console.log();
  console.log(
    `\n${dedent`
      # Usage
        Initial config file: lts init
        generate code: lts
        check version: lts version
        help: lts help

      # GitHub
        https://github.com/LeapFE/luban-ts-service#readme
    `}\n`,
  );
});

program.parse(process.argv);
