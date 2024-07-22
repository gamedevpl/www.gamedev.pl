/**
 * Function definitions for function calling feature
 */
export const functionDefs = [
  {
    name: 'updateFile',
    parameters: {
      type: 'object',
      description:
        'Update a file with new content. The file must already exists in the application source code. The function should be called only if there is a need to actually change something.',
      properties: {
        filePath: {
          type: 'string',
          description: 'The file path to update.',
        },
        newContent: {
          type: 'string',
          description: 'The content to update the file with. Must not be empty.',
        },
        explanation: {
          type: 'string',
          description: 'The explanation of the reasoning behind the suggested code changes for this file',
        },
      },
      required: ['filePath', 'newContent', 'explanation'],
    },
  },
  {
    name: 'createFile',
    description:
      'Create a new file with specified content. The file will be created inside of project folder structure.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The file path to create.',
        },
        newContent: {
          type: 'string',
          description: 'The content for the new file.',
        },
        explanation: {
          type: 'string',
          description: 'The explanation of the reasoning behind creating this file',
        },
      },
      required: ['filePath', 'newContent', 'explanation'],
    },
  },
  {
    name: 'deleteFile',
    description: 'Delete a specified file from the application source code.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The file path to delete.',
        },
        explanation: {
          type: 'string',
          description: 'The explanation of the reasoning behind deleting this file',
        },
      },
      required: ['filePath', 'explanation'],
    },
  },
  {
    name: 'explanation',
    description: 'Explain the reasoning behind the suggested code changes or reasoning for lack of code changes',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The explanation text',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'createDirectory',
    description: 'Create a new directory',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The directory path to create.',
        },
        explanation: {
          type: 'string',
          description: 'The explanation of the reasoning behind creating this directory',
        },
      },
      required: ['filePath', 'explanation'],
    },
  },
];
