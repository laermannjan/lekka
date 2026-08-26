import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.lekka': 'text/plain',
  '.svg': 'image/svg+xml',
}

const root = process.cwd()
const port = Number(process.env.PORT ?? 8080)

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
  const file = path.startsWith('/rezepte/')
    ? join(root, path)
    : join(root, 'app', path === '/' ? 'index.html' : path)

  if (!file.startsWith(root)) return response.writeHead(403).end()
  try {
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    if (extname(path)) return response.writeHead(404).end('not found')
    const body = await readFile(join(root, 'app', 'index.html'))
    response.writeHead(200, { 'content-type': TYPES['.html'] })
    response.end(body)
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
