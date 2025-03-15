import { createCanvas } from 'canvas';
import { Asset } from '../assets-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import videoshow from 'videoshow';
import { dir as tmpDir } from 'tmp-promise';
import * as os from 'os';

/// <reference lib="dom" />

/**
 * Renders an asset to canvas and saves it as PNG file in the asset directory
 */
export async function renderAsset(
  asset: Asset,
  assetPath: string,
): Promise<
  {
    stance: string;
    mediaType: string;
    dataUrl: string;
  }[]
> {
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  const result = [];
  for (const stance of asset.stances) {
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    asset.render(ctx as any, canvas.width / 2 - 512, canvas.height / 2 - 512, 1024, 1024, 0, stance, 'right');
    const dataUrl = canvas.toDataURL();

    try {
      // Convert data URL to buffer
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Create output file path
      const assetDir = path.dirname(assetPath);
      const outputPath = path.join(assetDir, `${asset.name.toLowerCase()}-${stance}.png`);

      // Save the buffer as PNG file
      await fs.writeFile(outputPath, buffer);
      console.log(`Rendered asset saved to: ${outputPath}`);
    } catch (error) {
      console.error('Failed to save rendered asset:', error);
    }

    result.push({
      stance,
      mediaType: 'image/png',
      dataUrl,
    });
  }

  return result;
}

/**
 * Configuration options for video rendering
 */
export interface VideoRenderOptions {
  /** Frames per second for the video (default: 30) */
  fps?: number;
  /** Duration of the video in seconds (default: 2) */
  duration?: number;
  /** Whether to log progress (default: true) */
  logProgress?: boolean;
}

/**
 * Renders videos for each stance of an asset
 * @param asset The asset to render
 * @param assetPath Path to the asset's source file
 * @param options Video rendering options
 * @returns Array of video render results
 */
export async function renderAssetVideos(
  asset: Asset,
  assetPath: string,
  options: VideoRenderOptions = {},
): Promise<
  {
    stance: string;
    mediaType: string;
    dataUrl: string;
  }[]
> {
  const results: {
    stance: string;
    mediaType: string;
    dataUrl: string;
  }[] = [];
  const { fps = 30, duration = 2, logProgress = true } = options;

  // Create temporary directory for frames
  const { path: tempDir, cleanup } = await tmpDir({ unsafeCleanup: true });

  try {
    if (logProgress) {
      console.log(`Rendering videos for asset: ${asset.name}`);
    }

    // Render video for each stance
    for (const stance of asset.stances) {
      if (logProgress) {
        console.log(`\nRendering video for stance: ${stance}`);
      }

      const result = await renderStanceVideo(asset, assetPath, stance, tempDir, { fps, duration, logProgress });
      results.push(result);
    }

    return results;
  } finally {
    // Clean up temporary directory
    try {
      await cleanup();
      if (logProgress) {
        console.log('\nTemporary files cleaned up');
      }
    } catch (error) {
      console.error('Error cleaning up temporary files:', error);
    }
  }
}

/**
 * Renders a video for a specific stance
 * @param asset The asset to render
 * @param assetPath Path to the asset's source file
 * @param stance The stance to render
 * @param tempDir Temporary directory for frame storage
 * @param options Video rendering options
 * @returns Video render result
 */
async function renderStanceVideo(
  asset: Asset,
  assetPath: string,
  stance: string,
  tempDir: string,
  options: VideoRenderOptions,
): Promise<{
  stance: string;
  mediaType: string;
  dataUrl: string;
}> {
  const { fps = 30, duration = 2, logProgress = true } = options;
  const totalFrames = fps * duration;
  const frameDir = path.join(tempDir, stance);

  // Create directory for frames
  await fs.mkdir(frameDir, { recursive: true });

  // Generate frames
  const framePaths = await generateFrames(asset, frameDir, stance, totalFrames, logProgress);

  // Create output path for video
  const assetDir = path.dirname(assetPath);
  const videoFileName = `${asset.name.toLowerCase()}-${stance}.mp4`;
  const videoPath = path.join(assetDir, videoFileName);

  // Create video from frames
  await createVideoFromFrames(framePaths, videoPath, fps, logProgress);

  if (logProgress) {
    console.log(`Video for stance "${stance}" saved to: ${videoPath}`);
  }

  const dataUrl = `data:video/mp4;base64,${(await fs.readFile(videoPath)).toString('base64')}`;

  return {
    stance,
    mediaType: 'video/mp4',
    dataUrl,
  };
}

/**
 * Generates frames for an animation
 * @param asset The asset to render
 * @param frameDir Directory to save frames
 * @param stance The stance to render
 * @param totalFrames Total number of frames to generate
 * @param logProgress Whether to log progress
 * @returns Array of frame file paths
 */
async function generateFrames(
  asset: Asset,
  frameDir: string,
  stance: string,
  totalFrames: number,
  logProgress: boolean,
): Promise<string[]> {
  const framePaths: string[] = [];
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');

  if (logProgress) {
    console.log(`Generating ${totalFrames} frames for stance: ${stance}`);
  }

  for (let i = 0; i < totalFrames; i++) {
    // Calculate progress (0 to 1)
    const progress = i / totalFrames;

    // Clear canvas
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    // Create state with the current stance and progress
    // Render the asset with the current state
    asset.render(ctx as any, canvas.width / 2 - 512, canvas.height / 2 - 512, 1024, 1024, progress, stance, 'right');

    // Save frame
    const frameNumber = i.toString().padStart(5, '0');
    const framePath = path.join(frameDir, `frame-${frameNumber}.png`);

    // Convert canvas to buffer and save
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(framePath, buffer);

    framePaths.push(framePath);

    // Log progress periodically
    if (logProgress && (i === 0 || i === totalFrames - 1 || i % Math.ceil(totalFrames / 10) === 0)) {
      console.log(`  Generated frame ${i + 1}/${totalFrames} (${Math.round(progress * 100)}%)`);
    }
  }

  return framePaths;
}

/**
 * Creates a video from frames using videoshow
 * @param framePaths Array of frame file paths
 * @param outputPath Path to save the output video
 * @param fps Frames per second
 * @param logProgress Whether to log progress
 */
async function createVideoFromFrames(
  framePaths: string[],
  outputPath: string,
  fps: number,
  logProgress: boolean,
): Promise<void> {
  if (logProgress) {
    console.log(`Creating video from ${framePaths.length} frames at ${fps} FPS`);
  }

  return new Promise((resolve, reject) => {
    videoshow(framePaths, {
      fps,
      loop: 0.1, // Add a small loop at the end
      transition: false,
      videoBitrate: 1024,
      videoCodec: 'libx264',
      size: '1024x1024',
      outputOptions: ['-pix_fmt yuv420p'],
      format: 'mp4',
    })
      .save(outputPath)
      .on('start', (command: string) => {
        if (logProgress) {
          console.log('  FFmpeg process started:', command);
        }
      })
      .on(
        'progress',
        (progress: {
          frames: number;
          currentFps: number;
          currentKbps: number;
          targetSize: number;
          timemark: string;
        }) => {
          if (logProgress) {
            console.log(`  Processing: ${progress.frames} frames at ${progress.currentFps} FPS`);
          }
        },
      )
      .on('error', (err: Error) => {
        console.error('Error creating video:', err);
        reject(err);
      })
      .on('end', () => {
        if (logProgress) {
          console.log('  Video creation completed');
        }
        resolve();
      });
  });
}
