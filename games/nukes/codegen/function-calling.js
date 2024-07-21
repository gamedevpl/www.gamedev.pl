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
};

/**
 * Function declaration for createFile function
 */
export const createFileFD = {
  name: 'createFile',
  description: 'Create a new file with specified content',
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
};

/**
 * Function declaration for deleteFile function
 */
export const deleteFileFD = {
  name: 'deleteFile',
  description: 'Delete a specified file',
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
};

/**
 * Function declaration for explanation function
 */
export const explanationFD = {
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
};

/**
 * Function declaration for createDirectory function
 */
export const createDirectoryFD = {
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
};
