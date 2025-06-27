import * as vscode from "vscode";
import { IConfigSource } from "../../core/interfaces/IConfigManager";

export class VSCodeConfigSource implements IConfigSource {
  private readonly configSection = "claude-runner";

  async get<T>(key: string): Promise<T | undefined> {
    const config = vscode.workspace.getConfiguration(this.configSection);
    return config.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configSection);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
