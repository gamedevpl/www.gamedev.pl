import axios from 'axios';
import FormData from 'form-data';

export interface StabilityAudioOptions {
  prompt: string;
  duration?: number;
  audioBuffer?: Buffer;
}

/**
 * Generates audio using Stability AI's Stable Audio API.
 * Uses text-to-audio if no audioBuffer is provided, otherwise uses audio-to-audio.
 *
 * @param options Options for audio generation (prompt, duration, optional audio buffer)
 * @returns Promise resolving to the generated audio Buffer
 * @throws Error if STABILITY_API_KEY is missing or if the API request fails
 */
export async function generateStabilityAudio(options: StabilityAudioOptions): Promise<Buffer> {
  const apiKey = process.env.STABILITY_API_KEY;

  if (!apiKey) {
    throw new Error(
      'STABILITY_API_KEY environment variable is missing. Please set it to use sound generation features.',
    );
  }

  const { prompt, duration, audioBuffer } = options;
  const formData = new FormData();

  formData.append('prompt', prompt);

  let endpointUrl = '';

  if (audioBuffer) {
    // Audio-to-Audio workflow
    endpointUrl = 'https://api.stability.ai/v2beta/audio/stable-audio-2/audio-to-audio';
    formData.append('audio', audioBuffer, { filename: 'input.mp3', contentType: 'audio/mpeg' });
    // Duration is not strictly required for audio-to-audio, it might inherit from input if not provided
    if (duration) {
      formData.append('duration', duration.toString());
    }
  } else {
    // Text-to-Audio workflow
    endpointUrl = 'https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio';
    // Default duration to 30s if not provided for text-to-audio
    formData.append('duration', (duration || 30).toString());
  }

  try {
    console.log(`Sending request to Stability AI (${audioBuffer ? 'audio-to-audio' : 'text-to-audio'})...`);
    const response = await axios.post(endpointUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
        Accept: 'audio/*', // Request raw binary audio data
      },
      responseType: 'arraybuffer', // Crucial for receiving binary data correctly
    });

    console.log('Audio generated successfully.');
    return Buffer.from(response.data);
  } catch (error: any) {
    let errorMessage = 'Failed to generate audio via Stability AI.';
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      errorMessage += ` Status: ${error.response.status}.`;
      
      // Attempt to parse the error message from the arraybuffer response if possible
      try {
        const errorData = Buffer.from(error.response.data).toString('utf-8');
        const parsedError = JSON.parse(errorData);
        if (parsedError.message) {
           errorMessage += ` Message: ${parsedError.message}`;
        } else {
           errorMessage += ` Details: ${errorData}`;
        }
      } catch (parseError) {
         // If it's not JSON or parsing fails, just log the raw string or generic message
         errorMessage += ` Details: ${Buffer.from(error.response.data).toString('utf-8') || 'Unknown error'}`;
      }
      console.error('Stability API Error Response:', errorMessage);
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage += ' No response received from API.';
      console.error('Stability API Network Error:', error.message);
    } else {
      // Something happened in setting up the request that triggered an Error
      errorMessage += ` Error setting up request: ${error.message}`;
      console.error('Stability API Setup Error:', error.message);
    }
    
    throw new Error(errorMessage);
  }
}
