import { App, MarkdownView, Notice, TFile } from "obsidian";
import mexp from "math-expression-evaluator";

import { Arguments, Position } from "./types";
import {
  appendContent,
  createNote,
  prependContent,
  removeButton,
  removeSection,
} from "./handlers";
import {
  getButtonPosition,
  getInlineButtonPosition,
  findNumber,
} from "./parser";
import {
  handleValueArray,
  createContentArray,
  createArgumentObject,
} from "./utils";
import {
  getButtonSwapById,
  setButtonSwapById,
  getButtonById,
} from "./buttonStore";

export const calculate = async (
  app: App,
  { action }: Arguments,
  position: Position
): Promise<void> => {
  let equation = action;
  const variables = action.match(/\$[0-9]*/g);
  if (variables) {
    const output = variables.map(async (value) => {
      const activeView = app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        const lineNumber = parseInt(value.substring(1));
        const numbers = await findNumber(app, lineNumber);
        return { variable: value, numbers };
      } else {
        new Notice(`couldn't read file`, 2000);
      }
    });
    const resolved = await Promise.all(output);
    resolved.forEach((term: { variable: string; numbers: string[] }) => {
      if (term.numbers) {
        equation = equation.replace(term.variable, term.numbers.join(""));
      } else {
        new Notice("Check the line number in your calculate button", 3000);
        equation = undefined;
      }
    });
  }
  const fun = equation && mexp.eval(equation);
  fun && appendContent(app, `Result: ${fun}`, position.lineEnd);
};

export const remove = (
  app: App,
  { remove }: Arguments,
  { lineStart, lineEnd }: { lineStart: number; lineEnd: number }
): void => {
  setTimeout(() => removeButton(app, remove, lineStart, lineEnd), 100);
};

export const replace = (app: App, { replace }: Arguments): void => {
  removeSection(app, replace);
};

export const template = async (
  app: App,
  args: Arguments,
  position: Position
): Promise<void> => {
  const templatesEnabled = app.internalPlugins.plugins.templates.enabled;
  const templaterPlugin = app.plugins.plugins["templater-obsidian"];
  // only run if templates plugin is enabled
  if (templatesEnabled || templaterPlugin) {
    const folder = templatesEnabled
      ? app.internalPlugins.plugins.templates.instance.options.folder.toLowerCase()
      : templaterPlugin
      ? templaterPlugin.settings.template_folder.toLowerCase()
      : undefined;
    const templateFile = args.action.toLowerCase();
    const allFiles = app.vault.getFiles();
    const file: TFile = allFiles.filter(
      (file) => file.path.toLowerCase() === `${folder}/${templateFile}.md`
    )[0];
    if (file) {
      const content = await app.vault.read(file);
      // prepend template above the button
      if (args.type.includes("prepend")) {
        prependContent(app, content, position.lineStart);
        setTimeout(
          () =>
            app.commands.executeCommandById(
              "templater-obsidian:replace-in-file-templater"
            ),
          100
        );
      }
      // append template below the button
      if (args.type.includes("append")) {
        appendContent(app, content, position.lineEnd);
        setTimeout(
          () =>
            app.commands.executeCommandById(
              "templater-obsidian:replace-in-file-templater"
            ),
          100
        );
      }
      if (args.type.includes("note")) {
        createNote(app, content, args.type);
      }
    } else {
      new Notice(
        `Couldn't find the specified template, please check and try again`,
        2000
      );
    }
  } else {
    new Notice(
      "You need to have the Templates or Templater plugin enabled and Template folder defined",
      2000
    );
  }
};

export const link = ({ action }: Arguments): void => {
  const link = action.trim();
  window.open(link);
};

export const command = (app: App, { action }: Arguments): void => {
  const allCommands = app.commands.listCommands();
  const command = allCommands.filter(
    (command) => command.name.toUpperCase() === action.toUpperCase().trim()
  )[0];
  app.commands.executeCommandById(command.id);
};

export const swap = async (
  app: App,
  swap: string,
  id: string,
  inline: boolean,
  file: TFile
): Promise<void> => {
  handleValueArray(swap, async (argArray) => {
    const swap = await getButtonSwapById(app, id);
    const newSwap = swap + 1 > argArray.length - 1 ? 0 : swap + 1;
    setButtonSwapById(app, id, newSwap);
    const args = await getButtonById(app, argArray[swap]);
    let position;
    let content;
    if (args) {
      if (args.replace) {
        replace(app, args);
      }
      if (args.type === "command") {
        command(app, args);
      }
      // handle link buttons
      if (args.type === "link") {
        link(args);
      }
      // handle template buttons
      if (args.type && args.type.includes("template")) {
        setTimeout(async () => {
          content = await app.vault.read(file);
          position = inline
            ? await getInlineButtonPosition(app, id)
            : getButtonPosition(content, args);
          template(app, args, position);
        }, 50);
      }
      if (args.type === "calculate") {
        calculate(app, args, position);
      }
      // handle removing the button
      if (args.remove) {
        setTimeout(async () => {
          content = await app.vault.read(file);
          position = inline
            ? await getInlineButtonPosition(app, id)
            : getButtonPosition(content, args);
          remove(app, args, position);
        }, 75);
      }
    }
  });
};

export const templater = async (
  app: App,
  position: Position
): Promise<Arguments> => {
  const originalContent = await createContentArray(app);
  const length = position.lineEnd - position.lineStart;
  const originalButton = originalContent.contentArray
    .splice(position.lineStart, position.lineEnd)
    .join("\n");
  let complete = app.commands.executeCommandById(
    "templater-obsidian:replace-in-file-templater"
  );
  if (complete) {
    const { content, args } = await getNewArgs(app, position, originalButton);
    setTimeout(async () => {
      await app.vault.modify(originalContent.file, content);
    }, 1000);
    return args;
  }
};

function getNewArgs(
  app: App,
  position: Position,
  originalButton: string
): Promise<{ args: Arguments; content: string }> {
  const promise = new Promise((resolve) => {
    setTimeout(async () => {
      const activeView = app.workspace.getActiveViewOfType(MarkdownView);
      const newContent = await app.vault
        .read(activeView.file)
        .then((content: string) => content.split("\n"));
      const newButton = newContent
        .splice(position.lineStart, position.lineEnd)
        .join("\n")
        .replace("```button", "")
        .replace("```", "");
      newContent.splice(position.lineStart, length, originalButton);
      const content = newContent.join("\n");
      resolve({ args: createArgumentObject(newButton), content });
    }, 500);
  });
  return promise as Promise<{ args: Arguments; content: string }>;
}
