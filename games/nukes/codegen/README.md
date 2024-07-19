# codegen

This module is responsible for generating code using Vertex AI, Google's Gemini Pro model, OpenAI's GPT model, or Anthropic's Claude model.
It is used to automate some of the development process.

The main goal of this module is to help with generating repetitive code or code that is hard to write manually.
It is not meant to replace developers, but to help them be more productive.

## Usage

To use the codegen module, simply run the following command:

```
node codegen/index.js
```

This will run the codegen script, which will:

1. Read the source code of the application.
2. Find the fragments marked with `@CODEGEN`
3. Send the fragments to the selected AI model for code generation, depending on the flags used.
4. Replace the fragments with the generated code.
5. Save the updated source code.

## Options

The codegen script accepts the following options:

- `--dry-run`: Run the codegen script without updating the source code.
- `--consider-all-files`: Consider all files for code generation, even if they don't contain the `@CODEGEN` comments.
- `--allow-file-create`: Allow the codegen script to create new files.
- `--allow-file-delete`: Allow the codegen script to delete files.
- `--codegen-only`: Limit the scope of codegen to the codegen tool itself (the `codegen/` directory).
- `--game-only`: Limit the scope of codegen to the game itself (the `src/` directory).
- `--chat-gpt`: Use the OpenAI model for code generation instead of Vertex AI with Google's Gemini Pro model.
- `--anthropic`: Use Anthropic's Claude model for code generation.
- `--explicit-prompt`: An explicit prompt to use for code generation.
- `--task-file`: Specifies a file with a task description for code generation.
- `--dependency-tree`: Limit the scope of codegen only to files marked with `@CODEGEN` and their dependencies
- `--verbose-prompt`: Print the prompt used for code generation.

Note: The `--chat-gpt` and `--anthropic` flags are mutually exclusive. If neither is specified, the default Vertex AI with Google's Gemini Pro model will be used.