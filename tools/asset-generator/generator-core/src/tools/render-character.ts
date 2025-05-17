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
  assetName: string,
  asset: Asset,
  assetPath: string,
): Promise<
  {
    stance: string;
    mediaType: string;
    dataUrl: string;
    filePath: string;
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
    try {
      asset.render(ctx as any, canvas.width / 2 - 512, canvas.height / 2 - 512, 1024, 1024, 0, stance, 'right');
    } catch (error) {
      console.error('Failed to render asset:', error);
    }
    const dataUrl = canvas.toDataURL();

    try {
      // Convert data URL to buffer
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Create output file path
      const assetDir = path.dirname(assetPath);
      const outputPath = path.join(assetDir, `${assetName.toLowerCase()}-${stance}.png`);

      // Save the buffer as PNG file
      await fs.writeFile(outputPath, buffer);
      console.log(`Rendered asset saved to: ${outputPath}`);

      result.push({
        stance,
        mediaType: 'image/png',
        dataUrl,
        filePath: outputPath,
      });
    } catch (error) {
      console.error('Failed to save rendered asset:', error);
    }
  }

  return result;
}

/**
 * Verbosity levels for logging
 */
export type VerbosityLevel = 'none' | 'minimal' | 'normal' | 'verbose';

/**
 * Configuration options for video rendering
 */
export interface VideoRenderOptions {
  /** Frames per second for the video (default: 60) */
  fps?: number;
  /** Duration of the video in seconds (default: 2) */
  duration?: number;
  /** Whether to log progress (default: true) */
  logProgress?: boolean;
  /** Verbosity level for logging (default: 'minimal') */
  verbosity?: VerbosityLevel;
}

/**
 * Determines if a message should be logged based on the current verbosity level
 */
function shouldLog(currentLevel: VerbosityLevel, requiredLevel: VerbosityLevel): boolean {
  const levels: Record<VerbosityLevel, number> = {
    none: 0,
    minimal: 1,
    normal: 2,
    verbose: 3,
  };

  return levels[currentLevel] >= levels[requiredLevel];
}

/**
 * Logs a message if the verbosity level allows it
 */
function log(message: string, verbosity: VerbosityLevel, requiredLevel: VerbosityLevel): void {
  if (shouldLog(verbosity, requiredLevel)) {
    console.log(message);
  }
}

export async function renderAssetVideos(
  assetName: string,
  asset: Asset,
  assetPath: string,
  options: VideoRenderOptions = {},
): Promise<
  {
    stance: string;
    mediaType: string;
    dataUrl: string;
    filePath: string;
  }[]
> {
  const { fps = 60, duration = 2, logProgress = true, verbosity = 'minimal' } = options;

  // Create temporary directory for frames
  const { path: tempDir, cleanup } = await tmpDir({ unsafeCleanup: true });

  try {
    log(`Rendering videos for asset: ${asset.name}`, verbosity, 'minimal');

    // Process all stances in parallel
    const renderPromises = asset.stances.map((stance) =>
      renderStanceVideo(assetName, asset, assetPath, stance, tempDir, {
        fps,
        duration,
        logProgress,
        verbosity,
      }),
    );

    // Wait for all videos to render
    const results = await Promise.all(renderPromises);

    log(`Completed rendering all videos for asset: ${asset.name}`, verbosity, 'minimal');
    return results;
  } finally {
    // Clean up temporary directory
    try {
      await cleanup();
      log('Temporary files cleaned up', verbosity, 'normal');
    } catch (error) {
      console.error('Error cleaning up temporary files:', error);
    }
  }
}

async function renderStanceVideo(
  assetName: string,
  asset: Asset,
  assetPath: string,
  stance: string,
  tempDir: string,
  options: VideoRenderOptions,
): Promise<{
  stance: string;
  mediaType: string;
  dataUrl: string;
  filePath: string;
}> {
  const { fps = 60, duration = 2, verbosity = 'minimal' } = options;
  const totalFrames = fps * duration;
  const frameDir = path.join(tempDir, stance);

  // Create directory for frames
  await fs.mkdir(frameDir, { recursive: true });

  log(`Rendering video for stance: ${stance}`, verbosity, 'normal');

  // Generate frames
  const framePaths = await generateFrames(asset, frameDir, stance, totalFrames, verbosity);

  // Create output path for video
  const assetDir = path.dirname(assetPath);
  const videoFileName = `${assetName.toLowerCase()}-${stance}.mp4`;
  const videoPath = path.join(assetDir, videoFileName);

  // Create video from frames
  await createVideoFromFrames(framePaths, videoPath, fps, verbosity);

  log(`Video for stance "${stance}" saved to: ${videoPath}`, verbosity, 'minimal');

  const dataUrl = `data:video/mp4;base64,${(await fs.readFile(videoPath)).toString('base64')}`;

  return {
    stance,
    mediaType: 'video/mp4',
    dataUrl,
    filePath: videoPath,
  };
}

/**
 * Generates frames for an animation
 * @param asset The asset to render
 * @param frameDir Directory to save frames
 * @param stance The stance to render
 * @param totalFrames Total number of frames to generate
 * @param verbosity Verbosity level for logging
 * @returns Array of frame file paths
 */
async function generateFrames(
  asset: Asset,
  frameDir: string,
  stance: string,
  totalFrames: number,
  verbosity: VerbosityLevel,
): Promise<string[]> {
  const framePaths: string[] = [];
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');

  log(`Generating ${totalFrames} frames for stance: ${stance}`, verbosity, 'normal');

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
    try {
      asset.render(ctx as any, canvas.width / 2 - 512, canvas.height / 2 - 512, 1024, 1024, progress, stance, 'right');
    } catch {
      // ignore errors, to not spam the console
    }

    // Save frame
    const frameNumber = i.toString().padStart(5, '0');
    const framePath = path.join(frameDir, `frame-${frameNumber}.png`);

    // Convert canvas to buffer and save
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(framePath, buffer);

    framePaths.push(framePath);

    // Log progress only at specific intervals and only if verbosity is sufficient
    if ((i === 0 || i === totalFrames - 1 || i % Math.ceil(totalFrames / 5) === 0) && shouldLog(verbosity, 'normal')) {
      log(`  Generated frame ${i + 1}/${totalFrames} (${Math.round(progress * 100)}%)`, verbosity, 'normal');
    }
  }

  return framePaths;
}

/**
 * Creates a video from frames using videoshow
 * @param framePaths Array of frame file paths
 * @param outputPath Path to save the output video
 * @param fps Frames per second
 * @param verbosity Verbosity level for logging
 */
async function createVideoFromFrames(
  framePaths: string[],
  outputPath: string,
  fps: number,
  verbosity: VerbosityLevel,
): Promise<void> {
  log(`Creating video from ${framePaths.length} frames at ${fps} FPS`, verbosity, 'normal');

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
        log('FFmpeg process started', verbosity, 'verbose');
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
          log(`Processing: ${progress.frames} frames at ${progress.currentFps} FPS`, verbosity, 'verbose');
        },
      )
      .on('error', (err: Error) => {
        console.error('Error creating video:', err);
        reject(err);
      })
      .on('end', () => {
        log('Video creation completed', verbosity, 'normal');
        resolve();
      });
  });
}
