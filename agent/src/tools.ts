import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

export const toolDefinitions = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_bash",
    description: "Run a bash command and return stdout, stderr, and exit code.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The bash command to run" },
        cwd: {
          type: "string",
          description: "Working directory for the command",
        },
      },
      required: ["command"],
    },
  },
];

export function executeTool(
  name: string,
  input: Record<string, string>
): string {
  switch (name) {
    case "read_file": {
      try {
        return readFileSync(input.path, "utf-8");
      } catch (e) {
        return `Error reading file: ${e}`;
      }
    }
    case "write_file": {
      try {
        writeFileSync(input.path, input.content, "utf-8");
        return `File written successfully: ${input.path}`;
      } catch (e) {
        return `Error writing file: ${e}`;
      }
    }
    case "run_bash": {
      try {
        const stdout = execSync(input.command, {
          cwd: input.cwd,
          encoding: "utf-8",
          timeout: 120_000,
        });
        return JSON.stringify({ stdout, stderr: "", exitCode: 0 });
      } catch (e: any) {
        return JSON.stringify({
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? String(e),
          exitCode: e.status ?? 1,
        });
      }
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
