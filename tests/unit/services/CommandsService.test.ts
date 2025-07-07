import { jest } from "@jest/globals";
import * as path from "path";
import {
  CommandsService,
  CommandFile,
} from "../../../src/services/CommandsService";

jest.mock("fs/promises", () => ({
  access: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock("os", () => ({
  homedir: jest.fn(() => "/home/test"),
}));

jest.mock("vscode", () => ({
  window: {
    showTextDocument: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: "/test/workspace" },
        name: "test-workspace",
        index: 0,
      },
    ],
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path })),
  },
}));

describe("CommandsService", () => {
  let commandsService: CommandsService;
  let mockContext: any;
  let consoleMock: any;
  let mockFs: any;
  let mockVSCode: any;
  let mockOs: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
        setKeysForSync: jest.fn(),
      },
      extensionPath: "/test/extension/path",
      extensionUri: { fsPath: "/test/extension/path" },
      environmentVariableCollection: {
        replace: jest.fn(),
        append: jest.fn(),
        prepend: jest.fn(),
        get: jest.fn(),
        forEach: jest.fn(),
        clear: jest.fn(),
        delete: jest.fn(),
      },
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
      },
    };

    consoleMock = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    };

    mockFs = require("fs/promises");
    mockVSCode = require("vscode");
    mockOs = require("os");

    // Reset os.homedir to default behavior
    mockOs.homedir.mockReturnValue("/home/test");

    commandsService = new CommandsService(mockContext);
  });

  afterEach(() => {
    consoleMock.log.mockRestore();
    consoleMock.warn.mockRestore();
    consoleMock.error.mockRestore();
  });

  describe("constructor", () => {
    it("should initialize with workspace folder path", () => {
      expect(commandsService).toBeInstanceOf(CommandsService);
    });

    it("should handle undefined workspace folders", () => {
      const originalWorkspaceFolders = mockVSCode.workspace.workspaceFolders;
      mockVSCode.workspace.workspaceFolders = undefined;

      const service = new CommandsService(mockContext);
      expect(service).toBeInstanceOf(CommandsService);

      mockVSCode.workspace.workspaceFolders = originalWorkspaceFolders;
    });
  });

  describe("setRootPath", () => {
    it("should update root path", () => {
      const newPath = "/new/test/path";
      commandsService.setRootPath(newPath);
      expect(commandsService).toBeInstanceOf(CommandsService);
    });
  });

  describe("scanCommands", () => {
    it("should scan both global and project commands successfully", async () => {
      const globalCommandFiles = ["test-global.md", "deploy.md"];
      const projectCommandFiles = ["test-project.md", "build.md"];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir
        .mockResolvedValueOnce(globalCommandFiles)
        .mockResolvedValueOnce(projectCommandFiles);

      mockFs.readFile
        .mockResolvedValueOnce(
          "# Global Test Command\nTest global command description",
        )
        .mockResolvedValueOnce("# Deploy Command\nDeploy to production")
        .mockResolvedValueOnce(
          "# Project Test Command\nTest project command description",
        )
        .mockResolvedValueOnce("# Build Command\nBuild the project");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(2);
      expect(result.projectCommands).toHaveLength(2);

      expect(result.globalCommands[0]).toEqual({
        name: "test-global",
        path: path.join("/home/test", ".claude", "commands", "test-global.md"),
        description: "Global Test Command",
        isProject: false,
      });

      expect(result.projectCommands[0]).toEqual({
        name: "test-project",
        path: path.join(
          "/test/workspace",
          ".claude",
          "commands",
          "test-project.md",
        ),
        description: "Project Test Command",
        isProject: true,
      });
    });

    it("should handle non-existent directories gracefully", async () => {
      mockFs.access.mockRejectedValue(new Error("Directory not found"));

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(0);
      expect(result.projectCommands).toHaveLength(0);
    });

    it("should filter only .md files", async () => {
      const mixedFiles = [
        "command.md",
        "readme.txt",
        "script.sh",
        "another.md",
      ];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(mixedFiles);
      mockFs.readFile
        .mockResolvedValueOnce("# Command\nCommand description")
        .mockResolvedValueOnce("# Another\nAnother description");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(2);
      expect(result.globalCommands[0].name).toBe("command");
      expect(result.globalCommands[1].name).toBe("another");
    });

    it("should extract descriptions from various formats", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["test1.md", "test2.md", "test3.md"]);
      mockFs.readFile
        .mockResolvedValueOnce("# Markdown Header\nContent here")
        .mockResolvedValueOnce("// Comment style\nCode here")
        .mockResolvedValueOnce("Plain text first line\nMore content");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands[0].description).toBe("Markdown Header");
      expect(result.globalCommands[1].description).toBe("Comment style");
      expect(result.globalCommands[2].description).toBe(
        "Plain text first line",
      );
    });

    it("should handle file read errors gracefully", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["unreadable.md"]);
      mockFs.readFile.mockRejectedValue(new Error("Permission denied"));

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.globalCommands[0].description).toBe("");
      expect(consoleMock.warn).toHaveBeenCalled();
    });

    it("should handle directory scan errors", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue(new Error("Scan error"));

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(0);
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Error scanning commands directory"),
        expect.any(Error),
      );
    });

    it("should handle no root path for project commands", async () => {
      commandsService.setRootPath("");
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["global.md"]);
      mockFs.readFile.mockResolvedValue("# Global\nGlobal command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.projectCommands).toHaveLength(0);
    });

    it("should handle general scan errors", async () => {
      mockOs.homedir.mockImplementation(() => {
        throw new Error("OS error");
      });

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(0);
      expect(result.projectCommands).toHaveLength(0);
      expect(consoleMock.error).toHaveBeenCalledWith(
        "Error scanning commands:",
        expect.any(Error),
      );
    });
  });

  describe("openCommandFile", () => {
    it("should slash open commands file successfully", async () => {
      const filePath = "/test/command.md";
      mockVSCode.window.showTextDocument.mockResolvedValue(undefined);

      await commandsService.openCommandFile(filePath);

      expect(mockVSCode.Uri.file).toHaveBeenCalledWith(filePath);
      expect(mockVSCode.window.showTextDocument).toHaveBeenCalled();
    });

    it("should handle file open errors", async () => {
      const filePath = "/test/nonexistent.md";
      const error = new Error("File not found");
      mockVSCode.window.showTextDocument.mockRejectedValue(error);

      await commandsService.openCommandFile(filePath);

      expect(consoleMock.error).toHaveBeenCalledWith(
        "Error opening command file:",
        error,
      );
      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        `Failed to open command file: ${filePath}`,
      );
    });
  });

  describe("createCommand", () => {
    it("should create global command successfully", async () => {
      const commandName = "new-global-command";
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File doesn't exist"));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockVSCode.window.showTextDocument.mockResolvedValue(undefined);

      await commandsService.createCommand(commandName, true);

      const expectedPath = path.join(
        "/home/test",
        ".claude",
        "commands",
        `${commandName}.md`,
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join("/home/test", ".claude", "commands"),
        { recursive: true },
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining(`# ${commandName}`),
      );
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledWith(
        `Created global command: ${commandName}`,
      );
    });

    it("should create project command successfully", async () => {
      const commandName = "new-project-command";
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File doesn't exist"));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockVSCode.window.showTextDocument.mockResolvedValue(undefined);

      await commandsService.createCommand(commandName, false);

      const expectedPath = path.join(
        "/test/workspace",
        ".claude",
        "commands",
        `${commandName}.md`,
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join("/test/workspace", ".claude", "commands"),
        { recursive: true },
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.stringContaining(`# ${commandName}`),
      );
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledWith(
        `Created project command: ${commandName}`,
      );
    });

    it("should handle no workspace for project command", async () => {
      commandsService.setRootPath("");
      const commandName = "project-command";

      await commandsService.createCommand(commandName, false);

      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        "No workspace selected for project command",
      );
      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });

    it("should handle existing command file", async () => {
      const commandName = "existing-command";
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      await commandsService.createCommand(commandName, true);

      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        `Command '${commandName}' already exists`,
      );
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it("should handle directory creation errors", async () => {
      const commandName = "test-command";
      const error = new Error("Permission denied");
      mockFs.mkdir.mockRejectedValue(error);

      await commandsService.createCommand(commandName, true);

      expect(consoleMock.error).toHaveBeenCalledWith(
        "Error creating command:",
        error,
      );
      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        `Failed to create command: ${commandName}`,
      );
    });

    it("should handle file write errors", async () => {
      const commandName = "test-command";
      const error = new Error("Write failed");
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File doesn't exist"));
      mockFs.writeFile.mockRejectedValue(error);

      await commandsService.createCommand(commandName, true);

      expect(consoleMock.error).toHaveBeenCalledWith(
        "Error creating command:",
        error,
      );
      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        `Failed to create command: ${commandName}`,
      );
    });

    it("should create proper command template", async () => {
      const commandName = "template-test";
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error("File doesn't exist"));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockVSCode.window.showTextDocument.mockResolvedValue(undefined);

      await commandsService.createCommand(commandName, true);

      const expectedTemplate = `# ${commandName}\n\nDescribe what this command does here.\n\n!echo "Implement your command here"\n`;
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedTemplate,
      );
    });
  });

  describe("deleteCommand", () => {
    it("should delete command file successfully", async () => {
      const filePath = "/test/commands/test-command.md";
      mockFs.unlink.mockResolvedValue(undefined);

      await commandsService.deleteCommand(filePath);

      expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledWith(
        "Deleted command: test-command",
      );
    });

    it("should handle delete errors", async () => {
      const filePath = "/test/commands/protected-command.md";
      const error = new Error("Permission denied");
      mockFs.unlink.mockRejectedValue(error);

      await commandsService.deleteCommand(filePath);

      expect(consoleMock.error).toHaveBeenCalledWith(
        "Error deleting command:",
        error,
      );
      expect(mockVSCode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to delete command: protected-command",
      );
    });

    it("should extract command name from complex path", async () => {
      const complexPath = "/very/long/path/to/commands/complex-command-name.md";
      mockFs.unlink.mockResolvedValue(undefined);

      await commandsService.deleteCommand(complexPath);

      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledWith(
        "Deleted command: complex-command-name",
      );
    });
  });

  describe("command validation and parsing", () => {
    it("should validate markdown file extensions correctly", async () => {
      const invalidFiles = ["command.txt", "script.sh", "readme"];
      const validFiles = ["command.md", "another.md"];
      const allFiles = [...invalidFiles, ...validFiles];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(allFiles);
      mockFs.readFile
        .mockResolvedValueOnce("# Command\nValid command")
        .mockResolvedValueOnce("# Another\nAnother valid command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(2);
      expect(
        result.globalCommands.every(
          (cmd) => cmd.name && cmd.path.endsWith(".md"),
        ),
      ).toBe(true);
    });

    it("should handle empty command files", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["empty.md"]);
      mockFs.readFile.mockResolvedValue("");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.globalCommands[0].description).toBe("");
    });

    it("should handle files with only whitespace", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["whitespace.md"]);
      mockFs.readFile.mockResolvedValue("   \n\t\n   ");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.globalCommands[0].description).toBe("");
    });

    it("should preserve command structure integrity", async () => {
      const commandFiles = ["cmd1.md", "cmd2.md"];

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(commandFiles);
      mockFs.readFile
        .mockResolvedValueOnce("# Command One\nFirst command")
        .mockResolvedValueOnce("# Command Two\nSecond command");

      const result = await commandsService.scanCommands();

      result.globalCommands.forEach((cmd: CommandFile) => {
        expect(cmd).toMatchObject({
          name: expect.any(String),
          path: expect.any(String),
          description: expect.any(String),
          isProject: expect.any(Boolean),
        });
        expect(cmd.name).toBeTruthy();
        expect(cmd.path).toContain(".md");
      });
    });
  });

  describe("error recovery and resilience", () => {
    it("should continue scanning after individual file errors", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        "good.md",
        "bad.md",
        "another-good.md",
      ]);
      mockFs.readFile
        .mockResolvedValueOnce("# Good Command\nWorking command")
        .mockRejectedValueOnce(new Error("Read error"))
        .mockResolvedValueOnce("# Another Good\nAnother working command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(3);
      expect(result.globalCommands[0].description).toBe("Good Command");
      expect(result.globalCommands[1].description).toBe("");
      expect(result.globalCommands[2].description).toBe("Another Good");
    });

    it("should handle partial directory access", async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Project directory not found"));

      mockFs.readdir.mockResolvedValue(["global.md"]);
      mockFs.readFile.mockResolvedValue("# Global\nGlobal command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.projectCommands).toHaveLength(0);
    });

    it("should maintain service state after errors", async () => {
      mockOs.homedir.mockImplementation(() => {
        throw new Error("System error");
      });

      const result1 = await commandsService.scanCommands();
      expect(result1.globalCommands).toHaveLength(0);

      mockOs.homedir.mockReturnValue("/home/test");
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["recovered.md"]);
      mockFs.readFile.mockResolvedValue("# Recovered\nRecovered command");

      const result2 = await commandsService.scanCommands();
      expect(result2.globalCommands).toHaveLength(1);
    });
  });

  describe("command caching and performance", () => {
    it("should handle large numbers of command files", async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => `command${i}.md`);

      mockFs.access
        .mockResolvedValueOnce(undefined) // Global directory
        .mockRejectedValueOnce(new Error("No project dir")); // Project directory

      mockFs.readdir.mockResolvedValue(manyFiles);

      manyFiles.forEach((_, index) => {
        mockFs.readFile.mockResolvedValueOnce(
          `# Command ${index}\nCommand ${index} description`,
        );
      });

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(100);
      expect(mockFs.readFile).toHaveBeenCalledTimes(100);
    });

    it("should handle concurrent scan operations", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["concurrent.md"]);
      mockFs.readFile.mockResolvedValue("# Concurrent\nConcurrent command");

      const promises = [
        commandsService.scanCommands(),
        commandsService.scanCommands(),
        commandsService.scanCommands(),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.globalCommands).toHaveLength(1);
      });
    });
  });

  describe("command availability checking", () => {
    it("should correctly identify available commands", async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(["available.md"]);
      mockFs.readFile.mockResolvedValue("# Available\nAvailable command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.globalCommands[0].name).toBe("available");
    });

    it("should handle mixed availability scenarios", async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Not found"));

      mockFs.readdir.mockResolvedValue(["global-only.md"]);
      mockFs.readFile.mockResolvedValue("# Global Only\nGlobal only command");

      const result = await commandsService.scanCommands();

      expect(result.globalCommands).toHaveLength(1);
      expect(result.projectCommands).toHaveLength(0);
    });
  });
});
