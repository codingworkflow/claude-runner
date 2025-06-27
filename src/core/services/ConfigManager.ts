import { IConfigManager, IConfigSource } from "../interfaces/IConfigManager";
import { ILogger } from "../interfaces";

export class ConfigManager implements IConfigManager {
  private readonly sources: IConfigSource[] = [];

  constructor(private readonly logger: ILogger) {}

  addSource(source: IConfigSource): void {
    this.sources.push(source);
    this.logger.debug(`Added config source: ${source.constructor.name}`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    // Check sources in priority order (last added has highest priority)
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const source = this.sources[i];
      try {
        const value = await source.get<T>(key);
        if (value !== undefined) {
          return value;
        }
      } catch (error) {
        this.logger.warn(
          `Config source ${source.constructor.name} failed for key ${key}`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    return undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    // Set in the first available source (usually the most persistent one)
    if (this.sources.length === 0) {
      throw new Error("No config sources available");
    }

    try {
      await this.sources[0].set(key, value);
    } catch (error) {
      this.logger.error(
        `Failed to set config key ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  validateModel(model: string): boolean {
    // Valid Claude models
    const validModels = [
      "auto",
      "claude-3-5-sonnet-latest",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-latest",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-latest",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];

    return validModels.includes(model);
  }

  validatePath(path: string): boolean {
    // Basic path validation - no empty paths, no null bytes
    if (!path || path.trim().length === 0) {
      return false;
    }

    // Check for null bytes (security)
    if (path.includes("\0")) {
      return false;
    }

    // Allow relative and absolute paths
    return true;
  }
}
