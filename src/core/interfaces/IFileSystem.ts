export interface IFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(
    path: string,
  ): Promise<{
    isDirectory: boolean;
    size: number;
    mtime: Date;
    birthtime: Date;
  }>;
  unlink(path: string): Promise<void>;
}
