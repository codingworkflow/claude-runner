import * as fs from "fs/promises";
import { VSCodeFileSystem } from "../../../../src/adapters/vscode/VSCodeFileSystem";

jest.mock("fs/promises");

const mockFs = fs as jest.Mocked<typeof fs>;

describe("VSCodeFileSystem", () => {
  let fileSystem: VSCodeFileSystem;

  beforeEach(() => {
    fileSystem = new VSCodeFileSystem();
    jest.clearAllMocks();
  });

  describe("readFile", () => {
    it("should read file content successfully", async () => {
      const mockContent = "test file content";
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await fileSystem.readFile("/path/to/file.txt");

      expect(result).toBe(mockContent);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        "/path/to/file.txt",
        "utf-8",
      );
    });

    it("should handle read errors", async () => {
      const error = new Error("File not found");
      mockFs.readFile.mockRejectedValue(error);

      await expect(
        fileSystem.readFile("/nonexistent/file.txt"),
      ).rejects.toThrow("File not found");
    });
  });

  describe("writeFile", () => {
    it("should write file content successfully", async () => {
      const content = "test content";
      mockFs.writeFile.mockResolvedValue();

      await fileSystem.writeFile("/path/to/file.txt", content);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/path/to/file.txt",
        content,
        "utf-8",
      );
    });

    it("should handle write errors", async () => {
      const error = new Error("Permission denied");
      mockFs.writeFile.mockRejectedValue(error);

      await expect(
        fileSystem.writeFile("/readonly/file.txt", "content"),
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("exists", () => {
    it("should return true when file exists", async () => {
      mockFs.access.mockResolvedValue();

      const result = await fileSystem.exists("/path/to/existing/file.txt");

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith("/path/to/existing/file.txt");
    });

    it("should return false when file does not exist", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await fileSystem.exists("/path/to/nonexistent/file.txt");

      expect(result).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(
        "/path/to/nonexistent/file.txt",
      );
    });

    it("should return false on any access error", async () => {
      mockFs.access.mockRejectedValue(new Error("Permission denied"));

      const result = await fileSystem.exists("/path/to/restricted/file.txt");

      expect(result).toBe(false);
    });
  });

  describe("mkdir", () => {
    it("should create directory successfully", async () => {
      mockFs.mkdir.mockResolvedValue("");

      await fileSystem.mkdir("/path/to/new/directory");

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        "/path/to/new/directory",
        undefined,
      );
    });

    it("should create directory with recursive option", async () => {
      mockFs.mkdir.mockResolvedValue("");

      await fileSystem.mkdir("/path/to/new/directory", { recursive: true });

      expect(mockFs.mkdir).toHaveBeenCalledWith("/path/to/new/directory", {
        recursive: true,
      });
    });

    it("should handle mkdir errors", async () => {
      const error = new Error("Directory already exists");
      mockFs.mkdir.mockRejectedValue(error);

      await expect(fileSystem.mkdir("/existing/directory")).rejects.toThrow(
        "Directory already exists",
      );
    });
  });

  describe("readdir", () => {
    it("should read directory contents successfully", async () => {
      const mockFiles = ["file1.txt", "file2.js", "subdirectory"];
      mockFs.readdir.mockResolvedValue(mockFiles as any);

      const result = await fileSystem.readdir("/path/to/directory");

      expect(result).toEqual(mockFiles);
      expect(mockFs.readdir).toHaveBeenCalledWith("/path/to/directory");
    });

    it("should handle readdir errors", async () => {
      const error = new Error("Directory not found");
      mockFs.readdir.mockRejectedValue(error);

      await expect(
        fileSystem.readdir("/nonexistent/directory"),
      ).rejects.toThrow("Directory not found");
    });

    it("should return empty array for empty directory", async () => {
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await fileSystem.readdir("/empty/directory");

      expect(result).toEqual([]);
    });
  });

  describe("stat", () => {
    it("should return file stats successfully", async () => {
      const mockStats = {
        isDirectory: () => false,
        size: 1024,
        mtime: new Date("2023-01-01T12:00:00Z"),
        birthtime: new Date("2023-01-01T10:00:00Z"),
      };
      mockFs.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystem.stat("/path/to/file.txt");

      expect(result).toEqual({
        isDirectory: false,
        size: 1024,
        mtime: new Date("2023-01-01T12:00:00Z"),
        birthtime: new Date("2023-01-01T10:00:00Z"),
      });
      expect(mockFs.stat).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("should return directory stats successfully", async () => {
      const mockStats = {
        isDirectory: () => true,
        size: 4096,
        mtime: new Date("2023-01-02T12:00:00Z"),
        birthtime: new Date("2023-01-02T10:00:00Z"),
      };
      mockFs.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystem.stat("/path/to/directory");

      expect(result).toEqual({
        isDirectory: true,
        size: 4096,
        mtime: new Date("2023-01-02T12:00:00Z"),
        birthtime: new Date("2023-01-02T10:00:00Z"),
      });
    });

    it("should handle stat errors", async () => {
      const error = new Error("File not found");
      mockFs.stat.mockRejectedValue(error);

      await expect(fileSystem.stat("/nonexistent/file.txt")).rejects.toThrow(
        "File not found",
      );
    });
  });

  describe("unlink", () => {
    it("should delete file successfully", async () => {
      mockFs.unlink.mockResolvedValue();

      await fileSystem.unlink("/path/to/file.txt");

      expect(mockFs.unlink).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("should handle unlink errors", async () => {
      const error = new Error("File not found");
      mockFs.unlink.mockRejectedValue(error);

      await expect(fileSystem.unlink("/nonexistent/file.txt")).rejects.toThrow(
        "File not found",
      );
    });

    it("should handle permission errors", async () => {
      const error = new Error("Permission denied");
      mockFs.unlink.mockRejectedValue(error);

      await expect(fileSystem.unlink("/readonly/file.txt")).rejects.toThrow(
        "Permission denied",
      );
    });
  });

  describe("security and validation", () => {
    it("should handle special characters in paths", async () => {
      const specialPath = "/path/with spaces/file (1).txt";
      mockFs.readFile.mockResolvedValue("content");

      await fileSystem.readFile(specialPath);

      expect(mockFs.readFile).toHaveBeenCalledWith(specialPath, "utf-8");
    });

    it("should handle unicode characters in paths", async () => {
      const unicodePath = "/path/with/unicode/文件.txt";
      mockFs.readFile.mockResolvedValue("content");

      await fileSystem.readFile(unicodePath);

      expect(mockFs.readFile).toHaveBeenCalledWith(unicodePath, "utf-8");
    });

    it("should handle empty path gracefully", async () => {
      const error = new Error("Invalid path");
      mockFs.readFile.mockRejectedValue(error);

      await expect(fileSystem.readFile("")).rejects.toThrow("Invalid path");
    });
  });

  describe("error handling and recovery", () => {
    it("should propagate filesystem errors correctly", async () => {
      const fsError = Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
        errno: -13,
        syscall: "open",
        path: "/restricted/file.txt",
      });
      mockFs.readFile.mockRejectedValue(fsError);

      await expect(
        fileSystem.readFile("/restricted/file.txt"),
      ).rejects.toMatchObject({
        code: "EACCES",
        syscall: "open",
        path: "/restricted/file.txt",
      });
    });

    it("should handle network drive errors", async () => {
      const networkError = Object.assign(new Error("Network path not found"), {
        code: "ENOENT",
        errno: -2,
        syscall: "stat",
        path: "//network/share/file.txt",
      });
      mockFs.stat.mockRejectedValue(networkError);

      await expect(
        fileSystem.stat("//network/share/file.txt"),
      ).rejects.toMatchObject({
        code: "ENOENT",
        syscall: "stat",
        path: "//network/share/file.txt",
      });
    });

    it("should handle concurrent access errors", async () => {
      const concurrencyError = Object.assign(
        new Error("Resource temporarily unavailable"),
        {
          code: "EAGAIN",
          errno: -11,
          syscall: "write",
        },
      );
      mockFs.writeFile.mockRejectedValue(concurrencyError);

      await expect(
        fileSystem.writeFile("/locked/file.txt", "content"),
      ).rejects.toMatchObject({
        code: "EAGAIN",
        syscall: "write",
      });
    });
  });
});
