import * as fs from "fs/promises";
import { IFileSystem } from "../../core/interfaces/IFileSystem";

export class VSCodeFileSystem implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    await fs.mkdir(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    return await fs.readdir(path);
  }

  async stat(
    path: string,
  ): Promise<{
    isDirectory: boolean;
    size: number;
    mtime: Date;
    birthtime: Date;
  }> {
    const stats = await fs.stat(path);
    return {
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      birthtime: stats.birthtime,
    };
  }

  async unlink(path: string): Promise<void> {
    await fs.unlink(path);
  }
}
