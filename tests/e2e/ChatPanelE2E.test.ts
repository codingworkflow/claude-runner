import * as path from "path";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { spawn } from "child_process";

interface ChatUIState {
  activeTab: "terminal" | "extension";
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  currentInput: string;
  isSending: boolean;
  sessionId?: string;
  error?: string;
}

let chatUIState: ChatUIState = {
  activeTab: "extension",
  messages: [],
  currentInput: "",
  isSending: false,
};

let configService: ConfigurationService;
let claudeService: ClaudeCodeService;

function simulateTabChange(tab: "terminal" | "extension"): void {
  console.log(
    `🖱️  USER: Switching to ${tab === "terminal" ? "Terminal" : "VSCode"} chat mode`,
  );
  chatUIState.activeTab = tab;
}

async function simulateSendMessage(message: string): Promise<void> {
  console.log(`🖱️  USER: Sending message: "${message}"`);
  if (!chatUIState.isSending && message.trim()) {
    chatUIState.currentInput = message;
    await sendChatMessage(message);
  }
}

async function sendChatMessage(message: string): Promise<void> {
  chatUIState.isSending = true;
  chatUIState.messages.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  try {
    if (chatUIState.activeTab === "extension") {
      // Build command using the same approach as RunnerController
      const args = claudeService.buildTaskCommand(
        message,
        "claude-sonnet-4-20250514",
        {
          outputFormat: "json",
          resumeSessionId: chatUIState.sessionId,
        },
      );

      const commandResult = await claudeService.executeCommand(
        args,
        process.cwd(),
      );

      if (!commandResult.success) {
        throw new Error(commandResult.error ?? "Chat command failed");
      }

      // Parse the JSON response from raw output
      let responseContent: string;
      let sessionId: string | undefined;

      try {
        const jsonResponse = JSON.parse(commandResult.output.trim());
        responseContent = jsonResponse.result || "No response";
        sessionId = jsonResponse.session_id;
        chatUIState.sessionId = sessionId;
      } catch {
        responseContent = commandResult.output;
      }

      chatUIState.messages.push({
        role: "assistant",
        content: responseContent,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log("Terminal mode would open interactive session");
    }
  } catch (error) {
    chatUIState.error = error instanceof Error ? error.message : String(error);
  } finally {
    chatUIState.isSending = false;
    chatUIState.currentInput = "";
  }
}

beforeEach(() => {
  jest.clearAllMocks();

  configService = new ConfigurationService();
  claudeService = new ClaudeCodeService(configService);

  chatUIState = {
    activeTab: "extension",
    messages: [],
    currentInput: "",
    isSending: false,
  };
});

describe("Chat Panel E2E Tests", () => {
  test("should switch between VSCode and Terminal chat modes", () => {
    expect(chatUIState.activeTab).toBe("extension");

    simulateTabChange("terminal");
    expect(chatUIState.activeTab).toBe("terminal");

    simulateTabChange("extension");
    expect(chatUIState.activeTab).toBe("extension");
  });

  test("should send message in extension mode and maintain session", async () => {
    simulateTabChange("extension");

    expect(chatUIState.messages.length).toBe(0);
    expect(chatUIState.sessionId).toBeUndefined();

    jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (_args: string[]) => {
        if (_args.includes("--output-format") && _args.includes("json")) {
          return {
            success: true,
            output: JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              duration_ms: 2887,
              duration_api_ms: 4882,
              num_turns: 1,
              result:
                "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.",
              session_id: "test-session-123",
              total_cost_usd: 0.0634276,
              usage: {
                input_tokens: 4,
                cache_creation_input_tokens: 16592,
                cache_read_input_tokens: 0,
                output_tokens: 30,
                server_tool_use: {
                  web_search_requests: 0,
                },
                service_tier: "standard",
              },
            }),
            exitCode: 0,
          };
        }
        return {
          success: true,
          output: "Terminal mode output",
          exitCode: 0,
        };
      });

    await simulateSendMessage("What is TypeScript?");

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.messages[0].role).toBe("user");
    expect(chatUIState.messages[0].content).toBe("What is TypeScript?");
    expect(chatUIState.messages[1].role).toBe("assistant");
    expect(chatUIState.messages[1].content).toContain(
      "TypeScript is a typed superset",
    );
    expect(chatUIState.sessionId).toBe("test-session-123");

    jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (_args: string[]) => {
        if (_args.includes("-r") && _args.includes("test-session-123")) {
          return {
            success: true,
            output: JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              result:
                "TypeScript has several type features including interfaces, generics, and type inference.",
              session_id: "test-session-123",
            }),
            exitCode: 0,
          };
        }
        return { success: false, output: "", exitCode: 1 };
      });

    await simulateSendMessage("Tell me more about types");

    expect(chatUIState.messages.length).toBe(4);
    expect(chatUIState.sessionId).toBe("test-session-123");
    expect(chatUIState.messages[3].content).toContain("type features");
  });

  test("should handle errors gracefully", async () => {
    jest.spyOn(claudeService, "executeCommand").mockImplementation(async () => {
      return {
        success: false,
        output: "",
        error: "Claude CLI not found",
        exitCode: 127,
      };
    });

    await simulateSendMessage("Hello");

    expect(chatUIState.error).toContain("Claude CLI not found");
    expect(chatUIState.messages.length).toBe(1);
    expect(chatUIState.isSending).toBe(false);
  });

  test("should display conversation history from logs", async () => {
    const previousMessages = [
      {
        role: "user" as const,
        content: "Previous message",
        timestamp: new Date().toISOString(),
      },
      {
        role: "assistant" as const,
        content: "Previous response",
        timestamp: new Date().toISOString(),
      },
    ];

    chatUIState.messages = previousMessages;
    chatUIState.sessionId = "test-session-123";

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.messages[0].content).toBe("Previous message");
    expect(chatUIState.messages[1].content).toBe("Previous response");
  });

  test("should clear chat and start new session", async () => {
    jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (_args: string[]) => {
        return {
          success: true,
          output: JSON.stringify({
            type: "result",
            result: "First response",
            session_id: "test-session-123",
          }),
          exitCode: 0,
        };
      });

    await simulateSendMessage("First message");

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.sessionId).toBe("test-session-123");

    function simulateClearChat(): void {
      console.log("🖱️  USER: Clicking Clear Chat button");
      chatUIState.messages = [];
      chatUIState.sessionId = undefined;
      chatUIState.error = undefined;
    }

    simulateClearChat();

    expect(chatUIState.messages.length).toBe(0);
    expect(chatUIState.sessionId).toBeUndefined();

    jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (_args: string[]) => {
        return {
          success: true,
          output: JSON.stringify({
            type: "result",
            result: "New conversation response",
            session_id: "new-session-456",
          }),
          exitCode: 0,
        };
      });

    await simulateSendMessage("New conversation");

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.sessionId).toBe("new-session-456");
  });

  test("should handle real Claude execution with fixtures", async () => {
    const scriptPath = path.join(
      __dirname,
      "../fixtures/scripts/claude-mock.sh",
    );

    jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (args: string[]) => {
        return new Promise((resolve) => {
          const child = spawn("bash", [scriptPath, ...args]);
          let output = "";
          let error = "";

          child.stdout.on("data", (data) => {
            output += data.toString();
          });

          child.stderr.on("data", (data) => {
            error += data.toString();
          });

          child.on("close", (code) => {
            resolve({
              success: code === 0,
              output: output.trim(),
              error: error.trim() || undefined,
              exitCode: code ?? 0,
            });
          });
        });
      });

    await simulateSendMessage("Test with real script");
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.messages[1].content).toContain("mock response");
    expect(chatUIState.isSending).toBe(false);
  });

  test("should build correct command with session resume", async () => {
    const executeCommandSpy = jest
      .spyOn(claudeService, "executeCommand")
      .mockImplementation(async (_args: string[]) => {
        return {
          success: true,
          output: JSON.stringify({
            type: "result",
            result: "Response",
            session_id: "test-session",
          }),
          exitCode: 0,
        };
      });

    chatUIState.sessionId = "existing-session-123";

    await sendChatMessage("Continue conversation");

    expect(executeCommandSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        "claude",
        "-r",
        "existing-session-123",
        "-p",
        "'Continue conversation'",
        "--model",
        "claude-sonnet-4-20250514",
        "--output-format",
        "json",
      ]),
      process.cwd(),
    );
  });

  test("should handle JSON parsing errors gracefully", async () => {
    jest.spyOn(claudeService, "executeCommand").mockImplementation(async () => {
      return {
        success: true,
        output: "This is not valid JSON",
        exitCode: 0,
      };
    });

    await simulateSendMessage("Test invalid JSON");

    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.messages[1].content).toBe("This is not valid JSON");
    expect(chatUIState.error).toBeUndefined();
  });

  test("should handle multi-turn conversations", async () => {
    const responses = [
      { message: "Hello! How can I help you today?", session: "session-1" },
      {
        message: "Python is a high-level programming language.",
        session: "session-1",
      },
      {
        message: "Python was created by Guido van Rossum.",
        session: "session-1",
      },
    ];

    let callCount = 0;
    jest.spyOn(claudeService, "executeCommand").mockImplementation(async () => {
      const response = responses[callCount++];
      return {
        success: true,
        output: JSON.stringify({
          type: "result",
          result: response.message,
          session_id: response.session,
        }),
        exitCode: 0,
      };
    });

    await simulateSendMessage("Hello");
    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.sessionId).toBe("session-1");

    await simulateSendMessage("What is Python?");
    expect(chatUIState.messages.length).toBe(4);
    expect(chatUIState.sessionId).toBe("session-1");

    await simulateSendMessage("Who created it?");
    expect(chatUIState.messages.length).toBe(6);
    expect(chatUIState.sessionId).toBe("session-1");

    expect(chatUIState.messages[5].content).toContain("Guido van Rossum");
  });

  test("should handle the exact JSON format from Claude CLI without double parsing", async () => {
    // This test verifies the fix for the "SyntaxError: Unexpected token 'H', Hi! I'm Cl..." error
    const realClaudeOutput = `{"type":"result","subtype":"success","is_error":false,"duration_ms":2887,"duration_api_ms":4882,"num_turns":1,"result":"Hi! I'm Claude Code, ready to help you with your software engineering tasks. What would you like to work on today?","session_id":"31aeff6b-89bd-4c0a-b20e-236890bb7804","total_cost_usd":0.0634276,"usage":{"input_tokens":4,"cache_creation_input_tokens":16592,"cache_read_input_tokens":0,"output_tokens":30,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}`;

    jest.spyOn(claudeService, "executeCommand").mockImplementation(async () => {
      return {
        success: true,
        output: realClaudeOutput,
        exitCode: 0,
      };
    });

    await simulateSendMessage("hi");

    expect(chatUIState.error).toBeUndefined();
    expect(chatUIState.messages.length).toBe(2);
    expect(chatUIState.messages[1].role).toBe("assistant");
    expect(chatUIState.messages[1].content).toBe(
      "Hi! I'm Claude Code, ready to help you with your software engineering tasks. What would you like to work on today?",
    );
    expect(chatUIState.sessionId).toBe("31aeff6b-89bd-4c0a-b20e-236890bb7804");
    expect(chatUIState.isSending).toBe(false);
  });
});
