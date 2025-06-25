import { RunnerCommand, RunnerCommandRegistry } from "../../types/runner";

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
    try {
      const command = this.fromLegacyMessage(message);
      const handler = this.handlers.get(command.kind);

      if (handler) {
        await handler(command);
      } else {
        console.warn("Unknown command:", command.kind);
      }
    } catch (error) {
      console.error("Error routing message:", error);
    }
  }

  // Helper method to convert and validate legacy message format to RunnerCommand
  fromLegacyMessage(message: Record<string, unknown>): RunnerCommand {
    const kind = message.command as keyof typeof RunnerCommandRegistry;

    if (!kind || !RunnerCommandRegistry[kind]) {
      throw new Error(`Unknown or invalid command: ${kind}`);
    }

    const validator = RunnerCommandRegistry[kind];
    const command = validator(message);

    return command;
  }
}
