const fs = require('fs')
const path = require('path')
const html = fs.readFileSync(path.join(__dirname, 'wp_metrics.html'), 'utf8')

function extractNumber(regex) {
  const m = html.match(regex)
  return m ? Number(m[1]) : null
}

const tracksDelivered = extractNumber(/<div class="number">([0-9]+)<\/div>/)
const techEvents = extractNumber(/<div class="stat-box tech">[\s\S]*?<div class="number">([0-9]+)<\/div>/)
const nonTech = extractNumber(/<div class="stat-box non-tech">[\s\S]*?<div class="number">([0-9]+)<\/div>/)
const languages = extractNumber(/<div class="stat-box languages">[\s\S]*?<div class="number">([0-9]+)<\/div>/)

const topTracks = []
const trackTitles = Array.from(html.matchAll(/<div class="track-card">[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<span class="session-badge">([0-9]+) Sessions<\/span>/g))
for (const t of trackTitles) {
  const title = t[1].replace(/<[^>]+>/g, '').trim()
  const sessions = Number(t[2])
  if (title) topTracks.push({ title, sessions })
}

const dataPath = path.join(__dirname, 'data.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

const metrics = {
  tracksDelivered: tracksDelivered || (data.events ? data.events.length : 0),
  techEvents: techEvents || 0,
  nonTechEvents: nonTech || 0,
  languagesCovered: languages || 0,
  topTracks
}

data.metrics = metrics
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')
console.log('Imported metrics into backend/data.json')
