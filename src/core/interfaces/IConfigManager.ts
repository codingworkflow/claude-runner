export interface IConfigSource {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface IConfigManager {
  addSource(source: IConfigSource): void;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  validateModel(model: string): boolean;
  validatePath(path: string): boolean;
}
