# Design Document for Codegen Tool

## Overview

The Codegen tool is designed to automate code generation tasks using Vertex AI and OpenAI models. This tool is intended to enhance developer productivity by assisting with the generation of repetitive or complex code.

## How It Works

1. **Reading Source Code**: The Codegen tool reads the entire source code of the application.
2. **Identifying Codegen Fragments**: It identifies fragments marked with `@CODEGEN` comments which indicate sections where code generation is required.
3. **Generating Code**: Depending on the configuration, the tool sends these fragments to either Vertex AI or OpenAI’s chat model to generate the required code.
4. **Updating Source Code**: The tool replaces the identified fragments with the generated code and updates the source code files.

## Components

### CLI Parameters

The tool accepts several CLI parameters to control its behavior:

- `--dry-run`: Runs the tool without making any changes to the files.
- `--consider-all-files`: Considers all files for code generation, even if they don't contain `@CODEGEN` comments.
- `--allow-file-create`: Allows the tool to create new files.
- `--allow-file-delete`: Allows the tool to delete files.
- `--codegen-only`: Limits the scope of code generation to the `codegen` directory.
- `--game-only`: Limits the scope of code generation to the `src` directory.
- `--chat-gpt`: Uses the OpenAI model for code generation instead of Vertex AI.
- `--explicit-prompt`: Provides an explicit prompt for code generation.
- `--task-file`: Specifies a file with a task description for code generation.
- `--dependency-tree`: Limits the scope of code generation to files marked with `@CODEGEN` and their dependencies.
- `--verbose-prompt`: Prints the prompt used for code generation.

### Main Execution Flow

1. **Initialization**: The tool initializes by parsing the CLI parameters and reading the source code files.
2. **Prompt Construction**: Based on the CLI parameters and identified `@CODEGEN` fragments, the tool constructs the system and code generation prompts.
3. **Code Generation**: It sends the prompts to the specified AI model (Vertex AI or OpenAI) and receives the generated code.
4. **File Updates**: The tool updates the files with the generated code. If in dry-run mode, it only prints the changes without applying them.
5. **Feedback and Cost Estimation**: The tool provides feedback on the token usage and estimated cost for the code generation process.