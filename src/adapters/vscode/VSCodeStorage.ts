import * as vscode from "vscode";
import { IStorage } from "../../core/interfaces/IStorage";

export class VSCodeStorage implements IStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.context.globalState.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.context.globalState.update(key, undefined);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.context.globalState.keys());
  }
}
