import type { Plugin } from 'vite';
import url from 'node:url';
import { register } from 'node:module';
import path from 'path';
import { spawn } from 'child_process';

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

          // Execute the asset-gen command with the asset name and --json flags asynchronously
          const command = 'npm';
          const args = ['exec', '--workspace=@gamedev/generator-core', '--', 'asset-gen', `${assetName}`];
          
          const process = spawn(command, args);
          
          // Collect stdout data
          process.stdout.on('data', (data) => {
            const chunk = data.toString('utf-8');
            console.log('[Generator]', chunk);
          });
          
          // Collect stderr data
          process.stderr.on('data', (data) => {
            const chunk = data.toString('utf-8');
            console.log('[Generator]', chunk);
          });
          
          // Handle process completion
          process.on('close', (code) => {
            console.log(`Asset generation process exited with code ${code}`);
            
            if (code === 0) {
                // Return success response
                res.statusCode = 200;
                res.end(
                  JSON.stringify({
                    success: true,
                    message: 'Asset regenerated successfully',
                  }),
                );
            } else {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  error: 'Failed to regenerate asset',
                }),
              );
            }
          });
          
          // Handle unexpected errors
          process.on('error', (error) => {
            console.error('Error spawning process:', error);
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: 'Failed to start asset generation process',
                message: error.message,
              }),
            );
          });
          
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