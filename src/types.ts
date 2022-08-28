import { Plugin, Pos, TFile } from "obsidian";

declare module "obsidian" {
  interface App {
    plugins: {
      plugins: {
        [name: string]: Plugin;
      };
    };
    commands: {
      executeCommandById: (id: string) => unknown;
      listCommands: () => [{ id: string; name: string }];
      commands: Record<string, { name: string; id: string }>;
    };
  }
}

interface Mutation {
  type: string;
  value: string;
}

export interface Args {
  name?: string;
  type?: string;
  action?: string;
  mutations?: Mutation[];
  id?: string;
  class?: string;
  color?: string;
}

export interface ButtonCache {
  file: TFile;
  args?: Args;
  button?: string;
  position: Pos;
  inlinePosition?: { line?: number; ch?: { start: number; end: number } };
  id: string;
}

export interface PageCache {
  args: Args;
  button: string;
  position: Pos;
  id: string;
}

export interface SwapCache {
  id: string;
  buttons: ButtonCache[];
  currentButton: ButtonCache;
  currentButtonIndex: number;
}
