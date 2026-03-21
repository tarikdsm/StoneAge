import { mkdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { serializeMapSlotFile, validateMapSlotFileData } from './src/game/data/levelRepository'

const repoBasePath = '/StoneAge/'
const localMapApiSegment = '__stoneage_local_maps'
const localMapApiPrefixes = [
  `/${localMapApiSegment}/`,
  `${repoBasePath}${localMapApiSegment}/`
]

async function readRequestBody(request: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(`${JSON.stringify(payload)}\n`)
}

function resolveRequestedMapFile(urlPath: string): { fileName: string; slot: number } | undefined {
  for (const prefix of localMapApiPrefixes) {
    if (!urlPath.startsWith(prefix)) {
      continue
    }

    const fileName = urlPath.slice(prefix.length)
    const match = /^map(\d{2})\.json$/i.exec(fileName)
    if (!match) {
      return undefined
    }

    return {
      fileName: `map${match[1]}.json`,
      slot: Number(match[1])
    }
  }

  return undefined
}

function createLocalMapApiPlugin(): Plugin {
  const handleRequest = async (request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> => {
    const requestMethod = request.method?.toUpperCase()
    const requestUrl = request.url?.split('?')[0] ?? ''

    const isLocalApiRoute = localMapApiPrefixes.some((prefix) => requestUrl.startsWith(prefix))
    if (!isLocalApiRoute) {
      next()
      return
    }

    if (requestMethod !== 'PUT') {
      sendJson(response, 405, {
        message: 'Local map editing only supports PUT requests.'
      })
      return
    }

    const requestedFile = resolveRequestedMapFile(requestUrl)
    if (!requestedFile) {
      sendJson(response, 404, {
        message: 'Requested local map slot path was not recognized.'
      })
      return
    }

    try {
      const requestBody = await readRequestBody(request)
      const parsedBody = JSON.parse(requestBody) as unknown
      const validation = validateMapSlotFileData(parsedBody)
      if (!validation.value) {
        sendJson(response, 400, {
          message: validation.errors[0] ?? 'Map file is invalid.'
        })
        return
      }

      if (validation.value.slot !== requestedFile.slot) {
        sendJson(response, 400, {
          message: 'The uploaded slot number does not match the requested file path.'
        })
        return
      }

      const targetPath = path.resolve(process.cwd(), 'public', 'maps', requestedFile.fileName)
      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, serializeMapSlotFile(validation.value), 'utf8')
      sendJson(response, 200, validation.value)
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, {
          message: 'The local map payload was not valid JSON.'
        })
        return
      }

      sendJson(response, 500, {
        message: error instanceof Error ? error.message : 'Unable to write the local map file.'
      })
    }
  }

  return {
    name: 'stoneage-local-map-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleRequest(request, response, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleRequest(request, response, next)
      })
    }
  }
}

export default defineConfig({
  base: repoBasePath,
  plugins: [createLocalMapApiPlugin()],
  build: {
    chunkSizeWarningLimit: 1500
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
})
