import { RunnerCommand } from "../../types/runner";
import { TaskItem } from "../../services/ClaudeCodeService";

type MessageHandler<T extends RunnerCommand> = (
  command: T,
) => void | Promise<void>;

export class MessageRouter {
  private readonly handlers = new Map<
    RunnerCommand["kind"],
    MessageHandler<RunnerCommand>
  >();

  register<T extends RunnerCommand>(
    kind: T["kind"],
    handler: MessageHandler<T>,
  ): void {
    this.handlers.set(kind, handler as MessageHandler<RunnerCommand>);
  }

  async route(message: Record<string, unknown>): Promise<void> {
    const command = message as RunnerCommand;
    const handler = this.handlers.get(command.kind);

    if (handler) {
      await handler(command);
    } else {
      console.warn("Unknown command:", command.kind);
    }
  }

  // Helper method to convert legacy message format to RunnerCommand
  static fromLegacyMessage(message: Record<string, unknown>): RunnerCommand {
    const command = message.command as string;

    // Map legacy command names to new format
    switch (command) {
      case "getInitialState":
        return { kind: "getInitialState" };
      case "startInteractive":
        return {
          kind: "startInteractive",
          prompt: message.prompt as string | undefined,
        };
      case "runTask":
        return {
          kind: "runTask",
          task: message.task as string,
          outputFormat: message.outputFormat as "text" | "json" | undefined,
        };
      case "runTasks":
        return {
          kind: "runTasks",
          tasks: message.tasks as TaskItem[],
          outputFormat: message.outputFormat as "text" | "json" | undefined,
        };
      case "cancelTask":
        return { kind: "cancelTask" };
      case "updateModel":
        return { kind: "updateModel", model: message.model as string };
      case "updateRootPath":
        return { kind: "updateRootPath", path: message.path as string };
      case "updateAllowAllTools":
        return { kind: "updateAllowAllTools", allow: message.allow as boolean };
      case "browseFolder":
        return { kind: "browseFolder" };
      case "updateActiveTab":
        return {
          kind: "updateActiveTab",
          tab: message.tab as "chat" | "pipeline" | "usage" | "logs",
        };
      case "updateChatPrompt":
        return { kind: "updateChatPrompt", prompt: message.prompt as string };
      case "updateShowChatPrompt":
        return { kind: "updateShowChatPrompt", show: message.show as boolean };
      case "updateOutputFormat":
        return {
          kind: "updateOutputFormat",
          format: message.format as "text" | "json",
        };
      case "savePipeline":
        return {
          kind: "savePipeline",
          name: message.name as string,
          description: message.description as string,
          tasks: message.tasks as TaskItem[],
        };
      case "loadPipeline":
        return { kind: "loadPipeline", name: message.name as string };
      case "pipelineAddTask":
        return {
          kind: "pipelineAddTask",
          newTask: message.newTask as TaskItem,
        };
      case "pipelineRemoveTask":
        return { kind: "pipelineRemoveTask", taskId: message.taskId as string };
      case "pipelineUpdateTaskField":
        return {
          kind: "pipelineUpdateTaskField",
          taskId: message.taskId as string,
          field: message.field as keyof TaskItem,
          value: message.value,
        };
      case "updateParallelTasksCount":
        return {
          kind: "updateParallelTasksCount",
          value: message.value as number,
        };
      case "requestUsageReport":
        return {
          kind: "requestUsageReport",
          period: message.period as "today" | "week" | "month" | "hourly",
          hours: message.hours as number | undefined,
          startHour: message.startHour as number | undefined,
        };
      case "requestLogProjects":
        return { kind: "requestLogProjects" };
      case "requestLogConversations":
        return {
          kind: "requestLogConversations",
          projectName: message.projectName as string,
        };
      case "requestLogConversation":
        return {
          kind: "requestLogConversation",
          filePath: message.filePath as string,
        };
      case "recheckClaude":
        return {
          kind: "recheckClaude",
          shell: message.shell as
            | "auto"
            | "bash"
            | "zsh"
            | "fish"
            | "sh"
            | undefined,
        };
      case "webviewError":
        return { kind: "webviewError", error: message.error as string };
      default:
        throw new Error(`Unknown legacy command: ${command}`);
    }
  }
}
