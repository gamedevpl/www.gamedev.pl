function parsePromptResponse(promptResponseText) {
  // strip ```json\n in the beginning and ``` in the end
  const cleanedText = promptResponseText.replace(/```json\n|\n```/g, '');

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error parsing prompt response:', error);
    console.log('Prompt response text:', promptResponseText);
    return {};
  }
}

export { parsePromptResponse };
