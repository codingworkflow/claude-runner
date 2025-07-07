import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

describe("ClaudeCodeService Chat JSON Processing", () => {
  let claudeService: ClaudeCodeService;
  let configService: ConfigurationService;

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should build correct chat command for first message", () => {
    const args = claudeService.buildTaskCommand(
      "Hello Claude",
      "claude-sonnet-4-20250514",
      {
        outputFormat: "json",
        allowAllTools: false,
      },
    );

    expect(args).toEqual([
      "claude",
      "-p",
      "'Hello Claude'",
      "--model",
      "claude-sonnet-4-20250514",
      "--output-format",
      "json",
    ]);
  });

  test("should build correct chat command for session continuation", () => {
    const args = claudeService.buildTaskCommand(
      "Tell me more",
      "claude-sonnet-4-20250514",
      {
        outputFormat: "json",
        resumeSessionId: "session-123",
        allowAllTools: true,
      },
    );

    expect(args).toEqual([
      "claude",
      "-r",
      "session-123",
      "-p",
      "'Tell me more'",
      "--model",
      "claude-sonnet-4-20250514",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
    ]);
  });

  test("should handle real Claude CLI JSON output format", async () => {
    const realClaudeOutput = `{"type":"result","subtype":"success","is_error":false,"duration_ms":2887,"duration_api_ms":4882,"num_turns":1,"result":"Hi! I'm Claude Code, ready to help you with your software engineering tasks. What would you like to work on today?","session_id":"31aeff6b-89bd-4c0a-b20e-236890bb7804","total_cost_usd":0.0634276,"usage":{"input_tokens":4,"cache_creation_input_tokens":16592,"cache_read_input_tokens":0,"output_tokens":30,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}`;

    jest.spyOn(claudeService, "executeCommand").mockResolvedValue({
      success: true,
      output: realClaudeOutput,
      exitCode: 0,
    });

    const args = claudeService.buildTaskCommand(
      "hi",
      "claude-sonnet-4-20250514",
      { outputFormat: "json" },
    );

    const result = await claudeService.executeCommand(args, "/workspace");

    expect(result.success).toBe(true);

    // Verify we can parse the raw output
    const jsonResponse = JSON.parse(result.output);
    expect(jsonResponse.result).toBe(
      "Hi! I'm Claude Code, ready to help you with your software engineering tasks. What would you like to work on today?",
    );
    expect(jsonResponse.session_id).toBe(
      "31aeff6b-89bd-4c0a-b20e-236890bb7804",
    );
    expect(jsonResponse.type).toBe("result");
  });

  test("should handle extraction of result from JSON when using runTask", async () => {
    const realClaudeOutput = `{"type":"result","subtype":"success","is_error":false,"result":"This is the extracted result","session_id":"test-session"}`;

    jest.spyOn(claudeService, "executeCommand").mockResolvedValue({
      success: true,
      output: realClaudeOutput,
      exitCode: 0,
    });

    // When using runTask with JSON output format, it should extract only the result field
    const result = await claudeService.runTask(
      "test message",
      "claude-sonnet-4-20250514",
      "/workspace",
      { outputFormat: "json" },
    );

    expect(result).toBe("This is the extracted result");
  });

  test("should handle JSON parsing errors gracefully in runTask", async () => {
    jest.spyOn(claudeService, "executeCommand").mockResolvedValue({
      success: true,
      output: "This is not valid JSON",
      exitCode: 0,
    });

    const result = await claudeService.runTask(
      "test message",
      "claude-sonnet-4-20250514",
      "/workspace",
      { outputFormat: "json" },
    );

    expect(result).toBe("This is not valid JSON");
  });

  test("should handle command execution failure", async () => {
    jest.spyOn(claudeService, "executeCommand").mockResolvedValue({
      success: false,
      output: "",
      error: "Claude CLI not found",
      exitCode: 127,
    });

    await expect(
      claudeService.runTask(
        "test message",
        "claude-sonnet-4-20250514",
        "/workspace",
        { outputFormat: "json" },
      ),
    ).rejects.toThrow("Claude CLI not found");
  });

  test("should handle command with special characters in message", () => {
    const messageWithSpecialChars =
      "Hello! How's it going? Let's test 'quotes' and \"double quotes\".";

    const args = claudeService.buildTaskCommand(
      messageWithSpecialChars,
      "auto",
      { outputFormat: "json" },
    );

    expect(args).toEqual([
      "claude",
      "-p",
      "'Hello! How'\"'\"'s it going? Let'\"'\"'s test '\"'\"'quotes'\"'\"' and \"double quotes\".'",
      "--output-format",
      "json",
    ]);
  });

  test("should not include model flag when model is auto", () => {
    const args = claudeService.buildTaskCommand("test", "auto", {
      outputFormat: "json",
    });

    expect(args).toEqual(["claude", "-p", "'test'", "--output-format", "json"]);
    expect(args).not.toContain("--model");
  });
});
