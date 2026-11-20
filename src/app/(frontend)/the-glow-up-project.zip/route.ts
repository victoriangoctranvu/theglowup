import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-static'

export async function GET() {
  const archivePath = path.join(process.cwd(), 'public', 'the-glow-up-project.bundle')
  const archive = await readFile(archivePath)

  return new Response(archive, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Content-Disposition': 'attachment; filename="the-glow-up-project.zip"',
      'Content-Length': String(archive.byteLength),
      'Content-Type': 'application/zip',
    },
  })
}
