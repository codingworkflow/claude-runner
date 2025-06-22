/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing */
import {
  LogsService,
  ConversationData,
  ProjectInfo,
} from "../../src/services/LogsService";
import { readFile, writeFile, mkdir, rmdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

describe("LogsService End-to-End Tests", () => {
  let logsService: LogsService;
  let testProjectsDir: string;
  let originalHomedir: string;

  beforeAll(async () => {
    // Create a temporary directory for test projects
    testProjectsDir = path.join(tmpdir(), "claude-runner-test-logs");
    await mkdir(testProjectsDir, { recursive: true });

    // Mock homedir to point to our test directory
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    originalHomedir = require("os").homedir;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("os").homedir = jest
      .fn()
      .mockReturnValue(path.dirname(testProjectsDir));
  });

  afterAll(async () => {
    // Restore original homedir
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("os").homedir = originalHomedir;

    // Clean up test directory
    try {
      await rmdir(testProjectsDir, { recursive: true });
    } catch (error) {
      console.warn("Failed to clean up test directory:", error);
    }
  });

  beforeEach(async () => {
    logsService = new LogsService();

    // Set up test project structure
    const testProject1 = path.join(testProjectsDir, "test-project-1");
    const testProject2 = path.join(testProjectsDir, "test-project-2");

    await mkdir(testProject1, { recursive: true });
    await mkdir(testProject2, { recursive: true });

    // Copy test fixture files
    const fixturesDir = path.join(__dirname, "../fixtures/logs");
    const sampleConversation = await readFile(
      path.join(fixturesDir, "sample-conversation.jsonl"),
      "utf-8",
    );
    const complexConversation = await readFile(
      path.join(fixturesDir, "complex-conversation.jsonl"),
      "utf-8",
    );

    // Write test conversations
    await writeFile(
      path.join(testProject1, "conversation-1.jsonl"),
      sampleConversation,
    );
    await writeFile(
      path.join(testProject1, "conversation-2.jsonl"),
      complexConversation,
    );
    await writeFile(
      path.join(testProject2, "conversation-3.jsonl"),
      sampleConversation,
    );

    // Create an empty conversation file
    await writeFile(path.join(testProject2, "empty-conversation.jsonl"), "");
  });

  afterEach(async () => {
    // Clear cache between tests
    logsService.clearCache();
  });

  describe("Project Management", () => {
    test("should list all projects with conversation counts", async () => {
      const projects: ProjectInfo[] = await logsService.listProjects();

      expect(projects).toHaveLength(2);

      const project1 = projects.find((p) => p.name === "test-project-1");
      const project2 = projects.find((p) => p.name === "test-project-2");

      expect(project1).toBeDefined();
      expect(project1?.conversationCount).toBe(2);
      expect(project1?.path).toBe(path.join(testProjectsDir, "test-project-1"));

      expect(project2).toBeDefined();
      expect(project2?.conversationCount).toBe(1); // Empty file should be ignored
      expect(project2?.path).toBe(path.join(testProjectsDir, "test-project-2"));
    });

    test("should cache project list for performance", async () => {
      const projects1 = await logsService.listProjects();
      const projects2 = await logsService.listProjects();

      expect(projects1).toEqual(projects2);
      expect(projects1).toBe(projects2); // Should return same cached instance
    });

    test("should handle missing projects directory gracefully", async () => {
      // Mock homedir to point to non-existent directory
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("os").homedir = jest.fn().mockReturnValue("/non/existent/path");

      const newLogsService = new LogsService();
      const projects = await newLogsService.listProjects();

      expect(projects).toEqual([]);
    });
  });

  describe("Conversation Management", () => {
    test("should list conversations for a project", async () => {
      const conversations =
        await logsService.listConversations("test-project-1");

      expect(conversations).toHaveLength(2);

      const conversation1 = conversations.find(
        (c) => c.id === "conversation-1",
      );
      const conversation2 = conversations.find(
        (c) => c.id === "conversation-2",
      );

      expect(conversation1).toBeDefined();
      expect(conversation1?.sessionId).toBe("test-session-123");
      expect(conversation1?.messageCount).toBe(4); // 2 user + 2 assistant messages
      expect(conversation1?.summary).toContain("factorial function");

      expect(conversation2).toBeDefined();
      expect(conversation2?.sessionId).toBe("debug-session-456");
      expect(conversation2?.messageCount).toBe(6);
      expect(conversation2?.summary).toContain("JavaScript debugging");
    });

    test("should sort conversations by timestamp (newest first)", async () => {
      const conversations =
        await logsService.listConversations("test-project-1");

      expect(conversations).toHaveLength(2);

      // complex-conversation has later timestamp (2024-01-02) vs sample-conversation (2024-01-01)
      expect(conversations[0].id).toBe("conversation-2"); // complex-conversation should be first
      expect(conversations[1].id).toBe("conversation-1"); // sample-conversation should be second
    });

    test("should handle non-existent project gracefully", async () => {
      const conversations = await logsService.listConversations(
        "non-existent-project",
      );
      expect(conversations).toEqual([]);
    });
  });

  describe("Conversation Loading", () => {
    test("should load complete conversation data", async () => {
      const conversationPath = path.join(
        testProjectsDir,
        "test-project-1",
        "conversation-1.jsonl",
      );
      const conversationData: ConversationData | null =
        await logsService.loadConversation(conversationPath);

      expect(conversationData).not.toBeNull();
      expect(conversationData!.info.id).toBe("conversation-1");
      expect(conversationData!.info.sessionId).toBe("test-session-123");
      expect(conversationData!.entries).toHaveLength(5); // 4 messages + 1 summary

      // Verify entries are sorted by timestamp
      const messageEntries = conversationData!.entries.filter(
        (e) => e.type !== "summary",
      );
      for (let i = 1; i < messageEntries.length; i++) {
        const prev = new Date((messageEntries[i - 1] as any).timestamp);
        const curr = new Date((messageEntries[i] as any).timestamp);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });

    test("should load conversation with tool usage", async () => {
      const conversationPath = path.join(
        testProjectsDir,
        "test-project-1",
        "conversation-2.jsonl",
      );
      const conversationData: ConversationData | null =
        await logsService.loadConversation(conversationPath);

      expect(conversationData).not.toBeNull();

      // Find user message with tool usage
      const userWithTool = conversationData!.entries.find(
        (entry) =>
          entry.type === "user" &&
          Array.isArray((entry as any).message.content) &&
          (entry as any).message.content.some(
            (c: any) => c.type === "tool_use",
          ),
      );

      expect(userWithTool).toBeDefined();

      // Find assistant message with tool result
      const assistantWithToolResult = conversationData!.entries.find(
        (entry) =>
          entry.type === "assistant" &&
          Array.isArray((entry as any).message.content) &&
          (entry as any).message.content.some(
            (c: any) => c.type === "tool_result",
          ),
      );

      expect(assistantWithToolResult).toBeDefined();
    });

    test("should handle malformed conversation files", async () => {
      // Create a file with invalid JSON
      const invalidPath = path.join(
        testProjectsDir,
        "test-project-1",
        "invalid.jsonl",
      );
      await writeFile(invalidPath, 'invalid json line\n{"valid": "json"}\n');

      const conversationData = await logsService.loadConversation(invalidPath);

      // Should handle partial success gracefully
      expect(conversationData).toBeNull(); // No valid conversation structure found
    });

    test("should handle non-existent conversation file", async () => {
      const nonExistentPath = path.join(testProjectsDir, "non-existent.jsonl");
      const conversationData =
        await logsService.loadConversation(nonExistentPath);

      expect(conversationData).toBeNull();
    });
  });

  describe("Data Processing and Analysis", () => {
    test("should extract usage information from conversations", async () => {
      const conversationPath = path.join(
        testProjectsDir,
        "test-project-1",
        "conversation-1.jsonl",
      );
      const conversationData: ConversationData | null =
        await logsService.loadConversation(conversationPath);

      expect(conversationData).not.toBeNull();

      // Count total tokens used
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      conversationData!.entries.forEach((entry) => {
        if (entry.type === "assistant") {
          const usage = (entry as any).message.usage;
          if (usage) {
            totalInputTokens += usage.input_tokens || 0;
            totalOutputTokens += usage.output_tokens || 0;
          }
        }
      });

      expect(totalInputTokens).toBeGreaterThan(0);
      expect(totalOutputTokens).toBeGreaterThan(0);
    });

    test("should identify conversation patterns", async () => {
      const conversations =
        await logsService.listConversations("test-project-1");

      // Analyze conversation characteristics
      const analysisResults = conversations.map((conv) => ({
        id: conv.id,
        duration:
          new Date(conv.lastTimestamp).getTime() -
          new Date(conv.firstTimestamp).getTime(),
        messageCount: conv.messageCount,
        hasCodeExamples: conv.summary?.includes("function") || false,
        hasDebugging: conv.summary?.includes("debug") || false,
      }));

      expect(analysisResults).toHaveLength(2);

      const factorialConv = analysisResults.find(
        (a) => a.hasCodeExamples && !a.hasDebugging,
      );
      const debugConv = analysisResults.find((a) => a.hasDebugging);

      expect(factorialConv).toBeDefined();
      expect(debugConv).toBeDefined();
      expect(debugConv!.messageCount).toBeGreaterThan(
        factorialConv!.messageCount,
      );
    });
  });

  describe("Timestamp and Formatting", () => {
    test("should format timestamps correctly", () => {
      const testTimestamp = "2024-01-01T10:00:00.000Z";

      const formattedDateTime = logsService.formatTimestamp(testTimestamp);
      const formattedDate = logsService.formatDate(testTimestamp);
      const formattedTime = logsService.formatTime(testTimestamp);

      expect(formattedDateTime).toContain("2024");
      expect(formattedDateTime).toContain("1"); // Month or day
      expect(formattedDate).toContain("2024");
      expect(formattedTime).toMatch(/\d{1,2}:\d{2}/); // Time format
    });

    test("should handle invalid timestamps gracefully", () => {
      const invalidTimestamp = "invalid-timestamp";

      const formattedDateTime = logsService.formatTimestamp(invalidTimestamp);
      const formattedDate = logsService.formatDate(invalidTimestamp);
      const formattedTime = logsService.formatTime(invalidTimestamp);

      expect(formattedDateTime).toBe(invalidTimestamp);
      expect(formattedDate).toBe(invalidTimestamp);
      expect(formattedTime).toBe(invalidTimestamp);
    });
  });

  describe("Cache Management", () => {
    test("should clear cache correctly", async () => {
      // Load projects to populate cache
      const projects1 = await logsService.listProjects();
      expect(projects1.length).toBeGreaterThan(0);

      // Clear cache
      logsService.clearCache();

      // Create new project
      const newProjectPath = path.join(testProjectsDir, "new-test-project");
      await mkdir(newProjectPath, { recursive: true });
      await writeFile(
        path.join(newProjectPath, "new-conversation.jsonl"),
        '{"type":"user","message":{"role":"user","content":"test"},"sessionId":"new-session","uuid":"test-uuid","timestamp":"2024-01-03T10:00:00.000Z","parentUuid":"","isSidechain":false,"userType":"human","cwd":"/test","version":"1.0.0"}',
      );

      // Load projects again - should see new project
      const projects2 = await logsService.listProjects();
      expect(projects2.length).toBe(projects1.length + 1);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("should handle conversation files with only summary entries", async () => {
      const summaryOnlyPath = path.join(
        testProjectsDir,
        "test-project-1",
        "summary-only.jsonl",
      );
      await writeFile(
        summaryOnlyPath,
        '{"type":"summary","summary":"Just a summary","leafUuid":"test-uuid"}',
      );

      const conversationData =
        await logsService.loadConversation(summaryOnlyPath);
      expect(conversationData).toBeNull(); // No valid conversation structure
    });

    test("should handle conversation files with missing required fields", async () => {
      const incompleteEntryPath = path.join(
        testProjectsDir,
        "test-project-1",
        "incomplete.jsonl",
      );
      await writeFile(
        incompleteEntryPath,
        '{"type":"user","message":{"role":"user","content":"test"}}',
      ); // Missing required fields

      const conversationData =
        await logsService.loadConversation(incompleteEntryPath);
      expect(conversationData).toBeNull();
    });

    test("should handle large conversation files efficiently", async () => {
      // Generate a large conversation file
      const largeConversationPath = path.join(
        testProjectsDir,
        "test-project-1",
        "large-conversation.jsonl",
      );
      const baseEntry = {
        type: "user",
        message: { role: "user", content: "Test message" },
        parentUuid: "",
        isSidechain: false,
        userType: "human",
        cwd: "/test",
        sessionId: "large-session",
        version: "1.0.0",
      };

      const entries = [];
      for (let i = 0; i < 100; i++) {
        entries.push(
          JSON.stringify({
            ...baseEntry,
            uuid: `msg-${i}`,
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
          }),
        );
      }

      await writeFile(largeConversationPath, entries.join("\n"));

      const startTime = Date.now();
      const conversationData = await logsService.loadConversation(
        largeConversationPath,
      );
      const loadTime = Date.now() - startTime;

      expect(conversationData).not.toBeNull();
      expect(conversationData!.entries).toHaveLength(100);
      expect(loadTime).toBeLessThan(1000); // Should load within 1 second
    });
  });
});
