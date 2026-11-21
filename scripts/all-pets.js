// Run: node scripts/all-pets.js <gallery.html> [out.json]
//
// Turns the omn.sh pet gallery (built in the omn.sh repo with
// `go run ./cmd/petgallery -o <gallery.html>`) into a list of every species,
// stage, gleam and status: [{ species, stage, gleam, status, payload }], where
// payload has the same shape as a /p/<id>.json reply. species is the species
// name, so preview-gags.js and preview-pet-working.js can pick entries with
// --pets Cat:2. Writes all-pets.json next to the gallery by default.
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'

const [src, outArg] = process.argv.slice(2)
if (!src) {
  console.log('usage: node scripts/all-pets.js <gallery.html> [out.json]')
  process.exit(1)
}

const html = readFileSync(src, 'utf8')
// The page carries its data as gzip'd JSON in base64: const DATA = '...'
const lit = html.match(/const DATA = '([A-Za-z0-9+/=]+)'/)
if (!lit) {
  console.error(src + ': no gallery data (const DATA = \'...\') found')
  process.exit(1)
}
const g = JSON.parse(gunzipSync(Buffer.from(lit[1], 'base64')).toString('utf8'))

// The gallery pools each base64 frame once and stores its index in the payload.
const out = g.entries.map((e) => {
  const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
  p.frames = (p.frames || []).map((i) => g.pool[i])
  if (typeof p.chomp === 'number') p.chomp = g.pool[p.chomp]
  return { species: g.species[e.species] || String(e.species), stage: e.stage, gleam: e.gleam, status: e.status, payload: p }
})

const dest = outArg || join(dirname(src), 'all-pets.json')
writeFileSync(dest, JSON.stringify(out))
console.log(`wrote ${dest}: ${out.length} entries, ${out.filter((e) => e.status === 'awake').length} awake`)
