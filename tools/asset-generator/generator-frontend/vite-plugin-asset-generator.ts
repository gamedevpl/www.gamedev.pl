import type { Plugin } from 'vite';
import { runAssetGenerationPipeline } from '../generator-core/src/tools/asset-pipeline';
import url from 'node:url';
import { register } from 'node:module';
import path from 'path';

const __filename = url.fileURLToPath(import.meta.url);
register('ts-node/esm', url.pathToFileURL(__filename));

const project = path.resolve('./tsconfig.json');
(await import('ts-node')).register({ project });

/**
 * Vite plugin that exposes an HTTP endpoint to trigger asset regeneration
 */
export function assetGeneratorPlugin(): Plugin {
  return {
    name: 'vite-plugin-asset-generator',
    configureServer(server) {
      // Register the endpoint for asset regeneration
      server.middlewares.use('/api/regenerate-asset', async (req, res) => {
        try {
          // Parse the request body
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          const requestBody = JSON.parse(buffer.toString());

          // Extract the asset name from the request
          const { assetName } = requestBody;
          if (!assetName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Asset name is required' }));
            return;
          }

          console.log(`Regenerating asset: ${assetName}`);

          // Run the asset generation pipeline
          const result = await runAssetGenerationPipeline(assetName, {
            skipVideos: true,
          });

          // Return success response
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              message: 'Asset regenerated successfully',
              assetPath: result.assetPath,
              assessment: result.assessment,
            }),
          );
        } catch (error) {
          console.error('Error regenerating asset:', error);
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: 'Failed to regenerate asset',
              message: (error as Error).message,
            }),
          );
        }
      });
    },
  };
}

export default assetGeneratorPlugin;
