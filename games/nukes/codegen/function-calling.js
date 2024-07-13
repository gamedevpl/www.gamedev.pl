/**
 * Function declaration for updateFile function
 */
export const updateFileFD = {
  name: 'updateFile',
  parameters: {
    type: 'object',
    description: 'Update a file with new content',
    properties: {
      filePath: {
        type: 'string',
        description: 'The file path to update, if the file path does not exist, it will be created.',
      },
      newContent: {
        type: 'string',
        description: 'The content to update the file with, empty string means the file will be deleted.',
      },
      explanation: {
        type: 'string',
        description: 'The explanation of the reasoning behind the suggested code changes for this file',
      },
    },
    required: ['filePath', 'newContent', 'explanation'],
  },
};

/**
 * Function declaration for explanation function
 */
export const explanationFD = {
  name: 'explanation',
  parameters: {
    type: 'object',
    description: 'Explain the reasoning behind the suggested code changes or reasoning for lack of code changes',
    properties: {
      text: {
        type: 'string',
        description: 'The explanation text',
      },
    },
    required: ['text'],
  },
};
